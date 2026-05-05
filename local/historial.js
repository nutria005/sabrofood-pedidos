let supabase_client = null;
let todosLosPedidosHistorial = [];
let pedidosFiltradosHistorial = [];
let modoVIPHistorial = false;
let historialFiltroTimeout = null;
const HISTORIAL_PAGE_SIZE = 1000;

function formatoMonedaHistorial(valor) {
  return Math.floor(Number(valor) || 0).toLocaleString('es-CL');
}

function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function obtenerNombreItem(item) {
  return item?.nombre || item?.nombre_producto || item?.producto || 'Producto sin nombre';
}

function obtenerGrupoMetodo(pedido) {
  const metodo = String(pedido?.metodo_pago || pedido?.metodo || 'E').trim().toUpperCase();
  const notas = String(pedido?.notas || '');

  if (metodo === 'PM' || metodo === 'PMP' || notas.includes('PAGO MIXTO:')) return 'mixto';
  if (metodo === 'E' || metodo.includes('EFECTIVO')) return 'efectivo';
  if (['DC', 'D', 'C'].includes(metodo) || metodo.includes('TARJETA')) return 'tarjeta';
  if (['TP', 'T'].includes(metodo)) return 'transferencia_pendiente';
  if (metodo === 'TG') return 'transferencia_pagada';
  if (['PE', 'PC', 'PX', 'P'].includes(metodo)) return 'pagado_local';
  return 'otros';
}

function obtenerEtiquetaMetodo(pedido) {
  const metodo = String(pedido?.metodo_pago || pedido?.metodo || 'E').trim().toUpperCase();
  const etiquetas = {
    E: '💵 Efectivo',
    DC: '💳 Tarjeta',
    D: '💳 Débito',
    C: '💳 Crédito',
    TP: '⏳ Transf. Pend.',
    T: '⏳ Transferencia',
    TG: '✅ Transf. Pagada',
    P: '💰 Pagado',
    PE: '🏪 Pagado Local - Efectivo',
    PC: '🏪 Pagado Local - Tarjeta',
    PX: '🏪 Pagado Local - Mixto',
    PM: '💰 Mixto - Pendiente',
    PMP: '✅ Mixto - Pagado'
  };
  return etiquetas[metodo] || `❓ ${metodo}`;
}

function obtenerEstadoPedido(pedido) {
  if (pedido?.estado === 'ANULADO') return 'anulado';
  if (pedido?.entregado) return 'entregado';
  return 'pendiente';
}

function obtenerClaseEstado(estado) {
  if (estado === 'anulado') return 'anulado';
  if (estado === 'entregado') return 'entregado';
  return 'pendiente';
}

function obtenerTextoEstado(estado) {
  if (estado === 'anulado') return 'Anulado';
  if (estado === 'entregado') return 'Entregado';
  return 'Pendiente';
}

async function verificarPermisoHistorial() {
  const { data: { user } } = await supabase_client.auth.getUser();
  if (!user) {
    window.location.href = '../index.html';
    return false;
  }
  if (!ROLES_CONFIG.esAdmin(user.email)) {
    alert('❌ No tienes permisos para acceder al historial completo');
    await supabaseLogout();
    window.location.href = '../index.html';
    return false;
  }
  return true;
}

function mostrarLoading(texto = 'Cargando historial completo...') {
  const loading = document.getElementById('historialLoadingState');
  const wrap = document.getElementById('historialTablaWrap');
  loading.hidden = false;
  loading.textContent = texto;
  wrap.hidden = true;
}

function ocultarLoading() {
  document.getElementById('historialLoadingState').hidden = true;
  document.getElementById('historialTablaWrap').hidden = false;
}

function actualizarResumenResultados() {
  const fechaDesde = document.getElementById('fechaDesde').value;
  const fechaHasta = document.getElementById('fechaHasta').value;
  document.getElementById('historialResultadosTexto').textContent = `Mostrando ${pedidosFiltradosHistorial.length.toLocaleString('es-CL')} pedido(s) de ${todosLosPedidosHistorial.length.toLocaleString('es-CL')} cargado(s)`;
  if (fechaDesde || fechaHasta) {
    document.getElementById('historialPeriodoTexto').textContent = `Período: ${fechaDesde || 'inicio'} a ${fechaHasta || 'hoy'}`;
  } else {
    document.getElementById('historialPeriodoTexto').textContent = 'Período: Todo el historial';
  }
}

async function obtenerTodosLosPedidos(fechaDesde, fechaHasta) {
  let desde = 0;
  let pedidos = [];

  while (true) {
    let query = supabase_client
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false })
      .range(desde, desde + HISTORIAL_PAGE_SIZE - 1);

    if (fechaDesde) query = query.gte('created_at', `${fechaDesde}T00:00:00`);
    if (fechaHasta) query = query.lte('created_at', `${fechaHasta}T23:59:59`);

    const { data, error } = await query;
    if (error) throw error;

    const bloque = data || [];
    pedidos = pedidos.concat(bloque);
    if (bloque.length < HISTORIAL_PAGE_SIZE) break;
    desde += HISTORIAL_PAGE_SIZE;
  }

  return pedidos;
}

async function cargarHistorial() {
  try {
    const fechaDesde = document.getElementById('fechaDesde').value;
    const fechaHasta = document.getElementById('fechaHasta').value;
    mostrarLoading(fechaDesde || fechaHasta ? 'Cargando historial filtrado por fechas...' : 'Cargando todo el historial...');
    todosLosPedidosHistorial = await obtenerTodosLosPedidos(fechaDesde, fechaHasta);
    aplicarFiltrosHistorial();
  } catch (error) {
    console.error('❌ Error cargando historial:', error);
    mostrarLoading('No se pudo cargar el historial completo.');
  }
}

function actualizarEstadisticas() {
  const totalPedidos = pedidosFiltradosHistorial.length;
  const totalRecaudado = pedidosFiltradosHistorial.reduce((sum, pedido) => sum + (Number(pedido.total) || 0), 0);
  const clientesUnicos = new Set(
    pedidosFiltradosHistorial
      .map((pedido) => pedido.telefono || pedido.nombre || '')
      .filter(Boolean)
  ).size;
  const ticketPromedio = totalPedidos > 0 ? Math.round(totalRecaudado / totalPedidos) : 0;

  document.getElementById('statTotalPedidos').textContent = totalPedidos.toLocaleString('es-CL');
  document.getElementById('statTotalRecaudado').textContent = `$${formatoMonedaHistorial(totalRecaudado)}`;
  document.getElementById('statClientesUnicos').textContent = clientesUnicos.toLocaleString('es-CL');
  document.getElementById('statTicketPromedio').textContent = `$${formatoMonedaHistorial(ticketPromedio)}`;
}

function renderTopProductos() {
  const contenedor = document.getElementById('listaTopProductos');
  const conteo = {};

  pedidosFiltradosHistorial.forEach((pedido) => {
    if (!Array.isArray(pedido.items)) return;
    pedido.items.forEach((item) => {
      const nombreVisible = obtenerNombreItem(item);
      const clave = normalizarTexto(nombreVisible);
      const esGranel = normalizarTexto(nombreVisible).includes('granel');

      if (!conteo[clave]) {
        conteo[clave] = { nombre: nombreVisible, cantidad: 0, ventas: 0, esGranel };
      }

      if (esGranel) {
        conteo[clave].cantidad += 1;
        conteo[clave].ventas += Number(item.cantidad) || 0;
      } else {
        const cantidad = Number(item.cantidad) || 1;
        conteo[clave].cantidad += cantidad;
        conteo[clave].ventas += cantidad * (Number(item.precio) || 0);
      }
    });
  });

  const top = Object.values(conteo)
    .sort((a, b) => b.ventas - a.ventas)
    .slice(0, 5);

  if (!top.length) {
    contenedor.innerHTML = '<div class="historial-empty">No hay productos en el período seleccionado.</div>';
    return;
  }

  const medallas = ['🥇', '🥈', '🥉', '4', '5'];
  contenedor.innerHTML = top.map((producto, index) => `
    <article class="historial-top-card rank-${index + 1}">
      <div class="historial-top-head">
        <div class="historial-top-medal">${medallas[index] || index + 1}</div>
        <div>
          <div class="historial-top-name">${escaparHtml(producto.nombre)}</div>
          <div class="historial-top-meta">Posición #${index + 1}</div>
        </div>
      </div>
      <div class="historial-top-stats">
        <div>
          <span>${producto.esGranel ? 'Pedidos' : 'Unidades'}</span>
          <strong>${formatoMonedaHistorial(producto.cantidad)}</strong>
        </div>
        <div>
          <span>Ventas</span>
          <strong>$${formatoMonedaHistorial(producto.ventas)}</strong>
        </div>
      </div>
    </article>
  `).join('');
}

function renderVistaCronologica() {
  const contenedor = document.getElementById('historialContenido');
  document.getElementById('historialVistaTitulo').textContent = 'Vista Cronológica';
  document.getElementById('historialVistaDescripcion').textContent = 'Pedidos completos con datos de cliente, cobro y estado.';

  if (!pedidosFiltradosHistorial.length) {
    contenedor.innerHTML = '<div class="historial-empty">No se encontraron pedidos con los filtros actuales.</div>';
    return;
  }

  contenedor.innerHTML = `
    <table class="historial-table">
      <thead>
        <tr>
          <th class="historial-col-fecha">Fecha</th>
          <th>Cliente</th>
          <th class="historial-col-telefono">Teléfono</th>
          <th>Productos</th>
          <th class="historial-col-total">Total</th>
          <th class="historial-col-pago">Pago</th>
          <th class="historial-col-estado">Estado</th>
        </tr>
      </thead>
      <tbody>
        ${pedidosFiltradosHistorial.map((pedido) => {
          const fecha = pedido.created_at
            ? new Date(pedido.created_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '-';
          const productos = Array.isArray(pedido.items)
            ? pedido.items.map((item) => {
              const nombre = obtenerNombreItem(item);
              const esGranel = normalizarTexto(nombre).includes('granel');
              if (esGranel) {
                return `${escaparHtml(nombre)} ($${formatoMonedaHistorial(item.cantidad || 0)})`;
              }
              return `${escaparHtml(nombre)} (${Number(item.cantidad) || 1}x)`;
            }).join(', ')
            : 'Sin productos';
          const estado = obtenerEstadoPedido(pedido);
          return `
            <tr>
              <td>${fecha}</td>
              <td>
                <div class="historial-cliente-nombre">${escaparHtml(pedido.nombre || 'Sin nombre')}</div>
                ${pedido.direccion ? `<div class="historial-subline">📍 ${escaparHtml(pedido.direccion)}</div>` : ''}
                ${pedido.notas ? `<div class="historial-subline">📝 ${escaparHtml(pedido.notas)}</div>` : ''}
              </td>
              <td>${escaparHtml(pedido.telefono || '-')}</td>
              <td>${productos}</td>
              <td class="historial-total">$${formatoMonedaHistorial(pedido.total || 0)}</td>
              <td>${escaparHtml(obtenerEtiquetaMetodo(pedido))}</td>
              <td><span class="historial-badge ${obtenerClaseEstado(estado)}">${obtenerTextoEstado(estado)}</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderRankingVIP() {
  const contenedor = document.getElementById('historialContenido');
  document.getElementById('historialVistaTitulo').textContent = 'Ranking VIP';
  document.getElementById('historialVistaDescripcion').textContent = 'Clientes agrupados por teléfono y ordenados por compras acumuladas.';

  const clientes = {};
  pedidosFiltradosHistorial.forEach((pedido) => {
    const clave = pedido.telefono || `sin-telefono-${pedido.nombre || 'cliente'}`;
    if (!clientes[clave]) {
      clientes[clave] = {
        nombre: pedido.nombre || 'Sin nombre',
        telefono: pedido.telefono || '-',
        totalCompras: 0,
        cantidadPedidos: 0,
        ultimoPedido: pedido.created_at || pedido.fecha || null
      };
    }
    clientes[clave].totalCompras += Number(pedido.total) || 0;
    clientes[clave].cantidadPedidos += 1;
    if (pedido.created_at && new Date(pedido.created_at) > new Date(clientes[clave].ultimoPedido || 0)) {
      clientes[clave].ultimoPedido = pedido.created_at;
      clientes[clave].nombre = pedido.nombre || clientes[clave].nombre;
    }
  });

  const ranking = Object.values(clientes).sort((a, b) => b.totalCompras - a.totalCompras);
  if (!ranking.length) {
    contenedor.innerHTML = '<div class="historial-empty">No se encontraron clientes con los filtros actuales.</div>';
    return;
  }

  contenedor.innerHTML = `
    <table class="historial-table">
      <thead>
        <tr>
          <th style="width:90px;">Rank</th>
          <th>Cliente</th>
          <th class="historial-col-telefono">Teléfono</th>
          <th style="width:110px;">Pedidos</th>
          <th class="historial-col-total">Total Compras</th>
          <th class="historial-col-total">Ticket Prom.</th>
          <th class="historial-col-fecha">Último Pedido</th>
        </tr>
      </thead>
      <tbody>
        ${ranking.map((cliente, index) => {
          const ticket = cliente.cantidadPedidos > 0 ? Math.round(cliente.totalCompras / cliente.cantidadPedidos) : 0;
          const ultimoPedido = cliente.ultimoPedido
            ? new Date(cliente.ultimoPedido).toLocaleDateString('es-CL')
            : '-';
          return `
            <tr>
              <td>${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}</td>
              <td class="historial-cliente-nombre">${escaparHtml(cliente.nombre)}</td>
              <td>${escaparHtml(cliente.telefono)}</td>
              <td>${cliente.cantidadPedidos.toLocaleString('es-CL')}</td>
              <td class="historial-total">$${formatoMonedaHistorial(cliente.totalCompras)}</td>
              <td>$${formatoMonedaHistorial(ticket)}</td>
              <td>${ultimoPedido}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function aplicarFiltrosHistorial() {
  const busqueda = normalizarTexto(document.getElementById('buscarHistorial').value);
  const filtroMetodo = document.getElementById('filtroMetodoHistorial').value;
  const filtroEstado = document.getElementById('filtroEstadoHistorial').value;

  pedidosFiltradosHistorial = todosLosPedidosHistorial.filter((pedido) => {
    const grupoMetodo = obtenerGrupoMetodo(pedido);
    const estado = obtenerEstadoPedido(pedido);
    if (filtroMetodo !== 'todos' && grupoMetodo !== filtroMetodo) return false;
    if (filtroEstado !== 'todos' && estado !== filtroEstado) return false;
    if (!busqueda) return true;

    const productos = Array.isArray(pedido.items)
      ? pedido.items.map((item) => `${obtenerNombreItem(item)} ${item.cantidad || ''}`).join(' ')
      : '';
    const fechaTexto = pedido.created_at ? new Date(pedido.created_at).toLocaleString('es-CL') : '';
    const textoCompleto = normalizarTexto([
      pedido.nombre,
      pedido.telefono,
      pedido.direccion,
      pedido.notas,
      pedido.metodo_pago,
      pedido.estado,
      productos,
      fechaTexto
    ].join(' '));

    return textoCompleto.includes(busqueda);
  });

  actualizarResumenResultados();
  actualizarEstadisticas();
  renderTopProductos();
  if (modoVIPHistorial) {
    renderRankingVIP();
  } else {
    renderVistaCronologica();
  }
  ocultarLoading();
}

function toggleModoVIP() {
  modoVIPHistorial = !modoVIPHistorial;
  const btn = document.getElementById('btnToggleVIP');
  if (modoVIPHistorial) {
    btn.textContent = 'Vista Cronológica';
    btn.classList.remove('accent');
    btn.classList.add('secondary');
    renderRankingVIP();
  } else {
    btn.textContent = 'Ranking VIP';
    btn.classList.remove('secondary');
    btn.classList.add('accent');
    renderVistaCronologica();
  }
}

function exportarCSV() {
  if (!pedidosFiltradosHistorial.length) {
    alert('No hay datos para exportar.');
    return;
  }
  const filas = [
    ['Fecha', 'Cliente', 'Telefono', 'Total', 'Metodo', 'Estado', 'Direccion', 'Productos', 'Notas'],
    ...pedidosFiltradosHistorial.map((pedido) => [
      pedido.created_at ? new Date(pedido.created_at).toLocaleString('es-CL') : '',
      pedido.nombre || '',
      pedido.telefono || '',
      pedido.total || 0,
      pedido.metodo_pago || pedido.metodo || '',
      obtenerTextoEstado(obtenerEstadoPedido(pedido)),
      pedido.direccion || '',
      Array.isArray(pedido.items) ? pedido.items.map((item) => `${obtenerNombreItem(item)} (${item.cantidad || 1})`).join(' | ') : '',
      pedido.notas || ''
    ])
  ];

  const csv = filas
    .map((fila) => fila.map((valor) => `"${String(valor ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `historial_reparto_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

function limpiarFiltros() {
  document.getElementById('buscarHistorial').value = '';
  document.getElementById('filtroMetodoHistorial').value = 'todos';
  document.getElementById('filtroEstadoHistorial').value = 'todos';
  document.getElementById('fechaDesde').value = '';
  document.getElementById('fechaHasta').value = '';
  cargarHistorial();
}

function conectarEventos() {
  document.getElementById('buscarHistorial').addEventListener('input', () => {
    clearTimeout(historialFiltroTimeout);
    historialFiltroTimeout = setTimeout(aplicarFiltrosHistorial, 180);
  });
  document.getElementById('filtroMetodoHistorial').addEventListener('change', aplicarFiltrosHistorial);
  document.getElementById('filtroEstadoHistorial').addEventListener('change', aplicarFiltrosHistorial);
  document.getElementById('btnAplicarFiltroFecha').addEventListener('click', cargarHistorial);
  document.getElementById('btnLimpiarFiltros').addEventListener('click', limpiarFiltros);
  document.getElementById('btnToggleVIP').addEventListener('click', toggleModoVIP);
  document.getElementById('btnExportarHistorialCompleto').addEventListener('click', exportarCSV);
  document.getElementById('btnCerrarSesionHistorial').addEventListener('click', async () => {
    await supabaseLogout();
    window.location.href = '../index.html';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    supabase_client = inicializarSupabase();
    if (!supabase_client) {
      alert('No se pudo inicializar Supabase.');
      return;
    }

    const tienePermiso = await verificarPermisoHistorial();
    if (!tienePermiso) return;

    conectarEventos();
    await cargarHistorial();
  } catch (error) {
    console.error('❌ Error inicializando historial:', error);
    mostrarLoading('Error inicializando el historial.');
  }
});
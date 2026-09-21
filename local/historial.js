// ============================================
// HISTORIAL COMPLETO — Sabrofood Reparto (v3)
// Rediseño 20-09-2026: filtros rápidos, orden
// por columnas, paginación visual, drill-down
// de cliente/pedido y gráficos CSS.
// ============================================

let supabase_client = null;
let todosLosPedidosHistorial = [];
let pedidosFiltradosHistorial = [];
let vistaActual = 'cronologico';      // 'cronologico' | 'vip'
let paginaActual = 1;
let ordenCol = 'fecha';               // fecha | cliente | telefono | total | metodo | estado | pedidos | ticket
let ordenDir = 'desc';
let clienteFiltroActivo = null;       // { tipo:'tel'|'nombre', valor, etiqueta }
let filaExpandidaId = null;
let historialFiltroTimeout = null;

const HISTORIAL_PAGE_SIZE = 1000;     // lote de consulta a la BD
const PAGE_SIZE = 50;                 // filas por página visual

const MAPA_METODOS = {
  efectivo: { label: '💵 Efectivo', color: '#10b981' },
  tarjeta: { label: '💳 Tarjeta', color: '#3b82f6' },
  mixto: { label: '💰 Mixto', color: '#a855f7' },
  transferencia_pendiente: { label: '⏳ Transf. Pend.', color: '#f59e0b' },
  transferencia_pagada: { label: '✅ Transf. Pagada', color: '#059669' },
  pagado_local: { label: '🏪 Pagado Local', color: '#ec4899' },
  otros: { label: '❓ Otros', color: '#94a3b8' }
};

const MAPA_RUTA = { A: '🔴 Ruta A', B: '🟡 Ruta B', C: '🟢 Ruta C' };

// ---------- Utilidades ----------

function formatoMonedaHistorial(valor) {
  return Math.floor(Number(valor) || 0).toLocaleString('es-CL');
}

function formatoMontoCorto(valor) {
  const n = Number(valor) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.floor(n));
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

function esGranelItem(item) {
  return normalizarTexto(obtenerNombreItem(item)).includes('granel');
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
  if (estado === 'anulado') return '🚫 Anulado';
  if (estado === 'entregado') return '✅ Entregado';
  return '⏳ Pendiente';
}

function formatearFecha(fecha, conHora = true) {
  if (!fecha) return '-';
  const d = new Date(fecha);
  if (isNaN(d)) return '-';
  const opciones = { day: '2-digit', month: '2-digit', year: 'numeric' };
  if (conHora) { opciones.hour = '2-digit'; opciones.minute = '2-digit'; }
  return d.toLocaleString('es-CL', opciones);
}

// ---------- Permisos / estado inicial ----------

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

// ---------- Carga de datos ----------

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
    paginaActual = 1;
    filaExpandidaId = null;
    aplicarFiltrosHistorial();
  } catch (error) {
    console.error('❌ Error cargando historial:', error);
    mostrarLoading('No se pudo cargar el historial completo.');
  }
}

// ---------- Filtros ----------

function aplicarFiltrosHistorial() {
  const busqueda = normalizarTexto(document.getElementById('buscarHistorial').value);
  const filtroMetodo = document.getElementById('filtroMetodoHistorial').value;
  const filtroEstado = document.getElementById('filtroEstadoHistorial').value;

  pedidosFiltradosHistorial = todosLosPedidosHistorial.filter((pedido) => {
    const grupoMetodo = obtenerGrupoMetodo(pedido);
    const estado = obtenerEstadoPedido(pedido);
    if (filtroMetodo !== 'todos' && grupoMetodo !== filtroMetodo) return false;
    if (filtroEstado !== 'todos' && estado !== filtroEstado) return false;

    if (clienteFiltroActivo) {
      const coincide = clienteFiltroActivo.tipo === 'tel'
        ? String(pedido.telefono || '') === clienteFiltroActivo.valor
        : String(pedido.nombre || '') === clienteFiltroActivo.valor;
      if (!coincide) return false;
    }

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

  paginaActual = 1;
  citarDetalle();
  actualizarResumenResultados();
  actualizarEstadisticas();
  renderTopProductos();
  renderGraficos();
  renderVistaActual();
  ocultarLoading();
}

// ---------- Períodos rápidos ----------

function fechaInput(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function periodoFechas(periodo) {
  const hoy = new Date();
  switch (periodo) {
    case 'hoy':
      return { desde: fechaInput(hoy), hasta: fechaInput(hoy) };
    case 'ayer': {
      const ayer = new Date(hoy);
      ayer.setDate(ayer.getDate() - 1);
      return { desde: fechaInput(ayer), hasta: fechaInput(ayer) };
    }
    case '7d': {
      const ini = new Date(hoy);
      ini.setDate(ini.getDate() - 6);
      return { desde: fechaInput(ini), hasta: fechaInput(hoy) };
    }
    case 'mes':
      return { desde: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`, hasta: fechaInput(hoy) };
    case 'anio':
      return { desde: `${hoy.getFullYear()}-01-01`, hasta: fechaInput(hoy) };
    default:
      return { desde: '', hasta: '' };
  }
}

function aplicarPeriodoRapido(periodo) {
  const { desde, hasta } = periodoFechas(periodo);
  document.getElementById('fechaDesde').value = desde;
  document.getElementById('fechaHasta').value = hasta;
  document.querySelectorAll('.historial-chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.periodo === periodo);
  });
  cargarHistorial();
}

// ---------- Drill-down de cliente ----------

function actualizarChipCliente() {
  const chip = document.getElementById('historialDrillChip');
  if (!clienteFiltroActivo) {
    chip.style.display = 'none';
    chip.innerHTML = '';
    return;
  }
  chip.style.display = 'inline-flex';
  chip.innerHTML = `🔍 Cliente: <strong>${escaparHtml(clienteFiltroActivo.etiqueta)}</strong> <button type="button" title="Quitar filtro de cliente" aria-label="Quitar filtro de cliente">✕</button>`;
  chip.querySelector('button').addEventListener('click', () => {
    clienteFiltroActivo = null;
    actualizarChipCliente();
    aplicarFiltrosHistorial();
  });
}

function filtrarPorCliente(pedido) {
  const tel = String(pedido?.telefono || '').trim();
  const nombre = String(pedido?.nombre || '').trim();
  clienteFiltroActivo = tel
    ? { tipo: 'tel', valor: tel, etiqueta: nombre || tel }
    : { tipo: 'nombre', valor: nombre, etiqueta: nombre || 'Cliente sin identificar' };
  actualizarChipCliente();
  aplicarFiltrosHistorial();
}

function citarDetalle() {
  filaExpandidaId = null;
}

// ---------- Orden por columnas ----------

function compararOrden(a, b, col, dir) {
  let va, vb;
  if (col === 'fecha') { va = a.created_at || ''; vb = b.created_at || ''; }
  else if (col === 'cliente') { va = normalizarTexto(a.nombre); vb = normalizarTexto(b.nombre); }
  else if (col === 'telefono') { va = String(a.telefono || ''); vb = String(b.telefono || ''); }
  else if (col === 'total') { va = Number(a.total) || 0; vb = Number(b.total) || 0; }
  else if (col === 'metodo') { va = obtenerGrupoMetodo(a); vb = obtenerGrupoMetodo(b); }
  else { va = obtenerTextoEstado(obtenerEstadoPedido(a)); vb = obtenerTextoEstado(obtenerEstadoPedido(b)); }

  if (va < vb) return dir === 'asc' ? -1 : 1;
  if (va > vb) return dir === 'asc' ? 1 : -1;
  return 0;
}

function ordenarLista(lista) {
  return [...lista].sort((a, b) => compararOrden(a, b, ordenCol, ordenDir));
}

function toggleOrden(col) {
  if (ordenCol === col) {
    ordenDir = ordenDir === 'asc' ? 'desc' : 'asc';
  } else {
    ordenCol = col;
    ordenDir = (col === 'fecha' || col === 'total' || col === 'telefono' || col === 'pedidos' || col === 'ticket') ? 'desc' : 'asc';
  }
  paginaActual = 1;
  renderVistaActual();
}

function flechaOrden(col) {
  if (ordenCol !== col) return '<span class="sort-arrows">↕</span>';
  return `<span class="sort-arrows">${ordenDir === 'asc' ? '▲' : '▼'}</span>`;
}

function configurarOrdenTabla() {
  document.querySelectorAll('#historialContenido th[data-orden]').forEach((th) => {
    th.addEventListener('click', () => toggleOrden(th.dataset.orden));
  });
}

// ---------- Resumen y estadísticas ----------

function actualizarResumenResultados() {
  const fechaDesde = document.getElementById('fechaDesde').value;
  const fechaHasta = document.getElementById('fechaHasta').value;
  document.getElementById('historialResultadosTexto').textContent =
    `Mostrando ${pedidosFiltradosHistorial.length.toLocaleString('es-CL')} pedido(s) de ${todosLosPedidosHistorial.length.toLocaleString('es-CL')} cargado(s)`;
  if (fechaDesde || fechaHasta) {
    document.getElementById('historialPeriodoTexto').textContent = `Período: ${fechaDesde || 'inicio'} → ${fechaHasta || 'hoy'}`;
  } else {
    document.getElementById('historialPeriodoTexto').textContent = 'Período: Todo el historial';
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

// ---------- Top 5 ----------

function renderTopProductos() {
  const contenedor = document.getElementById('listaTopProductos');
  const conteo = {};

  pedidosFiltradosHistorial.forEach((pedido) => {
    if (!Array.isArray(pedido.items)) return;
    pedido.items.forEach((item) => {
      const nombreVisible = obtenerNombreItem(item);
      const clave = normalizarTexto(nombreVisible);
      const granel = esGranelItem(item);

      if (!conteo[clave]) {
        conteo[clave] = { nombre: nombreVisible, cantidad: 0, ventas: 0, esGranel: granel };
      }

      if (granel) {
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

// ---------- Gráficos ----------

function renderGraficos() {
  renderGraficoVentasDias();
  renderGraficoMetodo();
}

function renderGraficoVentasDias() {
  const contenedor = document.getElementById('graficoVentasDias');
  const mapa = {};

  pedidosFiltradosHistorial.forEach((pedido) => {
    if (!pedido.created_at) return;
    const d = new Date(pedido.created_at);
    if (isNaN(d)) return;
    const clave = fechaInput(d);
    mapa[clave] = (mapa[clave] || 0) + (Number(pedido.total) || 0);
  });

  const fechas = Object.keys(mapa).sort();
  if (!fechas.length) {
    contenedor.innerHTML = '<div class="historial-chart-empty">Sin ventas en el rango seleccionado.</div>';
    return;
  }

  const ventana = fechas.slice(-14);
  const max = Math.max(...ventana.map((f) => mapa[f]), 1);

  contenedor.innerHTML = `<div class="historial-bars-dias">
    ${ventana.map((f) => {
      const val = mapa[f];
      const pct = Math.max(3, Math.round((val / max) * 100));
      const label = `${f.slice(8, 10)}/${f.slice(5, 7)}`;
      return `
        <div class="historial-bar-dia" title="${f} · $${formatoMonedaHistorial(val)}">
          <div class="bar" style="height:${pct}%">
            <span class="bar-val">$${formatoMontoCorto(val)}</span>
          </div>
          <span class="bar-label">${label}</span>
        </div>`;
    }).join('')}
  </div>`;
}

function renderGraficoMetodo() {
  const contenedor = document.getElementById('graficoMetodo');
  const grupos = {};

  pedidosFiltradosHistorial.forEach((pedido) => {
    const g = obtenerGrupoMetodo(pedido);
    grupos[g] = (grupos[g] || 0) + (Number(pedido.total) || 0);
  });

  const total = Object.values(grupos).reduce((a, b) => a + b, 0);
  if (!total) {
    contenedor.innerHTML = '<div class="historial-chart-empty">Sin recaudación en el rango seleccionado.</div>';
    return;
  }

  const orden = Object.entries(grupos)
    .sort((a, b) => b[1] - a[1]);

  contenedor.innerHTML = `<div class="historial-bars-metodo">
    ${orden.map(([grupo, monto]) => {
      const meta = MAPA_METODOS[grupo] || MAPA_METODOS.otros;
      const pct = Math.round((monto / total) * 100);
      return `
        <div class="historial-bar-metodo">
          <div class="hm-head">
            <span>${meta.label}</span>
            <span class="hm-monto">$${formatoMonedaHistorial(monto)} (${pct}%)</span>
          </div>
          <div class="hm-track">
            <div class="hm-fill" style="width:${pct}%;background:${meta.color};"></div>
          </div>
        </div>`;
    }).join('')}
  </div>`;
}

// ---------- Vista cronológica ----------

function celdaCliente(pedido) {
  const nombre = pedido.nombre || 'Sin nombre';
  const tel = String(pedido.telefono || '').trim();
  let html = `<div class="historial-cliente-nombre historial-cliente-link" data-filtrar-cliente="1">${escaparHtml(nombre)}</div>`;
  if (tel) html += `<div class="historial-subline">📱 ${escaparHtml(tel)}</div>`;
  if (pedido.direccion) html += `<div class="historial-subline">📍 ${escaparHtml(pedido.direccion)}</div>`;
  if (pedido.notas) html += `<div class="historial-subline">📝 ${escaparHtml(pedido.notas)}</div>`;
  return html;
}

function celdaProductos(pedido) {
  if (!Array.isArray(pedido.items) || !pedido.items.length) return 'Sin productos';
  const lineas = pedido.items.slice(0, 3).map((item) => {
    const nombre = obtenerNombreItem(item);
    if (esGranelItem(item)) return `${escaparHtml(nombre)} ($${formatoMonedaHistorial(item.cantidad || 0)})`;
    return `${escaparHtml(nombre)} (${Number(item.cantidad) || 1}x)`;
  });
  let html = lineas.join(', ');
  if (pedido.items.length > 3) html += ` <strong>+${pedido.items.length - 3} más</strong>`;
  return html;
}

function renderVistaCronologica() {
  const contenedor = document.getElementById('historialContenido');
  document.getElementById('historialVistaTitulo').textContent = '📜 Vista Cronológica';
  document.getElementById('historialVistaDescripcion').textContent = 'Pedidos completos con datos de cliente, cobro y estado. Clic en una fila o en el nombre del cliente para explorar.';

  if (!pedidosFiltradosHistorial.length) {
    contenedor.innerHTML = '<div class="historial-empty">No se encontraron pedidos con los filtros actuales.</div>';
    actualizarPaginacion(0, 'pedido(s)');
    return;
  }

  const lista = ordenarLista(pedidosFiltradosHistorial);
  const inicio = (paginaActual - 1) * PAGE_SIZE;
  const pagina = lista.slice(inicio, inicio + PAGE_SIZE);
  const expandido = filaExpandidaId;

  let html = `
    <table class="historial-table">
      <thead>
        <tr>
          <th class="historial-col-fecha" data-orden="fecha">Fecha ${flechaOrden('fecha')}</th>
          <th data-orden="cliente">Cliente ${flechaOrden('cliente')}</th>
          <th class="historial-col-telefono" data-orden="telefono">Teléfono ${flechaOrden('telefono')}</th>
          <th>Productos</th>
          <th class="historial-col-total" data-orden="total">Total ${flechaOrden('total')}</th>
          <th class="historial-col-pago" data-orden="metodo">Pago ${flechaOrden('metodo')}</th>
          <th class="historial-col-estado" data-orden="estado">Estado ${flechaOrden('estado')}</th>
        </tr>
      </thead>
      <tbody>`;

  pagina.forEach((pedido) => {
    const estado = obtenerEstadoPedido(pedido);
    const grupoMetodo = obtenerGrupoMetodo(pedido);
    const filaDetalle = expandido === pedido.id ? detallePedidoHtml(pedido) : '';
    html += `
      <tr class="fila-pedido ${expandido === pedido.id ? 'is-expanded' : ''}" data-pedido-id="${escaparHtml(pedido.id)}">
        <td>${formatearFecha(pedido.created_at)}</td>
        <td>${celdaCliente(pedido)}</td>
        <td>${escaparHtml(pedido.telefono || '-')}</td>
        <td>${celdaProductos(pedido)}</td>
        <td class="historial-total">$${formatoMonedaHistorial(pedido.total || 0)}</td>
        <td><span class="historial-badge ${grupoMetodo}">${escaparHtml(obtenerEtiquetaMetodo(pedido))}</span></td>
        <td><span class="historial-badge ${obtenerClaseEstado(estado)}">${obtenerTextoEstado(estado)}</span></td>
      </tr>
      ${filaDetalle}`;
  });

  html += '</tbody></table>';
  contenedor.innerHTML = html;

  // Eventos
  contenedor.querySelectorAll('.fila-pedido').forEach((fila) => {
    fila.addEventListener('click', () => toggleFilaDetalle(fila.dataset.pedidoId));
  });
  contenedor.querySelectorAll('[data-filtrar-cliente]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const fila = el.closest('.fila-pedido');
      const pedido = pedidosFiltradosHistorial.find((p) => String(p.id) === fila.dataset.pedidoId);
      if (pedido) filtrarPorCliente(pedido);
    });
  });
  contenedor.querySelectorAll('[data-filtrar-cliente-detalle]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const pedido = pedidosFiltradosHistorial.find((p) => String(p.id) === el.dataset.pedidoId);
      if (pedido) filtrarPorCliente(pedido);
    });
  });

  configurarOrdenTabla();
  actualizarPaginacion(pedidosFiltradosHistorial.length, 'pedido(s)');
}

function toggleFilaDetalle(id) {
  if (filaExpandidaId === id) {
    filaExpandidaId = null;
  } else {
    filaExpandidaId = id;
  }
  renderVistaCronologica();
}

function detallePedidoHtml(pedido) {
  const estado = obtenerEstadoPedido(pedido);
  const grupoMetodo = obtenerGrupoMetodo(pedido);
  const items = Array.isArray(pedido.items) && pedido.items.length
    ? pedido.items.map((item) => {
        const nombre = obtenerNombreItem(item);
        if (esGranelItem(item)) {
          return `<div class="historial-detail-item">
            <span class="di-nombre">⚖️ ${escaparHtml(nombre)}</span>
            <span class="di-importe">$${formatoMonedaHistorial(item.cantidad || 0)}</span>
          </div>`;
        }
        const cantidad = Number(item.cantidad) || 1;
        const precio = Number(item.precio) || 0;
        return `<div class="historial-detail-item">
          <span class="di-nombre">${escaparHtml(nombre)} <small>× ${cantidad}</small></span>
          <span class="di-importe">$${formatoMonedaHistorial(cantidad * precio)}</span>
        </div>`;
      }).join('')
    : '<div class="historial-empty" style="padding:10px;">Sin productos registrados.</div>';

  const asignado = pedido.asignado_a
    ? `🚚 ${String(pedido.asignado_a).replace('repartidor_', 'Repartidor ')}`
    : '';
  const ruta = pedido.prioridad
    ? (MAPA_RUTA[String(pedido.prioridad).toUpperCase()] || `${pedido.prioridad}`)
    : '';

  return `
    <tr class="historial-detail-row">
      <td colspan="7">
        <div class="historial-detail-grid">
          <div class="historial-detail-col">
            <h4>👤 Cliente</h4>
            <div class="historial-detail-meta">
              <span><strong>${escaparHtml(pedido.nombre || 'Sin nombre')}</strong></span>
              <span>📱 ${escaparHtml(pedido.telefono || '-')}</span>
              <span>📍 ${escaparHtml(pedido.direccion || '-')}</span>
              ${ruta ? `<span>${ruta}</span>` : ''}
              ${asignado ? `<span>${asignado}</span>` : ''}
            </div>
          </div>
          <div class="historial-detail-col" style="grid-column: span 1;">
            <h4>🛒 Productos</h4>
            <div class="historial-detail-items">${items}</div>
          </div>
          <div class="historial-detail-col">
            <h4>💰 Cobro</h4>
            <div class="historial-detail-meta">
              <span class="historial-badge ${grupoMetodo}">${escaparHtml(obtenerEtiquetaMetodo(pedido))}</span>
              <span class="historial-badge ${obtenerClaseEstado(estado)}">${obtenerTextoEstado(estado)}</span>
              <span style="font-size:1.25rem;font-weight:800;color:#059669;">$${formatoMonedaHistorial(pedido.total || 0)}</span>
              <span style="color:#64748b;font-size:0.85rem;">${formatearFecha(pedido.created_at)}</span>
            </div>
            ${pedido.notas ? `<div style="margin-top:8px;font-size:0.88rem;color:#475569;">📝 ${escaparHtml(pedido.notas)}</div>` : ''}
          </div>
        </div>
        <div class="historial-detail-actions">
          <button type="button" class="historial-link-btn" data-filtrar-cliente-detalle="1" data-pedido-id="${escaparHtml(pedido.id)}">🔍 Ver solo este cliente</button>
          <button type="button" class="historial-link-btn ghost" data-cerrar-detalle="1" data-pedido-id="${escaparHtml(pedido.id)}">Cerrar detalle</button>
        </div>
      </td>
    </tr>`;
}

// ---------- Vista Ranking VIP ----------

function renderRankingVIP() {
  const contenedor = document.getElementById('historialContenido');
  document.getElementById('historialVistaTitulo').textContent = '👑 Ranking VIP';
  document.getElementById('historialVistaDescripcion').textContent = 'Clientes agrupados por teléfono y ordenados por compras acumuladas. Clic en un cliente para ver solo sus pedidos.';

  const clientes = {};
  pedidosFiltradosHistorial.forEach((pedido) => {
    const clave = pedido.telefono || `sin-telefono-${pedido.nombre || 'cliente'}`;
    if (!clientes[clave]) {
      clientes[clave] = {
        nombre: pedido.nombre || 'Sin nombre',
        telefono: pedido.telefono || '-',
        totalCompras: 0,
        cantidadPedidos: 0,
        ultimoPedido: pedido.created_at || pedido.fecha || null,
        pedidos: []
      };
    }
    clientes[clave].totalCompras += Number(pedido.total) || 0;
    clientes[clave].cantidadPedidos += 1;
    clientes[clave].pedidos.push(pedido);
    if (pedido.created_at && new Date(pedido.created_at) > new Date(clientes[clave].ultimoPedido || 0)) {
      clientes[clave].ultimoPedido = pedido.created_at;
      clientes[clave].nombre = pedido.nombre || clientes[clave].nombre;
    }
  });

  const ranking = Object.values(clientes).sort((a, b) => {
    let va, vb;
    if (ordenCol === 'cliente') { va = normalizarTexto(a.nombre); vb = normalizarTexto(b.nombre); }
    else if (ordenCol === 'telefono') { va = a.telefono; vb = b.telefono; }
    else if (ordenCol === 'pedidos') { va = a.cantidadPedidos; vb = b.cantidadPedidos; }
    else if (ordenCol === 'ticket') { va = a.cantidadPedidos ? a.totalCompras / a.cantidadPedidos : 0; vb = b.cantidadPedidos ? b.totalCompras / b.cantidadPedidos : 0; }
    else if (ordenCol === 'fecha') { va = a.ultimoPedido || ''; vb = b.ultimoPedido || ''; }
    else { va = a.totalCompras; vb = b.totalCompras; }
    if (va < vb) return ordenDir === 'asc' ? -1 : 1;
    if (va > vb) return ordenDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (!ranking.length) {
    contenedor.innerHTML = '<div class="historial-empty">No se encontraron clientes con los filtros actuales.</div>';
    actualizarPaginacion(0, 'cliente(s)');
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(ranking.length / PAGE_SIZE));
  const pagSegura = Math.min(paginaActual, totalPaginas);
  const inicio = (pagSegura - 1) * PAGE_SIZE;
  const pagina = ranking.slice(inicio, inicio + PAGE_SIZE);

  let html = `
    <table class="historial-table">
      <thead>
        <tr>
          <th style="width:80px;">Rank</th>
          <th data-orden="cliente">Cliente ${flechaOrden('cliente')}</th>
          <th class="historial-col-telefono" data-orden="telefono">Teléfono ${flechaOrden('telefono')}</th>
          <th style="width:100px;" data-orden="pedidos">Pedidos ${flechaOrden('pedidos')}</th>
          <th class="historial-col-total" data-orden="total">Total Compras ${flechaOrden('total')}</th>
          <th class="historial-col-total" data-orden="ticket">Ticket Prom. ${flechaOrden('ticket')}</th>
          <th class="historial-col-fecha" data-orden="fecha">Último Pedido ${flechaOrden('fecha')}</th>
        </tr>
      </thead>
      <tbody>
        ${pagina.map((cliente, index) => {
          const posicion = inicio + index;
          const ticket = cliente.cantidadPedidos > 0 ? Math.round(cliente.totalCompras / cliente.cantidadPedidos) : 0;
          const ultimoPedido = formatearFecha(cliente.ultimoPedido, false);
          return `
            <tr class="fila-pedido" data-vip-cliente="${escaparHtml(cliente.telefono)}" data-vip-nombre="${escaparHtml(cliente.nombre)}">
              <td>${posicion === 0 ? '🥇' : posicion === 1 ? '🥈' : posicion === 2 ? '🥉' : `#${posicion + 1}`}</td>
              <td><div class="historial-cliente-nombre historial-cliente-link" data-filtrar-vip="1">${escaparHtml(cliente.nombre)}</div></td>
              <td>${escaparHtml(cliente.telefono)}</td>
              <td>${cliente.cantidadPedidos.toLocaleString('es-CL')}</td>
              <td class="historial-total">$${formatoMonedaHistorial(cliente.totalCompras)}</td>
              <td>$${formatoMonedaHistorial(ticket)}</td>
              <td>${ultimoPedido}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  contenedor.innerHTML = html;

  contenedor.querySelectorAll('[data-filtrar-vip]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const fila = el.closest('.fila-pedido');
      filtrarPorCliente({ telefono: fila.dataset.vipCliente, nombre: fila.dataset.vipNombre });
    });
  });

  configurarOrdenTabla();
  actualizarPaginacion(ranking.length, 'cliente(s)');
}

// ---------- Vistas y paginación ----------

function renderVistaActual() {
  if (vistaActual === 'vip') renderRankingVIP();
  else renderVistaCronologica();
}

function switchVista(vista) {
  vistaActual = vista;
  paginaActual = 1;
  filaExpandidaId = null;
  document.getElementById('tabCronologico').classList.toggle('is-active', vista === 'cronologico');
  document.getElementById('tabCronologico').setAttribute('aria-selected', vista === 'cronologico');
  document.getElementById('tabVip').classList.toggle('is-active', vista === 'vip');
  document.getElementById('tabVip').setAttribute('aria-selected', vista === 'vip');
  renderVistaActual();
}

function actualizarPaginacion(totalVisibles, sufijo) {
  const totalPaginas = Math.max(1, Math.ceil(totalVisibles / PAGE_SIZE));
  paginaActual = Math.min(Math.max(1, paginaActual), totalPaginas);

  const desde = totalVisibles === 0 ? 0 : (paginaActual - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(paginaActual * PAGE_SIZE, totalVisibles);
  const etiquetaRango = totalVisibles === 0
    ? 'Sin resultados'
    : `Mostrando ${desde.toLocaleString('es-CL')}–${hasta.toLocaleString('es-CL')} de ${totalVisibles.toLocaleString('es-CL')} ${sufijo}`;

  document.getElementById('historialPaginacionInfo').textContent = `${etiquetaRango} · Página ${paginaActual} de ${totalPaginas}`;
  document.getElementById('btnPagAnterior').disabled = paginaActual <= 1;
  document.getElementById('btnPagSiguiente').disabled = paginaActual >= totalPaginas;
  document.getElementById('btnPagNumero').textContent = String(paginaActual);
  document.getElementById('historialPaginacion').hidden = totalVisibles === 0;
}

function irPagina(nueva) {
  const totalVisibles = vistaActual === 'vip'
    ? Object.keys(agruparClientesVIP()).length
    : pedidosFiltradosHistorial.length;
  const totalPaginas = Math.max(1, Math.ceil(totalVisibles / PAGE_SIZE));
  paginaActual = Math.min(Math.max(1, nueva), totalPaginas);
  renderVistaActual();
  const wrap = document.getElementById('historialTablaWrap');
  if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function agruparClientesVIP() {
  const clientes = {};
  pedidosFiltradosHistorial.forEach((pedido) => {
    const clave = pedido.telefono || `sin-telefono-${pedido.nombre || 'cliente'}`;
    if (!clientes[clave]) clientes[clave] = { nombre: pedido.nombre || 'Sin nombre', telefono: pedido.telefono || '-' };
  });
  return clientes;
}

// ---------- Exportar CSV ----------

function exportarCSV() {
  if (!pedidosFiltradosHistorial.length) {
    alert('No hay datos para exportar.');
    return;
  }
  const filas = [
    ['Fecha', 'Cliente', 'Telefono', 'Total', 'Metodo', 'Estado', 'Direccion', 'Productos', 'Notas', 'Prioridad', 'Asignado'],
    ...pedidosFiltradosHistorial.map((pedido) => [
      pedido.created_at ? new Date(pedido.created_at).toLocaleString('es-CL') : '',
      pedido.nombre || '',
      pedido.telefono || '',
      pedido.total || 0,
      pedido.metodo_pago || pedido.metodo || '',
      obtenerTextoEstado(obtenerEstadoPedido(pedido)),
      pedido.direccion || '',
      Array.isArray(pedido.items) ? pedido.items.map((item) => `${obtenerNombreItem(item)} (${item.cantidad || 1})`).join(' | ') : '',
      pedido.notas || '',
      pedido.prioridad || '',
      pedido.asignado_a || ''
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

// ---------- Limpiar ----------

function limpiarFiltros() {
  document.getElementById('buscarHistorial').value = '';
  document.getElementById('filtroMetodoHistorial').value = 'todos';
  document.getElementById('filtroEstadoHistorial').value = 'todos';
  document.getElementById('fechaDesde').value = '';
  document.getElementById('fechaHasta').value = '';
  clienteFiltroActivo = null;
  actualizarChipCliente();
  document.querySelectorAll('.historial-chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.periodo === 'todo');
  });
  cargarHistorial();
}

// ---------- Eventos ----------

function conectarEventos() {
  document.getElementById('buscarHistorial').addEventListener('input', () => {
    clearTimeout(historialFiltroTimeout);
    historialFiltroTimeout = setTimeout(aplicarFiltrosHistorial, 180);
  });
  document.getElementById('filtroMetodoHistorial').addEventListener('change', aplicarFiltrosHistorial);
  document.getElementById('filtroEstadoHistorial').addEventListener('change', aplicarFiltrosHistorial);
  document.getElementById('btnAplicarFiltroFecha').addEventListener('click', () => {
    // Si el usuario filtra con fechas manuales, ningún chip de período queda activo
    document.querySelectorAll('.historial-chip').forEach((chip) => chip.classList.remove('is-active'));
    cargarHistorial();
  });
  document.getElementById('btnLimpiarFiltros').addEventListener('click', limpiarFiltros);
  document.getElementById('btnExportarHistorialCompleto').addEventListener('click', exportarCSV);
  document.getElementById('btnCerrarSesionHistorial').addEventListener('click', async () => {
    await supabaseLogout();
    window.location.href = '../index.html';
  });

  document.getElementById('tabCronologico').addEventListener('click', () => switchVista('cronologico'));
  document.getElementById('tabVip').addEventListener('click', () => switchVista('vip'));

  document.querySelectorAll('.historial-chip').forEach((btn) => {
    btn.addEventListener('click', () => aplicarPeriodoRapido(btn.dataset.periodo));
  });

  document.getElementById('btnPagAnterior').addEventListener('click', () => irPagina(paginaActual - 1));
  document.getElementById('btnPagSiguiente').addEventListener('click', () => irPagina(paginaActual + 1));
  document.getElementById('btnPagNumero').addEventListener('click', () => irPagina(paginaActual));
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
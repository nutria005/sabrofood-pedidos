let supabase_client = null;
let todosLosPedidosCarga = [];
let pedidosFiltradosCarga = [];
let itemsMarcadosCache = new Set();
let itemsMarcadosDetalleCache = new Map();
let itemsMarcadosPorPedidoCache = new Map();
let productosCargaCache = new Map();
let refrescoProgramadoCarga = null;
let realtimePedidosCarga = null;
let realtimeMarcadosCarga = null;
let filtrosCargaTimeout = null;
const CARGA_PAGE_SIZE = 1000;
const CARGA_FILTERS_KEY = 'sabrofood_ver_carga_filtros';
const CARGA_PREPARACION_COLAPSADA_KEY = 'sabrofood_ver_carga_preparacion_colapsada';
const DEBUG_CARGA = false;
const CARGA_DEFAULT_FILTERS = {
  busqueda: '',
  filtroRapido: 'hoy',
  estado: 'todos'
};

function esVistaRepartidorCarga() {
  return window.location.pathname.replace(/\\/g, '/').includes('/repartidor/');
}

function obtenerRepartidorActivoDesdeUrlCarga() {
  try {
    const perfil = new URLSearchParams(window.location.search).get('perfil');
    return perfil ? String(perfil).trim() : null;
  } catch (error) {
    console.warn('No se pudo leer el perfil desde la URL de ver carga:', error);
    return null;
  }
}

function obtenerRepartidorActivoCarga() {
  if (!esVistaRepartidorCarga()) {
    return null;
  }

  try {
    const perfilUrl = obtenerRepartidorActivoDesdeUrlCarga();
    if (perfilUrl) {
      localStorage.setItem('repartidor_perfil', perfilUrl);
      return perfilUrl;
    }

    const perfil = localStorage.getItem('repartidor_perfil');
    return perfil ? String(perfil).trim() : null;
  } catch (error) {
    console.warn('No se pudo leer el perfil del repartidor para ver carga:', error);
    return null;
  }
}

function estaResumenPreparacionColapsado() {
  try {
    const valor = localStorage.getItem(CARGA_PREPARACION_COLAPSADA_KEY);
    if (valor === null) return true;
    return valor !== 'false';
  } catch (error) {
    return true;
  }
}

function guardarEstadoResumenPreparacion(colapsado) {
  try {
    localStorage.setItem(CARGA_PREPARACION_COLAPSADA_KEY, String(Boolean(colapsado)));
  } catch (error) {
    console.warn('No se pudo guardar el estado del resumen de preparacion:', error);
  }
}

function alternarResumenPreparacion() {
  guardarEstadoResumenPreparacion(!estaResumenPreparacionColapsado());
  renderizarResumenPreparacionCarga(pedidosFiltradosCarga);
}

function obtenerClavePedidoCache(pedidoId) {
  return normalizarPedidoId(pedidoId);
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

function obtenerNotasVisiblesCarga(notas) {
  return String(notas || '')
    .split('|')
    .map((parte) => parte.trim())
    .filter((parte) => parte && !parte.startsWith('TEL2:'))
    .join(' | ');
}

function normalizarNombreProducto(nombreProducto) {
  if (!nombreProducto) return 'producto_sin_nombre';
  return String(nombreProducto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizarPedidoId(pedidoId) {
  if (!pedidoId) return 'sin_id';
  return String(pedidoId)
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function crearCheckboxIdLegacy(pedidoId, nombreProducto) {
  return `chk_${normalizarPedidoId(pedidoId)}_${normalizarNombreProducto(nombreProducto)}`;
}

function obtenerProductoIdItem(item = {}) {
  const candidatos = [
    item?.producto_id,
    item?.productoId,
    item?.id,
    item?.producto?.id,
    item?.producto?.producto_id
  ];

  for (const candidato of candidatos) {
    if (candidato === null || candidato === undefined || candidato === '') continue;
    const numero = Number(candidato);
    if (Number.isFinite(numero) && numero > 0) {
      return numero;
    }
  }

  return null;
}

function crearCheckboxIdCarga(pedidoId, item, itemIndex = 0) {
  const nombreProducto = item?.nombre || item?.nombre_producto || 'producto_sin_nombre';
  const productoId = obtenerProductoIdItem(item);
  const productoToken = productoId ? `prod_${productoId}` : 'manual';
  return `chk_${normalizarPedidoId(pedidoId)}_${productoToken}_${itemIndex}_${normalizarNombreProducto(nombreProducto)}`;
}

function crearClaveCompatibilidadCarga(pedidoId, item = {}) {
  const pedidoToken = normalizarPedidoId(pedidoId);
  const cantidad = parseInt(item.cantidad, 10) || 0;
  const productoId = obtenerProductoIdItem(item);

  if (productoId) {
    return `ped_${pedidoToken}_prod_${productoId}_cant_${cantidad}`;
  }

  return `ped_${pedidoToken}_nom_${normalizarNombreProducto(item.nombre || item.nombre_producto || '')}_cant_${cantidad}`;
}

function obtenerClavesCompatibilidadCarga(pedidoId, item = {}) {
  const pedidoToken = normalizarPedidoId(pedidoId);
  const cantidad = parseInt(item.cantidad, 10) || 0;
  const nombreNormalizado = normalizarNombreProducto(item.nombre || item.nombre_producto || '');
  const productoId = obtenerProductoIdItem(item);
  const claves = [];

  if (productoId) {
    claves.push(`ped_${pedidoToken}_prod_${productoId}_cant_${cantidad}`);
    claves.push(`ped_${pedidoToken}_prod_${productoId}`);
  }

  if (nombreNormalizado) {
    claves.push(`ped_${pedidoToken}_nom_${nombreNormalizado}_cant_${cantidad}`);
    claves.push(`ped_${pedidoToken}_nom_${nombreNormalizado}`);
  }

  return Array.from(new Set(claves.filter(Boolean)));
}

function obtenerNombreItem(item) {
  return item?.nombre || item?.nombre_producto || item?.producto || 'Producto sin nombre';
}

function esItemGranel(nombreProducto) {
  const texto = normalizarTexto(nombreProducto);
  return texto.includes('granel');
}

function calcularBultosItem(item) {
  if (esItemGranel(item.nombre)) return 1;
  return parseInt(item.cantidad, 10) || 0;
}

function parsearPesoKg(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  if (typeof valor === 'number') {
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  }

  const texto = String(valor).trim().toLowerCase();
  if (!texto) return null;

  const match = texto.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;

  const numero = Number.parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function obtenerPesoDesdeNombre(nombreProducto) {
  const texto = String(nombreProducto || '').toLowerCase();
  if (!texto || texto.includes('granel')) return null;

  // Rangos como "2.8 a 6.25kg" suelen describir el animal objetivo, no el peso del producto.
  if (/\d+(?:[.,]\d+)?\s*(?:a|-)\s*\d+(?:[.,]\d+)?\s*(?:kg|kilo|kilos)\b/.test(texto)) {
    return null;
  }

  const matchGr = texto.match(/(\d+(?:[.,]\d+)?)\s*(gr|g)\b/);
  if (matchGr) {
    const gramos = Number.parseFloat(matchGr[1].replace(',', '.'));
    if (Number.isFinite(gramos) && gramos > 0) {
      return gramos / 1000;
    }
  }

  const matchKg = texto.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilo|kilos)\b/);
  if (matchKg) {
    const numero = Number.parseFloat(matchKg[1].replace(',', '.'));
    return Number.isFinite(numero) && numero > 0 ? numero : null;
  }

  return null;
}

function puedeUsarPesoMetaProducto(meta, nombreProducto) {
  if (!meta) return false;

  const tipo = normalizarTexto(meta.tipo || '');
  if (tipo === 'granel' || tipo === 'unidad') return false;

  const texto = normalizarTexto(nombreProducto || meta.nombre || '');
  const palabrasAmbiguas = [
    'pipeta',
    'lata',
    'juguete',
    'medic',
    'shampoo',
    'spray',
    'gota',
    'collar',
    'comprim',
    'tableta',
    'snack',
    'sobre',
    'sachet'
  ];

  return !palabrasAmbiguas.some((palabra) => texto.includes(palabra));
}

function obtenerMetaProductoCarga(productoId) {
  if (!productoId) return null;
  return productosCargaCache.get(Number(productoId)) || null;
}

function obtenerStockDisponibleProducto(productoId) {
  const meta = obtenerMetaProductoCarga(productoId);
  if (!meta) return null;

  const stock = Number(meta.stock);
  if (!Number.isFinite(stock)) return 0;
  return Math.floor(stock);
}

function actualizarStockCacheProducto(productoId, nuevoStock) {
  const productoIdNumero = Number(productoId);
  if (!Number.isFinite(productoIdNumero) || productoIdNumero <= 0) return;

  const metaActual = obtenerMetaProductoCarga(productoIdNumero);
  if (!metaActual) return;

  productosCargaCache.set(productoIdNumero, {
    ...metaActual,
    stock: Number.isFinite(Number(nuevoStock)) ? Math.floor(Number(nuevoStock)) : metaActual.stock
  });
}

function crearMensajeErrorCambioCarga(error, itemInfo = {}, checked = false) {
  const codigo = String(error?.code || '').toUpperCase();
  const mensaje = String(error?.message || '');

  if (codigo === '23514' && mensaje.includes('productos_stock_check')) {
    const stockDisponible = obtenerStockDisponibleProducto(itemInfo.productoId);
    const cantidad = parseInt(itemInfo?.cantidad, 10) || 0;
    const nombreProducto = itemInfo?.nombre || 'este producto';

    if (checked) {
      if (stockDisponible !== null) {
        return `No se puede marcar ${nombreProducto} porque el stock actual es ${stockDisponible} y se intentan descontar ${cantidad}.`;
      }

      return `No se puede marcar ${nombreProducto} porque el descuento dejaría el stock en un valor inválido.`;
    }

    return `No se pudo devolver stock para ${nombreProducto} porque el producto tiene un valor inválido en inventario.`;
  }

  return 'No se pudo actualizar el item. Intenta nuevamente.';
}

function esErrorStockNoBloqueante(error) {
  const codigo = String(error?.code || '').toUpperCase();
  const mensaje = String(error?.message || '').toLowerCase();
  return codigo === '23514' && mensaje.includes('productos_stock_check');
}

function obtenerPesoUnitarioItemKg(item = {}) {
  if (esItemGranel(item.nombre || item.nombre_producto || '')) return null;

  const productoId = obtenerProductoIdItem(item);
  const meta = obtenerMetaProductoCarga(productoId);
  const pesoDesdeNombre = obtenerPesoDesdeNombre(item.nombre || item.nombre_producto || meta?.nombre || '');
  if (pesoDesdeNombre) {
    return pesoDesdeNombre;
  }

  if (!puedeUsarPesoMetaProducto(meta, item.nombre || item.nombre_producto || '')) {
    return null;
  }

  const candidatos = [
    meta?.peso_kg,
    item?.peso_kg
  ];

  for (const candidato of candidatos) {
    const peso = parsearPesoKg(candidato);
    if (peso) return peso;
  }

  return null;
}

function obtenerClaveConsolidadoItem(item = {}) {
  const productoId = obtenerProductoIdItem(item);
  if (productoId) return `prod_${productoId}`;
  return `nom_${normalizarNombreProducto(item.nombre || item.nombre_producto || '')}`;
}

async function cargarMetadatosProductosCarga(pedidos = []) {
  const ids = Array.from(new Set(
    pedidos.flatMap((pedido) => Array.isArray(pedido?.items)
      ? pedido.items.map((item) => obtenerProductoIdItem(item)).filter(Boolean)
      : [])
  ));

  productosCargaCache = new Map();
  if (ids.length === 0) return;

  for (let indice = 0; indice < ids.length; indice += 200) {
    const loteIds = ids.slice(indice, indice + 200);
    const { data, error } = await supabase_client
      .from('productos')
      .select('*')
      .in('id', loteIds);

    if (error) {
      console.warn('No se pudieron cargar metadatos de productos para peso:', error);
      return;
    }

    (data || []).forEach((producto) => {
      if (producto?.id) {
        productosCargaCache.set(Number(producto.id), producto);
      }
    });
  }
}

function generarResumenPreparacionCarga(pedidos = []) {
  const resumen = new Map();
  let pesoTotalKg = 0;
  let itemsConPeso = 0;
  let itemsSinPeso = 0;

  for (const pedido of pedidos) {
    if (!Array.isArray(pedido?.items) || pedido.items.length === 0) continue;

    for (const item of pedido.items) {
      const nombre = obtenerNombreItem(item);
      const bultos = calcularBultosItem({ nombre, cantidad: item?.cantidad });
      const clave = obtenerClaveConsolidadoItem(item);
      const productoId = obtenerProductoIdItem(item);
      const pesoUnitarioKg = obtenerPesoUnitarioItemKg({ ...item, nombre });
      const pesoTotalItemKg = pesoUnitarioKg ? pesoUnitarioKg * bultos : null;

      if (!resumen.has(clave)) {
        resumen.set(clave, {
          clave,
          nombre,
          productoId,
          bultos: 0,
          pedidos: 0,
          pesoUnitarioKg,
          pesoTotalKg: 0,
          tienePeso: false
        });
      }

      const acumulado = resumen.get(clave);
      acumulado.bultos += bultos;
      acumulado.pedidos += 1;

      if (pesoUnitarioKg) {
        acumulado.pesoUnitarioKg = acumulado.pesoUnitarioKg || pesoUnitarioKg;
        acumulado.pesoTotalKg += pesoTotalItemKg || 0;
        acumulado.tienePeso = true;
        pesoTotalKg += pesoTotalItemKg || 0;
        itemsConPeso += 1;
      } else {
        itemsSinPeso += 1;
      }
    }
  }

  const productos = Array.from(resumen.values())
    .sort((a, b) => b.bultos - a.bultos || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));

  return {
    productos,
    pesoTotalKg,
    itemsConPeso,
    itemsSinPeso,
    totalProductos: productos.length
  };
}

function obtenerFechaISO(valor) {
  if (!valor) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) return String(valor);
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function obtenerFechaOperativaPedido(pedido) {
  return obtenerFechaISO(pedido?.fecha || pedido?.created_at || '');
}

function obtenerFechaRelativa(tipo) {
  const base = new Date();
  if (tipo === 'manana') {
    base.setDate(base.getDate() + 1);
  }
  return obtenerFechaISO(base);
}

function formatearFechaCorta(valor) {
  if (!valor) return '';
  const fecha = new Date(`${valor}T12:00:00`);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleDateString('es-CL', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  });
}

function obtenerDescripcionFiltroFecha() {
  const filtroRapido = document.querySelector('.carga-quick-filter.is-active')?.dataset.dateFilter || CARGA_DEFAULT_FILTERS.filtroRapido;

  if (filtroRapido === 'hoy') return 'pedidos de hoy';
  return 'pedidos de manana';
}

function sincronizarBotonesFecha() {
  const filtroRapido = window.filtroRapidoCargaActual || CARGA_DEFAULT_FILTERS.filtroRapido;

  document.querySelectorAll('.carga-quick-filter').forEach((boton) => {
    const debeActivarse = boton.dataset.dateFilter === filtroRapido;
    boton.classList.toggle('is-active', debeActivarse);
    boton.setAttribute('aria-pressed', debeActivarse ? 'true' : 'false');
  });
}

function setSyncStatus(texto, tipo = 'ok') {
  const nodo = document.getElementById('cargaSyncTexto');
  if (!nodo) return;
  nodo.textContent = texto;
  nodo.className = tipo === 'error'
    ? 'carga-sync-error'
    : tipo === 'warn'
      ? 'carga-sync-warn'
      : 'carga-sync-ok';
}

function mostrarLoading(texto = 'Cargando manifiesto...') {
  document.getElementById('cargaLoadingState').hidden = false;
  document.getElementById('cargaLoadingState').textContent = texto;
  document.getElementById('cargaEmptyState').hidden = true;
  document.getElementById('cargaContenido').hidden = true;
}

function ocultarLoading() {
  document.getElementById('cargaLoadingState').hidden = true;
}

function obtenerCheckboxPersistido(item) {
  if (!item) return '';
  if (itemsMarcadosCache.has(item.checkboxId)) return item.checkboxId;
  if (item.legacyCheckboxId && itemsMarcadosCache.has(item.legacyCheckboxId)) return item.legacyCheckboxId;

  const clavesCompatibilidad = [
    ...(Array.isArray(item.compatKeys) ? item.compatKeys : []),
    item.compatKey
  ].filter(Boolean);

  for (const clave of clavesCompatibilidad) {
    if (itemsMarcadosDetalleCache.has(clave)) {
      return itemsMarcadosDetalleCache.get(clave) || '';
    }
  }

  const pedidoId = item.pedidoId || item.pedido_id || '';
  const pedidoCacheKey = obtenerClavePedidoCache(pedidoId);
  if (pedidoCacheKey && itemsMarcadosPorPedidoCache.has(pedidoCacheKey)) {
    const coincidenciasPedido = itemsMarcadosPorPedidoCache.get(pedidoCacheKey) || [];
    const productoId = obtenerProductoIdItem(item);
    const cantidad = parseInt(item.cantidad, 10) || 0;
    const nombreNormalizado = normalizarNombreProducto(item.nombre || item.nombre_producto || '');

    const coincidencia = coincidenciasPedido.find((registro) => {
      const registroProductoId = obtenerProductoIdItem(registro);
      const registroCantidad = parseInt(registro.cantidad, 10) || 0;
      const registroNombre = normalizarNombreProducto(registro.nombre_producto || registro.nombre || '');

      if (productoId && registroProductoId === productoId && registroCantidad === cantidad) return true;
      if (nombreNormalizado && registroNombre === nombreNormalizado && registroCantidad === cantidad) return true;
      if (productoId && registroProductoId === productoId) return true;
      if (nombreNormalizado && registroNombre === nombreNormalizado) return true;
      return false;
    });

    if (coincidencia?.checkbox_id) {
      return coincidencia.checkbox_id;
    }
  }

  return '';
}

function estaMarcadoSegunCache(item) {
  return Boolean(obtenerCheckboxPersistido(item));
}

async function confirmarEstadoMarcado(checkboxId, marcadoEsperado) {
  const { data, error } = await supabase_client
    .from('carga_marcados')
    .select('checkbox_id, marcado')
    .eq('checkbox_id', checkboxId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return marcadoEsperado === false;
  }

  return Boolean(data.marcado) === marcadoEsperado;
}

function esRpcCambioCargaNoDisponible(error) {
  const codigo = String(error?.code || '').toUpperCase();
  const mensaje = String(error?.message || '').toLowerCase();
  return codigo === 'PGRST202' || codigo === '42883' || mensaje.includes('procesar_cambio_carga');
}

async function procesarCambioCargaAtomico(checkboxId, itemInfo, marcado) {
  const { data, error } = await supabase_client.rpc('procesar_cambio_carga', {
    p_checkbox_id: checkboxId,
    p_pedido_id: itemInfo?.pedidoId || null,
    p_producto_id: itemInfo?.productoId || null,
    p_cantidad: itemInfo?.cantidad || 0,
    p_nombre_producto: itemInfo?.nombre || '',
    p_marcado: Boolean(marcado)
  });

  if (error) {
    if (esRpcCambioCargaNoDisponible(error)) {
      return null;
    }
    if (esErrorStockNoBloqueante(error)) {
      console.warn('RPC de carga omitió el ajuste de stock; se usará persistencia legacy para no bloquear el marcado.', error);
      return null;
    }
    throw error;
  }

  return Array.isArray(data) ? (data[0] || null) : data;
}

async function obtenerPedidosPendientes() {
  let desde = 0;
  let pedidos = [];
  const repartidorActivo = obtenerRepartidorActivoCarga();

  if (esVistaRepartidorCarga() && !repartidorActivo) {
    return [];
  }

  while (true) {
    let query = supabase_client
      .from('pedidos')
      .select('*')
      .eq('entregado', false)
      .order('created_at', { ascending: false })
      .range(desde, desde + CARGA_PAGE_SIZE - 1);

    if (repartidorActivo) {
      query = query.eq('asignado_a', repartidorActivo);
    }

    const { data, error } = await query;

    if (error) throw error;

    const bloque = (data || []).filter((pedido) => pedido?.estado !== 'ANULADO');
    pedidos = pedidos.concat(bloque);
    if (bloque.length < CARGA_PAGE_SIZE) break;
    desde += CARGA_PAGE_SIZE;
  }

  return pedidos;
}

async function cargarItemsMarcados() {
  const data = [];
  let desde = 0;

  while (true) {
    const { data: lote, error } = await supabase_client
      .from('carga_marcados')
      .select('checkbox_id, pedido_id, producto_id, cantidad, nombre_producto')
      .eq('marcado', true)
      .order('updated_at', { ascending: false })
      .range(desde, desde + CARGA_PAGE_SIZE - 1);

    if (error) throw error;

    data.push(...(lote || []));

    if (!lote || lote.length < CARGA_PAGE_SIZE) {
      break;
    }

    desde += CARGA_PAGE_SIZE;
  }

  if (DEBUG_CARGA) {
    console.log('[Carga debug] Filas marcadas cargadas desde Supabase', {
      total: data.length,
      rows: data
    });
  }

  itemsMarcadosCache = new Set(data.map((item) => item.checkbox_id));
  itemsMarcadosDetalleCache = new Map();
  itemsMarcadosPorPedidoCache = new Map();

  data.forEach((item) => {
    if (item?.pedido_id) {
      const pedidoCacheKey = obtenerClavePedidoCache(item.pedido_id);
      const listaPedido = itemsMarcadosPorPedidoCache.get(pedidoCacheKey) || [];
      listaPedido.push(item);
      itemsMarcadosPorPedidoCache.set(pedidoCacheKey, listaPedido);
    }

    obtenerClavesCompatibilidadCarga(item.pedido_id, item).forEach((compatKey) => {
      itemsMarcadosDetalleCache.set(compatKey, item.checkbox_id);
    });
  });
}

function generarResumenCarga(pedidos = []) {
  const arraysPrioridad = { A: [], B: [], C: [] };
  const pedidosActivos = new Set();

  for (const pedido of pedidos) {
    if (!Array.isArray(pedido?.items) || pedido.items.length === 0) continue;

    const prioridad = ['A', 'B', 'C'].includes(pedido.prioridad) ? pedido.prioridad : 'C';
    const nombreCliente = pedido.nombre || 'Cliente sin nombre';
    const pedidoId = pedido.id;
    pedidosActivos.add(pedidoId);

    for (const [itemIndex, item] of pedido.items.entries()) {
      const nombreProducto = obtenerNombreItem(item);
      const cantidad = parseInt(item?.cantidad, 10) || 1;
      const productoId = obtenerProductoIdItem(item);
      const itemNormalizado = {
        nombre: nombreProducto,
        nombre_producto: nombreProducto,
        cantidad,
        producto_id: productoId,
        productoId
      };
      const checkboxId = crearCheckboxIdCarga(pedidoId, itemNormalizado, itemIndex);
      const legacyCheckboxId = crearCheckboxIdLegacy(pedidoId, nombreProducto);
      const compatKey = crearClaveCompatibilidadCarga(pedidoId, itemNormalizado);
      const compatKeys = obtenerClavesCompatibilidadCarga(pedidoId, itemNormalizado);
      const persistedCheckboxId = obtenerCheckboxPersistido({
        checkboxId,
        legacyCheckboxId,
        compatKey,
        compatKeys,
        pedidoId,
        productoId,
        cantidad,
        nombre: nombreProducto,
        nombre_producto: nombreProducto
      });
      const estaMarcado = Boolean(persistedCheckboxId);

      if (DEBUG_CARGA) {
        console.log('[Carga debug] Evaluacion item render', {
          pedidoId,
          nombreProducto,
          productoId,
          cantidad,
          itemIndex,
          checkboxId,
          legacyCheckboxId,
          compatKey,
          compatKeys,
          persistedCheckboxId,
          estaMarcado,
          matchExacto: itemsMarcadosCache.has(checkboxId),
          matchLegacy: legacyCheckboxId ? itemsMarcadosCache.has(legacyCheckboxId) : false
        });
      }

      if (DEBUG_CARGA && !estaMarcado) {
        const pedidoCacheKey = obtenerClavePedidoCache(pedidoId);
        const coincidenciasPedido = itemsMarcadosPorPedidoCache.get(pedidoCacheKey) || [];
        const hayCoincidenciaPersistida = coincidenciasPedido.some((registro) => {
          const registroProductoId = obtenerProductoIdItem(registro);
          const registroCantidad = parseInt(registro.cantidad, 10) || 0;
          const registroNombre = normalizarNombreProducto(registro.nombre_producto || registro.nombre || '');

          if (productoId && registroProductoId === productoId) return true;
          if (registroCantidad === cantidad && registroNombre === normalizarNombreProducto(nombreProducto)) return true;
          return false;
        });

        if (hayCoincidenciaPersistida) {
          console.warn('[Carga debug] Item con coincidencia persistida pero sin render marcado', {
            pedidoId,
            pedidoCacheKey,
            itemRender: {
              checkboxId,
              legacyCheckboxId,
              compatKey,
              compatKeys,
              productoId,
              cantidad,
              nombre: nombreProducto
            },
            coincidenciasPedido,
            itemsMarcadosCache: Array.from(itemsMarcadosCache)
          });
        }
      }

      arraysPrioridad[prioridad].push({
        nombre: nombreProducto,
        cantidad,
        cliente: nombreCliente,
        telefono: pedido.telefono || '',
        pedidoId,
        productoId,
        checkboxId,
        legacyCheckboxId,
        compatKey,
        compatKeys,
        persistedCheckboxId,
        estaMarcado,
        fecha: obtenerFechaOperativaPedido(pedido),
        notas: obtenerNotasVisiblesCarga(pedido.notas)
      });
    }
  }

  const resumenPorPrioridad = {};
  let totalBultos = 0;
  let totalMarcados = 0;
  let totalPendientes = 0;
  let totalLineas = 0;

  ['A', 'B', 'C'].forEach((prioridad) => {
    const items = arraysPrioridad[prioridad].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
    const bultos = items.reduce((sum, item) => sum + calcularBultosItem(item), 0);
    const marcados = items.reduce((sum, item) => sum + (item.estaMarcado ? calcularBultosItem(item) : 0), 0);
    const pendientes = Math.max(bultos - marcados, 0);

    resumenPorPrioridad[prioridad] = { items, bultos, marcados, pendientes };
    totalBultos += bultos;
    totalMarcados += marcados;
    totalPendientes += pendientes;
    totalLineas += items.length;
  });

  return {
    itemsPorPrioridad: resumenPorPrioridad,
    totalBultos,
    totalMarcados,
    totalPendientes,
    totalLineas,
    pedidosActivos: pedidosActivos.size
  };
}

function obtenerTextoResultados() {
  const totalPedidos = pedidosFiltradosCarga.length.toLocaleString('es-CL');
  const totalPedidosBase = todosLosPedidosCarga.length.toLocaleString('es-CL');
  return `Mostrando ${totalPedidos} pedido(s) activos de ${totalPedidosBase} cargado(s)`;
}

function setTextContentIfExists(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function actualizarEstadisticasCarga(resumen) {
  setTextContentIfExists('statTotalBultos', resumen.totalBultos.toLocaleString('es-CL'));
  setTextContentIfExists('statMarcados', resumen.totalMarcados.toLocaleString('es-CL'));
  setTextContentIfExists('statPendientes', resumen.totalPendientes.toLocaleString('es-CL'));
  setTextContentIfExists('statPedidosActivos', resumen.pedidosActivos.toLocaleString('es-CL'));
  setTextContentIfExists('resumenRutaA', resumen.itemsPorPrioridad.A.bultos.toLocaleString('es-CL'));
  setTextContentIfExists('resumenRutaB', resumen.itemsPorPrioridad.B.bultos.toLocaleString('es-CL'));
  setTextContentIfExists('resumenRutaC', resumen.itemsPorPrioridad.C.bultos.toLocaleString('es-CL'));
  const descripcionFecha = obtenerDescripcionFiltroFecha();
  setTextContentIfExists('cargaResultadosTexto', `${obtenerTextoResultados()} · ${resumen.totalLineas.toLocaleString('es-CL')} linea(s) · ${descripcionFecha}`);
}

function renderizarResumenPreparacionCarga(pedidos = []) {
  const contenedor = document.getElementById('cargaResumenPreparacion');
  if (!contenedor) return;

  const resumen = generarResumenPreparacionCarga(pedidos);
  if (resumen.productos.length === 0) {
    contenedor.hidden = true;
    contenedor.innerHTML = '';
    return;
  }

  const filas = resumen.productos.map((producto) => `
    <div class="carga-preparacion-item">
      <div class="carga-preparacion-texto">
        <strong>${escaparHtml(producto.nombre)}</strong>
        <span>${escaparHtml(producto.pedidos.toLocaleString('es-CL'))} pedido(s)</span>
      </div>
      <div class="carga-preparacion-metricas">
        <span class="carga-preparacion-badge">${escaparHtml(producto.bultos.toLocaleString('es-CL'))} bulto(s)</span>
        <span class="carga-preparacion-peso ${producto.tienePeso ? '' : 'sin-peso'}">${producto.tienePeso ? `${producto.pesoTotalKg.toLocaleString('es-CL', { maximumFractionDigits: 1 })} kg` : 'Peso n/d'}</span>
      </div>
    </div>
  `).join('');

  const estaColapsado = estaResumenPreparacionColapsado();
  const cardClass = estaColapsado ? 'carga-preparacion-card is-collapsed' : 'carga-preparacion-card';
  const textoBoton = estaColapsado ? 'Mostrar' : 'Ocultar';
  const iconoBoton = estaColapsado ? '▾' : '▴';
  const contenidoHidden = estaColapsado ? 'hidden' : '';

  contenedor.hidden = false;
  contenedor.innerHTML = `
    <section class="${cardClass}">
      <header class="carga-preparacion-header">
        <div class="carga-preparacion-header-copy">
          <h2>Resumen de Preparacion</h2>
          <p>Totales consolidados por producto segun los filtros activos.</p>
        </div>
        <div class="carga-preparacion-header-actions">
          <div class="carga-preparacion-totales">
            <div>
              <span>Peso camioneta</span>
              <strong>${resumen.pesoTotalKg.toLocaleString('es-CL', { maximumFractionDigits: 1 })} kg</strong>
            </div>
            <div>
              <span>Productos sin peso</span>
              <strong>${resumen.itemsSinPeso.toLocaleString('es-CL')}</strong>
            </div>
          </div>
          <button type="button" class="carga-preparacion-toggle" id="btnToggleResumenPreparacion" aria-expanded="${estaColapsado ? 'false' : 'true'}" aria-controls="cargaPreparacionContenido">
            <span>${textoBoton}</span>
            <span class="carga-preparacion-toggle-icon" aria-hidden="true">${iconoBoton}</span>
          </button>
        </div>
      </header>
      <div id="cargaPreparacionContenido" class="carga-preparacion-contenido" ${contenidoHidden}>
        <div class="carga-preparacion-lista">${filas}</div>
      </div>
    </section>
  `;
}

function renderizarSeccion(prioridad, data, icono, titulo, clase) {
  if (!data?.items?.length) return '';

  const itemsHtml = data.items.map((item) => {
    const checkedClass = item.estaMarcado ? ' checked' : '';
    const checkedAttr = item.estaMarcado ? 'checked' : '';
    const cantidadTexto = esItemGranel(item.nombre)
      ? `$${item.cantidad.toLocaleString('es-CL')}`
      : item.cantidad.toLocaleString('es-CL');
    const meta = [
      `Para: ${item.cliente}`,
      item.telefono ? `Tel: ${item.telefono}` : '',
      item.fecha ? `Fecha: ${item.fecha}` : '',
      item.notas ? `Notas: ${item.notas}` : ''
    ].filter(Boolean).join(' · ');

    return `
      <div class="carga-item${checkedClass}"
           data-checkbox-id="${escaparHtml(item.checkboxId)}"
           data-legacy-checkbox-id="${escaparHtml(item.legacyCheckboxId)}"
           data-persisted-checkbox-id="${escaparHtml(item.persistedCheckboxId)}"
           data-compat-key="${escaparHtml(item.compatKey)}"
           data-producto-id="${escaparHtml(item.productoId || '')}"
           data-cantidad="${escaparHtml(item.cantidad)}"
           data-nombre="${escaparHtml(item.nombre)}"
           data-pedido-id="${escaparHtml(item.pedidoId)}">
        <input type="checkbox" class="carga-checkbox" id="${escaparHtml(item.checkboxId)}" ${checkedAttr} data-checkbox-id="${escaparHtml(item.checkboxId)}">
        <label class="carga-item-texto" for="${escaparHtml(item.checkboxId)}">
          <span class="carga-item-producto">${escaparHtml(item.nombre)}</span>
          <span class="carga-item-meta">${escaparHtml(meta)}</span>
        </label>
        <span class="carga-item-cantidad">${escaparHtml(cantidadTexto)}</span>
      </div>
    `;
  }).join('');

  return `
    <section class="carga-seccion-prioridad">
      <header class="carga-seccion-header ${clase}">
        <div class="carga-seccion-titulo">
          <span>${icono}</span>
          <span>${titulo}</span>
        </div>
        <span class="carga-seccion-badge">${data.bultos.toLocaleString('es-CL')} bultos</span>
      </header>
      <div class="carga-items">${itemsHtml}</div>
    </section>
  `;
}

function renderizarCarga() {
  const contenedor = document.getElementById('cargaContenido');
  const empty = document.getElementById('cargaEmptyState');
  const resumen = generarResumenCarga(pedidosFiltradosCarga);
  actualizarEstadisticasCarga(resumen);
  renderizarResumenPreparacionCarga(pedidosFiltradosCarga);

  const hayItems = ['A', 'B', 'C'].some((prioridad) => resumen.itemsPorPrioridad[prioridad].items.length > 0);
  if (!hayItems) {
    contenedor.hidden = true;
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  contenedor.hidden = false;
  contenedor.innerHTML = [
    renderizarSeccion('A', resumen.itemsPorPrioridad.A, '🔴', 'Ruta A · Alta prioridad', 'prioridad-a'),
    renderizarSeccion('B', resumen.itemsPorPrioridad.B, '🟠', 'Ruta B · Prioridad media', 'prioridad-b'),
    renderizarSeccion('C', resumen.itemsPorPrioridad.C, '🟢', 'Ruta C · Prioridad baja', 'prioridad-c')
  ].join('');
}

function guardarFiltrosCarga() {
  const payload = {
    busqueda: document.getElementById('buscarCarga').value || CARGA_DEFAULT_FILTERS.busqueda,
    filtroRapido: window.filtroRapidoCargaActual || CARGA_DEFAULT_FILTERS.filtroRapido,
    estado: document.getElementById('filtroEstadoCarga').value || CARGA_DEFAULT_FILTERS.estado
  };
  localStorage.setItem(CARGA_FILTERS_KEY, JSON.stringify(payload));
}

function restaurarFiltrosCarga() {
  try {
    const raw = JSON.parse(localStorage.getItem(CARGA_FILTERS_KEY) || '{}');
    document.getElementById('buscarCarga').value = raw.busqueda || CARGA_DEFAULT_FILTERS.busqueda;
    window.filtroRapidoCargaActual = raw.filtroRapido === 'manana' ? 'manana' : CARGA_DEFAULT_FILTERS.filtroRapido;
    document.getElementById('filtroEstadoCarga').value = raw.estado || CARGA_DEFAULT_FILTERS.estado;
  } catch (error) {
    console.warn('No se pudieron restaurar filtros de carga:', error);
    document.getElementById('buscarCarga').value = CARGA_DEFAULT_FILTERS.busqueda;
    window.filtroRapidoCargaActual = CARGA_DEFAULT_FILTERS.filtroRapido;
    document.getElementById('filtroEstadoCarga').value = CARGA_DEFAULT_FILTERS.estado;
  }

  sincronizarBotonesFecha();
}

function aplicarFiltrosCarga() {
  const busqueda = normalizarTexto(document.getElementById('buscarCarga').value);
  const filtroRapido = window.filtroRapidoCargaActual === 'manana' ? 'manana' : CARGA_DEFAULT_FILTERS.filtroRapido;
  const filtroEstado = document.getElementById('filtroEstadoCarga').value;
  const fechaObjetivo = obtenerFechaRelativa(filtroRapido);

  sincronizarBotonesFecha();

  pedidosFiltradosCarga = todosLosPedidosCarga.filter((pedido) => {
    const fechaPedido = obtenerFechaOperativaPedido(pedido);
    if (fechaObjetivo && fechaPedido !== fechaObjetivo) return false;

    if (busqueda) {
      const productos = Array.isArray(pedido.items)
        ? pedido.items.map((item) => `${obtenerNombreItem(item)} ${item.cantidad || ''}`).join(' ')
        : '';
      const textoCompleto = normalizarTexto([
        pedido.id,
        pedido.nombre,
        pedido.telefono,
        pedido.direccion,
        pedido.notas,
        productos,
        fechaPedido
      ].join(' '));
      if (!textoCompleto.includes(busqueda)) return false;
    }

    if (filtroEstado === 'todos') return true;
    const resumenPedido = generarResumenCarga([pedido]);
    const tieneMarcados = resumenPedido.totalMarcados > 0;
    const tienePendientes = resumenPedido.totalPendientes > 0;

    if (filtroEstado === 'marcados') return tieneMarcados;
    if (filtroEstado === 'pendientes') return tienePendientes;
    return true;
  });

  guardarFiltrosCarga();
  renderizarCarga();
  ocultarLoading();
  setSyncStatus(`Sincronizado ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`);
}

async function descontarStockItem(itemInfo) {
  if (!itemInfo.productoId || itemInfo.productoId <= 0) return;

  try {
    const { data: producto, error: errorGet } = await supabase_client
      .from('productos')
      .select('stock, nombre')
      .eq('id', itemInfo.productoId)
      .maybeSingle();

    if (errorGet || !producto) return;

    const stockAnterior = Math.floor(producto.stock || 0);
    const nuevoStock = stockAnterior - itemInfo.cantidad;

    const { error: errorUpdate } = await supabase_client
      .from('productos')
      .update({ stock: nuevoStock })
      .eq('id', itemInfo.productoId);

    if (errorUpdate) return;

    await supabase_client
      .from('movimientos_stock')
      .insert([{
        producto_id: itemInfo.productoId,
        pedido_id: itemInfo.pedidoId,
        tipo: 'SALIDA',
        cantidad: itemInfo.cantidad,
        stock_anterior: stockAnterior,
        stock_nuevo: nuevoStock,
        usuario: 'sistema_carga',
        motivo: 'Bulto cargado para reparto'
      }]);
  } catch (error) {
    console.warn('No se pudo descontar stock del item marcado:', error);
  }
}

async function devolverStockItem(itemOrigen) {
  try {
    const data = typeof itemOrigen === 'string'
      ? await (async () => {
          const { data: itemData, error } = await supabase_client
            .from('carga_marcados')
            .select('pedido_id, producto_id, cantidad, nombre_producto')
            .eq('checkbox_id', itemOrigen)
            .single();

          if (error) throw error;
          return itemData;
        })()
      : itemOrigen;

    if (!data || !data.producto_id) return;

    const { data: producto, error: errorGet } = await supabase_client
      .from('productos')
      .select('stock')
      .eq('id', data.producto_id)
      .single();

    if (errorGet) return;

    const stockAnterior = Math.floor(producto.stock || 0);
    const nuevoStock = stockAnterior + data.cantidad;

    const { error: errorUpdate } = await supabase_client
      .from('productos')
      .update({ stock: nuevoStock })
      .eq('id', data.producto_id);

    if (errorUpdate) return;

    await supabase_client
      .from('movimientos_stock')
      .delete()
      .eq('producto_id', data.producto_id)
      .eq('pedido_id', data.pedido_id)
      .eq('tipo', 'SALIDA')
      .eq('cantidad', data.cantidad);
  } catch (error) {
    console.warn('No se pudo devolver stock del item desmarcado:', error);
  }
}

async function agregarItemMarcado(checkboxId, itemInfo) {
  const resultadoRpc = await procesarCambioCargaAtomico(checkboxId, itemInfo, true);
  if (resultadoRpc) {
    itemsMarcadosCache.add(checkboxId);
    itemsMarcadosDetalleCache.set(
      crearClaveCompatibilidadCarga(itemInfo.pedidoId, {
        producto_id: itemInfo.productoId,
        cantidad: itemInfo.cantidad,
        nombre_producto: itemInfo.nombre
      }),
      checkboxId
    );
    if (resultadoRpc.resultado_stock_nuevo !== null && resultadoRpc.resultado_stock_nuevo !== undefined) {
      actualizarStockCacheProducto(itemInfo.productoId, resultadoRpc.resultado_stock_nuevo);
    }
    return { modo: 'rpc', resultado: resultadoRpc };
  }

  const { data: existente, error: errorExistente } = await supabase_client
    .from('carga_marcados')
    .select('checkbox_id, marcado, pedido_id, producto_id, cantidad, nombre_producto')
    .eq('checkbox_id', checkboxId)
    .maybeSingle();

  if (errorExistente) throw errorExistente;

  if (existente?.marcado) {
    itemsMarcadosCache.add(checkboxId);
    const compatKey = crearClaveCompatibilidadCarga(itemInfo.pedidoId, {
      producto_id: itemInfo.productoId,
      cantidad: itemInfo.cantidad,
      nombre_producto: itemInfo.nombre
    });
    itemsMarcadosDetalleCache.set(compatKey, checkboxId);
    return;
  }

  const payload = {
    checkbox_id: checkboxId,
    marcado: true,
    updated_at: new Date().toISOString(),
    pedido_id: itemInfo.pedidoId,
    producto_id: itemInfo.productoId,
    cantidad: itemInfo.cantidad,
    nombre_producto: itemInfo.nombre
  };

  let error = null;

  if (existente) {
    ({ error } = await supabase_client
      .from('carga_marcados')
      .update({
        marcado: true,
        updated_at: payload.updated_at,
        pedido_id: payload.pedido_id,
        producto_id: payload.producto_id,
        cantidad: payload.cantidad,
        nombre_producto: payload.nombre_producto
      })
      .eq('checkbox_id', checkboxId));
  } else {
    ({ error } = await supabase_client
      .from('carga_marcados')
      .insert(payload));
  }

  if (error) throw error;

  itemsMarcadosCache.add(checkboxId);
  itemsMarcadosDetalleCache.set(
    crearClaveCompatibilidadCarga(itemInfo.pedidoId, {
      producto_id: itemInfo.productoId,
      cantidad: itemInfo.cantidad,
      nombre_producto: itemInfo.nombre
    }),
    checkboxId
  );

  await descontarStockItem(itemInfo);
  return { modo: 'legacy' };
}

async function eliminarItemMarcado(checkboxId) {
  const { data: existenteRpc, error: errorExistenteRpc } = await supabase_client
    .from('carga_marcados')
    .select('checkbox_id, pedido_id, producto_id, cantidad, nombre_producto')
    .eq('checkbox_id', checkboxId)
    .maybeSingle();

  if (errorExistenteRpc) throw errorExistenteRpc;

  if (existenteRpc) {
    const resultadoRpc = await procesarCambioCargaAtomico(checkboxId, {
      pedidoId: existenteRpc.pedido_id,
      productoId: existenteRpc.producto_id,
      cantidad: existenteRpc.cantidad,
      nombre: existenteRpc.nombre_producto
    }, false);

    if (resultadoRpc) {
      itemsMarcadosCache.delete(checkboxId);
      itemsMarcadosDetalleCache.delete(crearClaveCompatibilidadCarga(existenteRpc.pedido_id, existenteRpc));
      if (resultadoRpc.resultado_stock_nuevo !== null && resultadoRpc.resultado_stock_nuevo !== undefined) {
        actualizarStockCacheProducto(existenteRpc.producto_id, resultadoRpc.resultado_stock_nuevo);
      }
      return { modo: 'rpc', resultado: resultadoRpc };
    }
  }

  const { data: existente, error: errorExistente } = await supabase_client
    .from('carga_marcados')
    .select('checkbox_id, pedido_id, producto_id, cantidad, nombre_producto')
    .eq('checkbox_id', checkboxId)
    .maybeSingle();

  if (errorExistente) throw errorExistente;
  if (!existente) {
    itemsMarcadosCache.delete(checkboxId);
    return;
  }

  const { data: itemDesmarcado, error: errorUpdate } = await supabase_client
    .from('carga_marcados')
    .update({ marcado: false, updated_at: new Date().toISOString() })
    .eq('checkbox_id', checkboxId)
    .eq('marcado', true)
    .select('checkbox_id, pedido_id, producto_id, cantidad, nombre_producto')
    .maybeSingle();

  if (errorUpdate) throw errorUpdate;

  if (!itemDesmarcado) {
    itemsMarcadosCache.delete(checkboxId);
    if (existente?.pedido_id) {
      itemsMarcadosDetalleCache.delete(crearClaveCompatibilidadCarga(existente.pedido_id, existente));
    }
    return;
  }

  itemsMarcadosCache.delete(checkboxId);
  itemsMarcadosDetalleCache.delete(crearClaveCompatibilidadCarga(itemDesmarcado.pedido_id, itemDesmarcado));
  await devolverStockItem(itemDesmarcado);
  return { modo: 'legacy' };
}

async function handleCheckboxChange(event) {
  if (!event.target.classList.contains('carga-checkbox')) return;

  const checkbox = event.target;
  const itemCarga = checkbox.closest('.carga-item');
  if (!itemCarga) return;

  const checkboxId = itemCarga.dataset.checkboxId;
  const persistedCheckboxId = itemCarga.dataset.persistedCheckboxId || checkboxId;
  const checked = checkbox.checked;
  const itemInfo = {
    productoId: itemCarga.dataset.productoId ? parseInt(itemCarga.dataset.productoId, 10) : null,
    cantidad: parseInt(itemCarga.dataset.cantidad, 10) || 0,
    nombre: itemCarga.dataset.nombre || '',
    pedidoId: itemCarga.dataset.pedidoId || ''
  };

  checkbox.disabled = true;
  setSyncStatus('Guardando cambio...', 'warn');

  try {
    itemCarga.classList.toggle('checked', checked);

    const resultadoOperacion = checked
      ? await agregarItemMarcado(checkboxId, itemInfo)
      : await eliminarItemMarcado(persistedCheckboxId);

    if (resultadoOperacion?.modo === 'rpc') {
      itemCarga.dataset.persistedCheckboxId = checked ? checkboxId : '';
      cargarItemsMarcados().catch((error) => {
        console.warn('No se pudo refrescar cache de carga tras RPC:', error);
      });
    } else {
      await cargarItemsMarcados();

      const marcadoConfirmadoEnBase = await confirmarEstadoMarcado(checkboxId, checked);
      const marcadoConfirmadoEnCache = estaMarcadoSegunCache({
        checkboxId,
        legacyCheckboxId: itemCarga.dataset.legacyCheckboxId,
        compatKey: itemCarga.dataset.compatKey
      });

      if (checked && (!marcadoConfirmadoEnBase || !marcadoConfirmadoEnCache)) {
        throw new Error('No se pudo confirmar el marcado en la base de datos');
      }

      if (!checked && (!marcadoConfirmadoEnBase || marcadoConfirmadoEnCache)) {
        throw new Error('No se pudo confirmar el desmarcado en la base de datos');
      }

      itemCarga.dataset.persistedCheckboxId = marcadoConfirmadoEnCache ? obtenerCheckboxPersistido({
        checkboxId,
        legacyCheckboxId: itemCarga.dataset.legacyCheckboxId,
        compatKey: itemCarga.dataset.compatKey
      }) : '';
    }

    aplicarFiltrosCarga();
  } catch (error) {
    console.error('Error actualizando item de carga:', error);
    checkbox.checked = !checked;
    itemCarga.classList.toggle('checked', !checked);
    setSyncStatus('No se pudo guardar el cambio', 'error');
    alert(crearMensajeErrorCambioCarga(error, itemInfo, checked));
  } finally {
    checkbox.disabled = false;
  }
}

async function recargarVistaCarga(opciones = {}) {
  const { silencioso = false } = opciones;
  if (!silencioso) {
    mostrarLoading('Actualizando manifiesto...');
    setSyncStatus('Consultando datos en la nube...', 'warn');
  }

  try {
    const [pedidos] = await Promise.all([
      obtenerPedidosPendientes(),
      cargarItemsMarcados()
    ]);

    await cargarMetadatosProductosCarga(pedidos);
    todosLosPedidosCarga = pedidos;
    aplicarFiltrosCarga();
  } catch (error) {
    console.error('Error recargando manifiesto:', error);
    mostrarLoading('No se pudo cargar el manifiesto de carga.');
    setSyncStatus('Error de sincronizacion', 'error');
  }
}

function programarRefrescoCarga(origen) {
  setSyncStatus(origen, 'warn');
  clearTimeout(refrescoProgramadoCarga);
  refrescoProgramadoCarga = setTimeout(() => {
    recargarVistaCarga({ silencioso: true });
  }, 260);
}

function conectarTiempoRealCarga() {
  realtimePedidosCarga = supabase_client
    .channel('realtime:public:pedidos:ver-carga')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
      programarRefrescoCarga('Actualizando pedidos...');
    })
    .subscribe();

  realtimeMarcadosCarga = supabase_client
    .channel('realtime:public:carga_marcados:ver-carga')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'carga_marcados' }, () => {
      programarRefrescoCarga('Actualizando marcados...');
    })
    .subscribe();
}

function limpiarFiltrosCarga() {
  document.getElementById('buscarCarga').value = '';
  window.filtroRapidoCargaActual = 'hoy';
  document.getElementById('filtroEstadoCarga').value = 'todos';
  aplicarFiltrosCarga();
}

function conectarEventos() {
  const contenedor = document.getElementById('cargaContenido');
  contenedor.addEventListener('change', handleCheckboxChange);

  document.getElementById('cargaResumenPreparacion').addEventListener('click', (event) => {
    const boton = event.target.closest('#btnToggleResumenPreparacion');
    if (!boton) return;
    alternarResumenPreparacion();
  });

  document.getElementById('buscarCarga').addEventListener('input', () => {
    clearTimeout(filtrosCargaTimeout);
    filtrosCargaTimeout = setTimeout(aplicarFiltrosCarga, 160);
  });

  document.querySelectorAll('.carga-quick-filter').forEach((boton) => {
    boton.addEventListener('click', () => {
      window.filtroRapidoCargaActual = boton.dataset.dateFilter || 'hoy';
      aplicarFiltrosCarga();
    });
  });

  document.getElementById('filtroEstadoCarga').addEventListener('change', aplicarFiltrosCarga);
  document.getElementById('btnLimpiarFiltrosCarga').addEventListener('click', limpiarFiltrosCarga);
  document.getElementById('btnRecargarCarga').addEventListener('click', () => recargarVistaCarga());
  document.getElementById('btnCerrarSesionCarga').addEventListener('click', async () => {
    await supabaseLogout();
    window.location.href = '../index.html';
  });
}

async function verificarPermisoCarga() {
  const { data: { user } } = await supabase_client.auth.getUser();
  if (!user) {
    window.location.href = '../index.html';
    return false;
  }
  return true;
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    window.filtroRapidoCargaActual = CARGA_DEFAULT_FILTERS.filtroRapido;
    supabase_client = inicializarSupabase();
    if (!supabase_client) {
      alert('No se pudo inicializar Supabase.');
      return;
    }

    const permitido = await verificarPermisoCarga();
    if (!permitido) return;

    restaurarFiltrosCarga();
    conectarEventos();
    conectarTiempoRealCarga();
    await recargarVistaCarga();
  } catch (error) {
    console.error('Error inicializando ver-carga:', error);
    mostrarLoading('Error inicializando la vista de carga.');
    setSyncStatus('Error de inicializacion', 'error');
  }
});

window.addEventListener('beforeunload', () => {
  if (realtimePedidosCarga) {
    supabase_client.removeChannel(realtimePedidosCarga);
  }
  if (realtimeMarcadosCarga) {
    supabase_client.removeChannel(realtimeMarcadosCarga);
  }
});

/* ============================================================================
 * Sistema de Strikes de Clientes — Sabrofood
 * Módulo compartido entre Panel Admin (local/) y Panel Repartidor (repartidor/)
 *
 * MODO ACTUAL: DEMO LOCAL (sin Supabase).
 *  - La capa de datos (`recurso`) persiste en localStorage y imita la API de
 *    supabase-js (devuelve { data, error }) para que la fase Supabase solo
 *    requiera reimplementar `recurso` sin tocar la UI.
 *
 * MODELO CONFIRMADO (2026-09-20):
 *  - Strike individual: estado ACTIVO / DESCARTADO / EXPIRADO (EXPIRADO es
 *    DERIVADO por fecha: estado='ACTIVO' y expira_en < ahora; sin jobs).
 *  - Vigencia por strike: 6 meses (constante VIGENCIA_MESES).
 *  - Estado del cliente NO vive en las filas de strike: se calcula desde la
 *    tabla de DECISIONES (BANEO / QUITAR_BANEO / EN_OBSERVACION /
 *    QUITAR_OBSERVACION) recorridas en orden cronológico.
 *  - Motivos oficiales (5, obligatorio seleccionado; observación opcional).
 *  - pedido_id obligatorio desde el pedido (origen 'PEDIDO'); NULL + origen
 *    'HISTORIAL' para reportes tardíos.
 *  - Escalamiento por ACTIVOS vigentes: 0 NORMAL, 1 ADVERTENCIA,
 *    2 ALERTA REFORZADA, 3+ PENDIENTE DE REVISIÓN (nunca baneo automático).
 *  - BANEADO bloquea la confirmación de nuevos pedidos (lo decide el admin).
 *    EN OBSERVACIÓN no bloquea (solo aviso).
 *  - Nada se borra: descartar marca la fila (DESCARTADO + quién/cuándo) y las
 *    decisiones forman un historial permanente.
 * ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constantes                                                          *
   * ------------------------------------------------------------------ */
  var VIGENCIA_MESES = 6;
  var LIMITE_REVISION = 3;

  var MOTIVOS_OFICIALES = [
    { id: 'no_pago',           etiqueta: '💸 No pagó el pedido' },
    { id: 'no_contesto',       etiqueta: '📵 No contestó el teléfono' },
    { id: 'trato_irrespetuoso',etiqueta: '😠 Trato irrespetuoso' },
    { id: 'direccion_falsa',   etiqueta: '📍 Dirección falsa' },
    { id: 'rechazo_sin_motivo',etiqueta: '🚪 Rechazó sin motivo' }
  ];

  var TIPOS_DECISION = {
    BANEO:              { etiqueta: '🚫 BANEO',               puedeQuitarse: true,  quita: 'QUITAR_BANEO' },
    QUITAR_BANEO:       { etiqueta: '✅ Quitar baneo',        puedeQuitarse: false, quita: null },
    EN_OBSERVACION:     { etiqueta: '👁️ En observación',      puedeQuitarse: true,  quita: 'QUITAR_OBSERVACION' },
    QUITAR_OBSERVACION: { etiqueta: '👉 Quitar observación',  puedeQuitarse: false, quita: null }
  };

  var ORIGENES = { PEDIDO: 'PEDIDO', HISTORIAL: 'HISTORIAL' };

  var CLAVE_STRIKES = 'sabrofood_demo_strikes';
  var CLAVE_DECISIONES = 'sabrofood_demo_decisiones';

  /* ------------------------------------------------------------------ *
   * Helpers básicos                                                     *
   * ------------------------------------------------------------------ */
  function escapeHtml(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function generarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function formatoFecha(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso || '';
      return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
             ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso || ''; }
  }

  function hoyISO() { return new Date().toISOString(); }

  function mesesDesdeAhora(meses) {
    var d = new Date();
    d.setMonth(d.getMonth() + meses);
    return d.toISOString();
  }

  /* ------------------------------------------------------------------ *
   * Lógica pura del modelo                                              *
   * ------------------------------------------------------------------ */

  /** Deriva el estado real de una fila de strike. */
  function estadoStrike(strike) {
    if (!strike) return null;
    if (strike.estado === 'DESCARTADO') return 'DESCARTADO';
    if (strike.expira_en && new Date(strike.expira_en).getTime() < Date.now()) return 'EXPIRADO';
    return 'ACTIVO';
  }

  function esActivo(strike) { return estadoStrike(strike) === 'ACTIVO'; }

  function contarActivos(strikes) {
    if (!Array.isArray(strikes)) return 0;
    return strikes.filter(esActivo).length;
  }

  /**
   * Escalamiento por cantidad de strikes ACTIVOS vigentes.
   * 0 → NORMAL · 1 → ADVERTENCIA · 2 → ALERTA_REFORZADA · 3+ → PENDIENTE_REVISION
   */
  function nivelPorConteo(activos) {
    if (activos >= LIMITE_REVISION) return 'PENDIENTE_REVISION';
    if (activos === 2) return 'ALERTA_REFORZADA';
    if (activos === 1) return 'ADVERTENCIA';
    return 'NORMAL';
  }

  function infoNivel(nivel) {
    switch (nivel) {
      case 'PENDIENTE_REVISION':
        return { etiqueta: '🔎 Pendiente de revisión', clase: 'sb-stk-nivel--revision', texto: 'Tiene ' + LIMITE_REVISION + ' o más strikes activos. No hay bloqueo automático: el administrador debe revisar.' };
      case 'ALERTA_REFORZADA':
        return { etiqueta: '⚠️ Alerta reforzada', clase: 'sb-stk-nivel--alerta', texto: '2 strikes activos. Sugerimos cobrar contra entrega o en efectivo.' };
      case 'ADVERTENCIA':
        return { etiqueta: '⚠️ Advertencia', clase: 'sb-stk-nivel--advertencia', texto: '1 strike activo. Puede continuar con normalidad.' };
      default:
        return { etiqueta: '✅ Normal', clase: 'sb-stk-nivel--ok', texto: 'Sin strikes activos.' };
    }
  }

  /**
   * Estado vigente del cliente a partir del historial de decisiones
   * (se recorre en orden cronológico; la última manda).
   */
  function estadoDecisionActual(decisiones) {
    var estado = { baneado: false, enObservacion: false, ultimaDecision: null };
    if (!Array.isArray(decisiones)) return estado;
    decisiones.slice().sort(function (a, b) { return new Date(a.decidido_en) - new Date(b.decidido_en); }).forEach(function (d) {
      var tipo = d.tipo || '';
      if (tipo === 'BANEO') estado.baneado = true;
      else if (tipo === 'QUITAR_BANEO') estado.baneado = false;
      else if (tipo === 'EN_OBSERVACION') estado.enObservacion = true;
      else if (tipo === 'QUITAR_OBSERVACION') estado.enObservacion = false;
      estado.ultimaDecision = d;
    });
    return estado;
  }

  /**
   * Construye (y valida) el registro de un strike nuevo.
   *  - pedidoId obligatorio si origen === 'PEDIDO'
   *  - motivos: solo los oficiales
   *  - observacion opcional
   */
  function construirRegistro(opts) {
    var telefono = String(opts.telefono || '').replace(/\D/g, '');
    var motivo = String(opts.motivo || '').trim();
    var origen = opts.origen === ORIGENES.PEDIDO ? ORIGENES.PEDIDO : ORIGENES.HISTORIAL;
    var pedidoId = opts.pedidoId ? String(opts.pedidoId).trim() : null;
    var observacion = String(opts.observacion || '').trim();

    if (telefono.length < 6) return { ok: false, mensaje: 'El teléfono debe tener al menos 6 dígitos.' };
    if (!MOTIVOS_OFICIALES.some(function (m) { return m.id === motivo; })) {
      return { ok: false, mensaje: 'Debes seleccionar un motivo oficial del incidente.' };
    }
    if (origen === ORIGENES.PEDIDO && !pedidoId) {
      return { ok: false, mensaje: 'Falta el pedido asociado al incidente (origen PEDIDO).' };
    }

    return {
      ok: true,
      strike: {
        id: generarId(),
        telefono: telefono,
        nombre: String(opts.nombre || '').trim(),
        motivo: motivo,
        observacion: observacion,
        pedido_id: pedidoId,
        origen: origen,
        registrado_por: String(opts.registrado_por || 'desconocido'),
        creado_en: hoyISO(),
        expira_en: mesesDesdeAhora(VIGENCIA_MESES),
        estado: 'ACTIVO',
        descartado_por: null,
        descartado_en: null,
        motivo_descarte: null
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * Capa DEMO (localStorage) — imita la API de supabase-js              *
   * ------------------------------------------------------------------ */
  var demo = (function () {
    function leerStrikes() {
      try { return JSON.parse(localStorage.getItem(CLAVE_STRIKES)) || []; }
      catch (e) { return []; }
    }
    function guardarStrikes(lista) {
      localStorage.setItem(CLAVE_STRIKES, JSON.stringify(lista));
    }
    function leerDecisiones() {
      try { return JSON.parse(localStorage.getItem(CLAVE_DECISIONES)) || []; }
      catch (e) { return []; }
    }
    function guardarDecisiones(lista) {
      localStorage.setItem(CLAVE_DECISIONES, JSON.stringify(lista));
    }

    /** SELECT strikes por teléfono (sin modificar el almacén). */
    function obtenerStrikes(telefono) {
      var t = String(telefono || '').replace(/\D/g, '');
      var lista = leerStrikes().filter(function (s) { return s.telefono === t; })
        .sort(function (a, b) { return new Date(b.creado_en) - new Date(a.creado_en); });
      return { data: lista, error: null };
    }

    function obtenerDecisiones(telefono) {
      var t = String(telefono || '').replace(/\D/g, '');
      var lista = leerDecisiones().filter(function (d) { return d.telefono === t; })
        .sort(function (a, b) { return new Date(b.decidido_en) - new Date(a.decidido_en); });
      return { data: lista, error: null };
    }

    /** INSERT de strike. */
    function registrarStrike(strike) {
      var lista = leerStrikes();
      lista.push(strike);
      guardarStrikes(lista);
      return { data: strike, error: null };
    }

    /** Marca una fila como DESCARTADA (nunca borra del historial). */
    function descartarStrike(payload) {
      var lista = leerStrikes();
      var objetivo = lista.find(function (s) { return s.id === payload.strikeId; });
      if (!objetivo) return { data: null, error: { message: 'Strike no encontrado' } };
      objetivo.estado = 'DESCARTADO';
      objetivo.descartado_por = String(payload.descartado_por || 'desconocido');
      objetivo.descartado_en = hoyISO();
      objetivo.motivo_descarte = String(payload.motivo_descarte || '');
      guardarStrikes(lista);
      return { data: objetivo, error: null };
    }

    /** INSERT de decisión (BANEO / QUITAR_BANEO / EN_OBSERVACION / QUITAR_OBSERVACION). */
    function registrarDecision(decision) {
      var lista = leerDecisiones();
      lista.push(decision);
      guardarDecisiones(lista);
      return { data: decision, error: null };
    }

    /** Consulta consolidada del cliente (strikes + decisiones + contexto + nivel). */
    function consultarCliente(telefono) {
      var t = String(telefono || '').replace(/\D/g, '');
      var strikes = (obtenerStrikes(t).data || []).slice();
      var decisiones = obtenerDecisiones(t).data || [];
      var contexto = estadoDecisionActual(decisiones);
      var activos = contarActivos(strikes);
      return {
        data: {
          telefono: t,
          strikes: strikes,
          decisiones: decisiones,
          contexto: contexto,
          activos: activos,
          nivel: nivelPorConteo(activos),
          infoNivel: infoNivel(nivelPorConteo(activos))
        },
        error: null
      };
    }

    /** Todos los clientes que tienen datos (para el panel de admin). */
    function obtenerClientes() {
      var porTelefono = {};
      leerStrikes().forEach(function (s) {
        if (!porTelefono[s.telefono]) porTelefono[s.telefono] = { telefono: s.telefono, nombre: s.nombre || '' };
      });
      leerDecisiones().forEach(function (d) {
        if (!porTelefono[d.telefono]) porTelefono[d.telefono] = { telefono: d.telefono, nombre: '' };
      });
      return {
        data: Object.keys(porTelefono).map(function (tel) {
          var c = consultarCliente(tel);
          c.data.nombre = porTelefono[tel].nombre || '';
          return c.data;
        }),
        error: null
      };
    }

    /* Semilla de ejemplo: permite probar pendientes, alertas, advertencia,
     * observación, baneo (que bloquea pedidos) y expirados/descartados. */
    function sembrarEjemplos() {
      var ahora = Date.now();
      function hace(dias) { return new Date(ahora - dias * 24 * 3600 * 1000).toISOString(); }
      function dentroDe(meses) { var d = new Date(ahora); d.setMonth(d.getMonth() + meses); return d.toISOString(); }

      function strike(telefono, nombre, motivo, diasAtras, expiraMeses, extras) {
        var s = {
          id: generarId(),
          telefono: telefono,
          nombre: nombre,
          motivo: motivo,
          observacion: '',
          pedido_id: null,
          origen: 'HISTORIAL',
          registrado_por: 'admin@sabrofood.com',
          creado_en: hace(diasAtras),
          expira_en: dentroDe(expiraMeses),
          estado: 'ACTIVO',
          descartado_por: null,
          descartado_en: null,
          motivo_descarte: null
        };
        if (extras) Object.assign(s, extras);
        return s;
      }

      var strikes = [
        // PENDIENTE DE REVISIÓN (3 activos)
        strike('948772488', 'María González', 'no_pago', 30, 5),
        strike('948772488', 'María González', 'direccion_falsa', 20, 5.5),
        strike('948772488', 'María González', 'no_contesto', 5, 6),
        // ALERTA REFORZADA (2 activos)
        strike('987654321', 'Pedro Soto', 'rechazo_sin_motivo', 15, 5),
        strike('987654321', 'Pedro Soto', 'no_pago', 3, 6),
        // ADVERTENCIA (1 activo) + 1 descartado visible (no cuenta)
        strike('965432109', 'Carla Rojas', 'no_contesto', 8, 5.5),
        strike('965432109', 'Carla Rojas', 'trato_irrespetuoso', 40, 4, { estado: 'DESCARTADO', descartado_por: 'admin@sabrofood.com', descartado_en: hace(30), motivo_descarte: 'Cliente regularizó su situación' }),
        // NORMAL (el único activo ya expiró: expira_en pasado)
        strike('912345678', 'Ana Martínez', 'no_pago', 200, -1),
        // BANEADO (3 activos + decisión BANEO) — bloquea la confirmación de pedidos
        strike('945678901', 'Jorge Pérez', 'direccion_falsa', 25, 5),
        strike('945678901', 'Jorge Pérez', 'no_contesto', 12, 6),
        strike('945678901', 'Jorge Pérez', 'trato_irrespetuoso', 2, 6),
        // EN OBSERVACIÓN (1 activo + decisión EN_OBSERVACION) — no bloquea, avisa
        strike('977766655', 'Claudia Vera', 'rechazo_sin_motivo', 6, 6)
      ];

      var decisiones = [
        { id: generarId(), telefono: '945678901', tipo: 'BANEO', decidido_por: 'admin@sabrofood.com', decidido_en: hace(1), nota: 'Tercer incidente reportado' },
        { id: generarId(), telefono: '945678901', tipo: 'QUITAR_BANEO', decidido_por: 'admin@sabrofood.com', decidido_en: hace(5), nota: 'Error de sistema (prueba de historial)' },
        { id: generarId(), telefono: '945678901', tipo: 'BANEO', decidido_por: 'admin@sabrofood.com', decidido_en: hace(1), nota: 'Cliente reincidente en no pago' },
        { id: generarId(), telefono: '977766655', tipo: 'EN_OBSERVACION', decidido_por: 'admin@sabrofood.com', decidido_en: hace(2), nota: 'Seguimiento por reclamo del cliente' }
      ];

      guardarStrikes(strikes);
      guardarDecisiones(decisiones);
      return { data: { strikes: strikes.length, decisiones: decisiones.length }, error: null };
    }

    return {
      obtenerStrikes: obtenerStrikes,
      obtenerDecisiones: obtenerDecisiones,
      registrarStrike: registrarStrike,
      descartarStrike: descartarStrike,
      registrarDecision: registrarDecision,
      consultarCliente: consultarCliente,
      obtenerClientes: obtenerClientes,
      sembrarEjemplos: sembrarEjemplos
    };
  })();

  /* ------------------------------------------------------------------ *
   * Capa SUPABASE (modo definitivo)                                     *
   * Misma API { data, error } que la demo. Requiere que existan las     *
   * tablas strikes_clientes y decisiones_cliente (SQL en                *
   * docs/SETUP-RLS-STRIKES.md) y sesión iniciada (roles por email).     *
   * ------------------------------------------------------------------ */
  var supabase = (function () {
    function clienteActual() {
      // Admin local/ expone la variable global del proyecto; repartidor expone getSupabaseClient()
      if (typeof supabase_client !== 'undefined' && supabase_client) return supabase_client;
      if (typeof getSupabaseClient === 'function') {
        try { return getSupabaseClient(); } catch (e) { return null; }
      }
      return null;
    }
    function mapear(err) {
      return { data: null, error: err };
    }
    function sinCliente() {
      var haySesion = false;
      try {
        haySesion = !!(localStorage.getItem('sabrofood-auth') || localStorage.getItem(sessionStorage && sessionStorage.getItem('sabrofood-auth')));
      } catch (e) { /* localStorage/sessionStorage no disponible */ }
      var mensaje = haySesion
        ? 'Supabase no disponible en esta página. Tienes una sesión guardada, pero no se encontró el cliente. Recarga (Ctrl+Shift+R) o abre desde el panel principal.'
        : 'Supabase no disponible. Inicia sesión en el panel para usar el modo real.';
      return { data: null, error: { message: mensaje } };
    }

    function armarCliente(t, nombre, strikes, decisiones) {
      var contexto = estadoDecisionActual(decisiones || []);
      var activos = contarActivos(strikes || []);
      return {
        telefono: t,
        nombre: nombre || '',
        strikes: strikes || [],
        decisiones: decisiones || [],
        contexto: contexto,
        activos: activos,
        nivel: nivelPorConteo(activos),
        infoNivel: infoNivel(nivelPorConteo(activos))
      };
    }

    async function obtenerStrikes(telefono) {
      var c = clienteActual();
      if (!c) return sinCliente();
      var t = String(telefono || '').replace(/\D/g, '');
      var res = await c.from('strikes_clientes').select('*').eq('telefono', t).order('creado_en', { ascending: false });
      return res.error ? mapear(res.error) : { data: res.data || [], error: null };
    }

    async function obtenerDecisiones(telefono) {
      var c = clienteActual();
      if (!c) return sinCliente();
      var t = String(telefono || '').replace(/\D/g, '');
      var res = await c.from('decisiones_cliente').select('*').eq('telefono', t).order('decidido_en', { ascending: false });
      return res.error ? mapear(res.error) : { data: res.data || [], error: null };
    }

    async function consultarCliente(telefono) {
      var c = clienteActual();
      if (!c) return sinCliente();
      var t = String(telefono || '').replace(/\D/g, '');
      var rs = await c.from('strikes_clientes').select('*').eq('telefono', t).order('creado_en', { ascending: false });
      if (rs.error) return mapear(rs.error);
      var rd = await c.from('decisiones_cliente').select('*').eq('telefono', t).order('decidido_en', { ascending: false });
      if (rd.error) return mapear(rd.error);
      var strikes = rs.data || [];
      var nombre = (strikes.length && strikes[0].nombre) ? strikes[0].nombre : '';
      return { data: armarCliente(t, nombre, strikes, rd.data || []), error: null };
    }

    /* Panel de admin: últimos 500 strikes, agrupa por teléfono y trae las
       decisiones en lotes (in). Limitación documentada en docs/. */
    async function obtenerClientes() {
      var c = clienteActual();
      if (!c) return sinCliente();
      var rs = await c.from('strikes_clientes').select('*').order('creado_en', { ascending: false }).limit(500);
      if (rs.error) return mapear(rs.error);
      var strikes = rs.data || [];
      var porTelefono = {};
      strikes.forEach(function (s) {
        if (!porTelefono[s.telefono]) porTelefono[s.telefono] = { strikes: [], nombre: s.nombre || '' };
        porTelefono[s.telefono].strikes.push(s);
      });
      var telfs = Object.keys(porTelefono);
      var decisiones = [];
      for (var i = 0; i < telfs.length; i += 100) {
        var lote = telfs.slice(i, i + 100);
        var rd = await c.from('decisiones_cliente').select('*').in('telefono', lote);
        if (rd.error) return mapear(rd.error);
        decisiones = decisiones.concat(rd.data || []);
      }
      var porDec = {};
      decisiones.forEach(function (d) {
        (porDec[d.telefono] = porDec[d.telefono] || []).push(d);
      });
      return {
        data: telfs.map(function (t) {
          return armarCliente(t, porTelefono[t].nombre, porTelefono[t].strikes, porDec[t] || []);
        }),
        error: null
      };
    }

    async function registrarStrike(strike) {
      var c = clienteActual();
      if (!c) return sinCliente();
      var res = await c.from('strikes_clientes').insert(strike);
      return res.error ? mapear(res.error)
        : { data: (res.data && res.data[0]) ? res.data[0] : strike, error: null };
    }

    async function descartarStrike(payload) {
      var c = clienteActual();
      if (!c) return sinCliente();
      var res = await c.from('strikes_clientes')
        .update({
          estado: 'DESCARTADO',
          descartado_por: String(payload.descartado_por || 'desconocido'),
          descartado_en: new Date().toISOString(),
          motivo_descarte: String(payload.motivo_descarte || '')
        })
        .eq('id', payload.strikeId);
      return res.error ? mapear(res.error) : { data: { id: payload.strikeId }, error: null };
    }

    async function registrarDecision(decision) {
      var c = clienteActual();
      if (!c) return sinCliente();
      var res = await c.from('decisiones_cliente').insert(decision);
      return res.error ? mapear(res.error)
        : { data: (res.data && res.data[0]) ? res.data[0] : decision, error: null };
    }

    function sembrarEjemplos() {
      return { data: null, error: { message: 'La semilla de ejemplo solo está disponible en modo demo (localStorage).' } };
    }

    return {
      obtenerStrikes: obtenerStrikes,
      obtenerDecisiones: obtenerDecisiones,
      consultarCliente: consultarCliente,
      obtenerClientes: obtenerClientes,
      registrarStrike: registrarStrike,
      descartarStrike: descartarStrike,
      registrarDecision: registrarDecision,
      sembrarEjemplos: sembrarEjemplos
    };
  })();

  /* ------------------------------------------------------------------ *
   * Conmutador de capa de datos: 'demo' (localStorage) | 'supabase'     *
   * 'demo'    = MODO PRÁCTICA (datos inventados, sin BD)                *
   * 'supabase'= MODO REAL (contra las tablas de Supabase)               *
   * El admin elige desde el panel de strikes (local/strikes.html); la   *
   * elección se persiste y la respetan todos los paneles (pedidos,      *
   * historial, reparto).                                                *
   * ⚠️ 'supabase' requiere ejecutar el SQL de docs/SETUP-RLS-STRIKES.md *
   * ------------------------------------------------------------------ */
  var MODO = 'demo'; // ← default si el admin nunca eligió (para el despliegue final puede ser 'supabase')

  function capaActual() {
    return MODO === 'supabase' ? supabase : demo;
  }

  function setModo(nuevo) {
    if (nuevo === 'supabase' || nuevo === 'demo') {
      MODO = nuevo;
      try { localStorage.setItem('sabrofood_strikes_modo', nuevo); } catch (e) { /* sin persistencia */ }
    }
    return MODO;
  }
  function getModo() { return MODO; }

  // Al cargar, restaura la elección de modo persistida por el admin.
  // Si nunca eligió, gana el MODO por defecto de la constante de arriba.
  try {
    var modoPersistido = localStorage.getItem('sabrofood_strikes_modo');
    if (modoPersistido === 'demo' || modoPersistido === 'supabase') MODO = modoPersistido;
  } catch (e) { /* localStorage no disponible */ }

  // Delegador: misma API en ambos modos (la UI no cambia al conmutar)
  var recurso = {};
  ['obtenerStrikes', 'obtenerDecisiones', 'consultarCliente', 'obtenerClientes',
   'registrarStrike', 'descartarStrike', 'registrarDecision', 'sembrarEjemplos'].forEach(function (k) {
    recurso[k] = function () {
      return capaActual()[k].apply(capaActual(), arguments);
    };
  });

  /* ------------------------------------------------------------------ *
   * UI inyectada (modales, avisos, secciones) — CSS propio con prefijo   *
   * ------------------------------------------------------------------ */
  var CSS_MARCADOR = 'sb-stk-css-marcador';
  var onVerContexto = null; // callback configurable por cada panel

  var CSS = [
    '#' + CSS_MARCADOR + '{position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;}',
    '.sb-stk-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:12px;}',
    '.sb-stk-modal{background:#fff;border-radius:14px;max-width:460px;width:100%;max-height:88vh;overflow-y:auto;box-shadow:0 18px 50px rgba(0,0,0,.35);animation:sbStkIn .18s ease;}',
    '@keyframes sbStkIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}',
    '.sb-stk-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #eee;position:sticky;top:0;background:#fff;border-radius:14px 14px 0 0;}',
    '.sb-stk-title{font-size:16px;font-weight:700;color:#1c1c1c;margin:0;}',
    '.sb-stk-close{background:none;border:none;font-size:22px;line-height:1;cursor:pointer;color:#888;padding:2px 6px;}',
    '.sb-stk-body{padding:16px;}',
    '.sb-stk-moto{display:block;border:1.5px solid #ddd;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;font-size:14px;transition:border-color .12s, background .12s;}',
    '.sb-stk-moto:hover{border-color:#f59e0b;}',
    '.sb-stk-moto--sel{border-color:#f59e0b;background:#fef3c7;}',
    '.sb-stk-field{margin-top:12px;}',
    '.sb-stk-field label{display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:4px;}',
    '.sb-stk-field textarea,.sb-stk-field input[type="text"]{width:100%;box-sizing:border-box;border:1.5px solid #ddd;border-radius:8px;padding:9px 10px;font-size:14px;font-family:inherit;resize:vertical;}',
    '.sb-stk-actions{display:flex;gap:8px;margin-top:16px;justify-content:flex-end;flex-wrap:wrap;}',
    '.sb-stk-btn{border:none;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;}',
    '.sb-stk-btn--main{background:#f59e0b;color:#1c1c1c;}',
    '.sb-stk-btn--main:hover{background:#d97706;}',
    '.sb-stk-btn--danger{background:#dc2626;color:#fff;}',
    '.sb-stk-btn--danger:hover{background:#b91c1c;}',
    '.sb-stk-btn--ghost{background:#f1f1f1;color:#444;}',
    '.sb-stk-btn--ghost:hover{background:#e4e4e4;}',
    '.sb-stk-btn[disabled]{opacity:.55;cursor:not-allowed;}',
    '.sb-stk-resumen{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:14px;line-height:1.5;}',
    '.sb-stk-resumen b{color:#1c1c1c;}',
    '.sb-stk-aviso{margin-top:8px;border-radius:10px;padding:8px 10px;font-size:13px;line-height:1.45;display:none;}',
    '.sb-stk-aviso--baneado{display:block;background:#fee2e2;border:1px solid #fecaca;color:#991b1b;}',
    '.sb-stk-aviso--obs{display:block;background:#fef9c3;border:1px solid #fde68a;color:#854d0e;}',
    '.sb-stk-aviso--alerta,.sb-stk-aviso--revision{display:block;background:#ffedd5;border:1px solid #fed7aa;color:#7c2d12;}',
    '.sb-stk-aviso--ok{display:block;background:#dcfce7;border:1px solid #bbf7d0;color:#14532d;}',
    '.sb-stk-aviso button{background:none;border:none;color:#b91c1c;text-decoration:underline;cursor:pointer;font-size:12.5px;padding:0;}',
    '.sb-stk-chip{display:inline-block;font-size:11.5px;font-weight:700;border-radius:999px;padding:3px 9px;margin:0 4px 4px 0;}',
    '.sb-stk-chip--baneado{background:#fee2e2;color:#991b1b;border:1px solid #fecaca;}',
    '.sb-stk-chip--obs{background:#fef9c3;color:#854d0e;border:1px solid #fde68a;}',
    '.sb-stk-chip--nivel{background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;}',
    '.sb-stk-seccion{font-family:inherit;font-size:14px;color:#1c1c1c;}',
    '.sb-stk-cabecera{border:1px solid #e2e8f0;border-left:4px solid #f59e0b;border-radius:10px;padding:10px 12px;margin-bottom:10px;background:#fff;}',
    '.sb-stk-cabecera h4{margin:0 0 4px;font-size:15px;}',
    '.sb-stk-sub{font-size:12px;color:#666;margin-top:2px;}',
    '.sb-stk-lista{display:flex;flex-direction:column;gap:8px;}',
    '.sb-stk-item{border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;background:#fff;}',
    '.sb-stk-item--DESCARTADO{opacity:.62;background:#f8fafc;}',
    '.sb-stk-item--EXPIRADO{opacity:.62;background:#f8fafc;}',
    '.sb-stk-item-top{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;}',
    '.sb-stk-item-titulo{font-weight:600;font-size:13.5px;}',
    '.sb-stk-item-meta{font-size:11.5px;color:#777;margin-top:3px;line-height:1.5;}',
    '.sb-stk-badge{font-size:10.5px;font-weight:700;border-radius:999px;padding:2px 8px;white-space:nowrap;}',
    '.sb-stk-badge--ACTIVO{background:#fee2e2;color:#991b1b;}',
    '.sb-stk-badge--DESCARTADO{background:#e2e8f0;color:#475569;}',
    '.sb-stk-badge--EXPIRADO{background:#e2e8f0;color:#475569;}',
    '.sb-stk-dec{border-top:1px dashed #e2e8f0;margin-top:12px;padding-top:10px;}',
    '.sb-stk-dec h5{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#888;}',
    '.sb-stk-dec-item{font-size:12.5px;padding:5px 0;border-bottom:1px solid #f1f5f9;line-height:1.5;}',
    '.sb-stk-dec-item:last-child{border-bottom:none;}',
    '.sb-stk-sin-datos{color:#94a3b8;font-size:13px;text-align:center;padding:12px 0;}',
    '.sb-stk-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1c1c1c;color:#fff;padding:10px 18px;border-radius:999px;font-size:14px;font-weight:600;z-index:100000;box-shadow:0 8px 24px rgba(0,0,0,.3);animation:sbStkIn .2s ease;}'
  ].join('\n');

  function inyectarEstilos() {
    if (document.getElementById('sb-stk-styles')) return;
    var st = document.createElement('style');
    st.id = 'sb-stk-styles';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function toast(mensaje, ok) {
    if (window.ErrorHandler) {
      try {
        if (ok && ErrorHandler.mostrarExito) ErrorHandler.mostrarExito(mensaje);
        else if (!ok && ErrorHandler.mostrarError) ErrorHandler.mostrarError(mensaje);
        return;
      } catch (e) { /* fallback abajo */ }
    }
    var viejo = document.querySelector('.sb-stk-toast');
    if (viejo) viejo.remove();
    var t = document.createElement('div');
    t.className = 'sb-stk-toast';
    t.style.background = ok ? '#166534' : '#991b1b';
    t.textContent = mensaje;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }

  /* ---- Utilidades de modal ---- */
  var modalActual = null;

  function abrirModalCon(html) {
    cerrarModal();
    inyectarEstilos();
    var backdrop = document.createElement('div');
    backdrop.className = 'sb-stk-backdrop';
    backdrop.innerHTML = '<div class="sb-stk-modal" role="dialog">' + html + '</div>';
    document.body.appendChild(backdrop);
    modalActual = backdrop;
    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop) cerrarModal(); // clic fuera cierra
    });
    var closer = backdrop.querySelector('.sb-stk-close');
    if (closer) closer.addEventListener('click', cerrarModal);
    return backdrop;
  }

  function cerrarModal() {
    if (modalActual) { modalActual.remove(); modalActual = null; }
  }

  /* ---- Modal de registro de strike (2 pasos: formulario → confirmación) ---- */
  function abrirModalRegistrarStrike(opts) {
    opts = opts || {};
    var telefono = String(opts.telefono || '').replace(/\D/g, '');
    var nombre = String(opts.nombre || '').trim();
    if (telefono.length < 6) { toast('Teléfono inválido para registrar el strike', false); return; }

    inyectarEstilos();
    var backdrop = abrirModalCon(
      '<div class="sb-stk-head"><h4 class="sb-stk-title">⚠️ Registrar strike</h4><button type="button" class="sb-stk-close">&times;</button></div>' +
      '<div class="sb-stk-body" id="sbStkCuerpo"></div>'
    );

    var origen = opts.origen === ORIGENES.PEDIDO ? ORIGENES.PEDIDO : ORIGENES.HISTORIAL;
    var pedidoId = opts.pedidoId ? String(opts.pedidoId).trim() : null;

    // Estado interno del formulario
    var estado = { telefono: telefono, nombre: nombre, origen: origen, pedidoId: pedidoId, motivo: null, observacion: '' };

    function renderFormulario() {
      var cuerpo = backdrop.querySelector('#sbStkCuerpo');
      var infoExtra = (origen === ORIGENES.PEDIDO && pedidoId)
        ? '<div class="sb-stk-resumen" style="margin-bottom:10px"><b>Pedido:</b> #' + escapeHtml(pedidoId) + '</div>'
        : '<div class="sb-stk-resumen" style="margin-bottom:10px"><b>Origen:</b> Historial (sin pedido asociado)</div>';
      var radios = MOTIVOS_OFICIALES.map(function (m) {
        var marcado = estado.motivo === m.id ? ' sb-stk-moto--sel' : '';
        return '<div class="sb-stk-moto' + marcado + '" data-sb-moto="' + m.id + '">' + m.etiqueta + '</div>';
      }).join('');

      cuerpo.innerHTML =
        '<div class="sb-stk-cabecera" style="border-left-color:#dc2626">' +
        '  <h4>' + escapeHtml(estado.nombre || ('Cliente ' + estado.telefono)) + '</h4>' +
        '  <div class="sb-stk-sub">📞 ' + escapeHtml(estado.telefono) + '</div>' +
        '</div>' +
        infoExtra +
        '<div style="font-size:12px;font-weight:700;color:#555;margin-bottom:6px">MOTIVO DEL INCIDENTE (obligatorio)</div>' +
        radios +
        '<div class="sb-stk-field"><label>Observación (opcional)</label>' +
        '<textarea rows="2" maxlength="300" placeholder="Detalle breve del incidente...">' + escapeHtml(estado.observacion) + '</textarea></div>' +
        '<div class="sb-stk-actions">' +
        '  <button type="button" class="sb-stk-btn sb-stk-btn--ghost" data-accion="cancelar">Cancelar</button>' +
        '  <button type="button" class="sb-stk-btn sb-stk-btn--danger" data-accion="siguiente">Continuar</button>' +
        '</div>';

      var radiosDom = cuerpo.querySelectorAll('.sb-stk-moto');
      radiosDom.forEach(function (r) {
        r.addEventListener('click', function () {
          radiosDom.forEach(function (x) { x.classList.remove('sb-stk-moto--sel'); });
          r.classList.add('sb-stk-moto--sel');
          estado.motivo = r.dataset.sbMoto;
        });
      });
      var ta = cuerpo.querySelector('textarea');
      if (ta) ta.addEventListener('input', function () { estado.observacion = ta.value; });

      cuerpo.querySelector('[data-accion="cancelar"]').addEventListener('click', cerrarModal);
      cuerpo.querySelector('[data-accion="siguiente"]').addEventListener('click', function () {
        if (!estado.motivo) { toast('Selecciona el motivo oficial del incidente', false); return; }
        renderConfirmacion();
      });
    }

    function renderConfirmacion() {
      var cuerpo = backdrop.querySelector('#sbStkCuerpo');
      var motivoSel = MOTIVOS_OFICIALES.find(function (m) { return m.id === estado.motivo; });
      // Conteo previo para avisar del nivel al que se llegará
      var activosPrevios = 0;
      democonsultaActivos().then(function (n) {
        activosPrevios = n;
        var proximo = activosPrevios + 1;
        var avisoNivel =
          proximo >= LIMITE_REVISION
            ? '<div class="sb-stk-resumen" style="margin-top:10px;border-color:#fca5a5;background:#fef2f2">🔎 Con este registro el cliente quedará con <b>' + proximo + ' activos → PENDIENTE DE REVISIÓN</b> (no hay bloqueo automático; el administrador decidirá).</div>'
            : proximo === 2
              ? '<div class="sb-stk-resumen" style="margin-top:10px;border-color:#fdba74;background:#fff7ed">⚠️ Con este registro el cliente quedará con <b>2 activos → ALERTA REFORZADA</b> (sugerir pago contra entrega/efectivo).</div>'
              : '<div class="sb-stk-resumen" style="margin-top:10px">Con este registro el cliente queda con <b>' + proximo + '</b> strike(s) activo(s).</div>';
        cuerpo.innerHTML =
          '<h4 style="margin:0 0 10px">Confirmar registro</h4>' +
          '<div class="sb-stk-resumen">' +
          '  <b>Cliente:</b> ' + escapeHtml(estado.nombre || estado.telefono) + '<br>' +
          '  <b>Teléfono:</b> ' + escapeHtml(estado.telefono) + '<br>' +
          '  <b>Motivo:</b> ' + escapeHtml(motivoSel ? motivoSel.etiqueta : estado.motivo) + '<br>' +
          (estado.observacion ? '  <b>Observación:</b> ' + escapeHtml(estado.observacion) + '<br>' : '') +
          '  <b>Origen:</b> ' + (origen === ORIGENES.PEDIDO ? 'Pedido #' + escapeHtml(pedidoId || '') : 'Historial') +
          '</div>' +
          avisoNivel +
          '<div class="sb-stk-actions">' +
          '  <button type="button" class="sb-stk-btn sb-stk-btn--ghost" data-accion="atras">Atrás</button>' +
          '  <button type="button" class="sb-stk-btn sb-stk-btn--danger" data-accion="confirmar">✔ Confirmar strike</button>' +
          '</div>';

        cuerpo.querySelector('[data-accion="atras"]').addEventListener('click', renderFormulario);
        cuerpo.querySelector('[data-accion="confirmar"]').addEventListener('click', function () {
          confirmarRegistro();
        });
      });
    }

    function democonsultaActivos() {
      // Devuelve Promise para mantener la firma async (en demo es síncrono;
      // en la fase Supabase será una consulta real asíncrona).
      return Promise.resolve(recurso.consultarCliente(estado.telefono)).then(function (res) {
        return res.data ? res.data.activos : 0;
      });
    }

    function confirmarRegistro() {
      var reg = construirRegistro({
        telefono: estado.telefono,
        nombre: estado.nombre,
        motivo: estado.motivo,
        observacion: estado.observacion,
        pedidoId: estado.origen === ORIGENES.PEDIDO ? estado.pedidoId : null,
        origen: estado.origen,
        registrado_por: registradoPorActual()
      });
      if (!reg.ok) { toast(reg.mensaje, false); return; }
      // Registro por la capa activa (demo localStorage / supabase real)
      Promise.resolve(recurso.registrarStrike(reg.strike)).then(function (res) {
        if (res.error) { toast('Error al registrar: ' + res.error.message, false); return; }
        cerrarModal();
        toast('✅ Strike registrado correctamente', true);
        if (typeof opts.onRegistrado === 'function') opts.onRegistrado(reg.strike);
      });
    }

    renderFormulario();
  }

  /* ---- Modal genérico de decisión del cliente (banear / observar / quitar) ---- */
  function modalDecidir(opciones) {
    opciones = opciones || {};
    var titulo = opciones.titulo || 'Decisión sobre el cliente';
    var tipo = opciones.tipo || 'BANEO';
    var telefono = String(opciones.cliente && opciones.cliente.telefono || '').replace(/\D/g, '');
    var nombre = String(opciones.cliente && opciones.cliente.nombre || '').trim();

    inyectarEstilos();
    var backdrop = abrirModalCon(
      '<div class="sb-stk-head"><h4 class="sb-stk-title">' + titulo + '</h4><button type="button" class="sb-stk-close">&times;</button></div>' +
      '<div class="sb-stk-body"></div>'
    );
    var cuerpo = backdrop.querySelector('.sb-stk-body');
    var opcionesRapidas = opciones.opcionesRapidas || [];
    var eleccion = null;

    cuerpo.innerHTML =
      '<div class="sb-stk-resumen"><b>' + escapeHtml(nombre || telefono) + '</b> · 📞 ' + escapeHtml(telefono) + '</div>' +
      (opcionesRapidas.length
        ? '<div style="font-size:12px;font-weight:700;color:#555;margin:12px 0 6px">MOTIVO (opcional)</div>' +
          opcionesRapidas.map(function (o) {
            return '<div class="sb-stk-moto" data-rapida="' + escapeHtml(o) + '">' + escapeHtml(o) + '</div>';
          }).join('')
        : '') +
      '<div class="sb-stk-field"><label>' + (tipo.indexOf('QUITAR') === 0 ? 'Nota / aclaración (opcional)' : 'Observación (opcional)') + '</label>' +
      '<textarea rows="2" maxlength="300" placeholder="Detalle..."></textarea></div>' +
      '<div class="sb-stk-actions">' +
      '  <button type="button" class="sb-stk-btn sb-stk-btn--ghost" data-accion="cancelar">Cancelar</button>' +
      '  <button type="button" class="sb-stk-btn ' + (tipo === 'BANEO' ? 'sb-stk-btn--danger' : 'sb-stk-btn--main') + '" data-accion="confirmar">' + (tipo === 'BANEO' ? '🚫 Confirmar baneo' : '✔ Confirmar') + '</button>' +
      '</div>';

    cuerpo.querySelectorAll('.sb-stk-moto').forEach(function (r) {
      r.addEventListener('click', function () {
        cuerpo.querySelectorAll('.sb-stk-moto').forEach(function (x) { x.classList.remove('sb-stk-moto--sel'); });
        r.classList.add('sb-stk-moto--sel');
        eleccion = r.dataset.rapida;
      });
    });
    cuerpo.querySelector('[data-accion="cancelar"]').addEventListener('click', cerrarModal);
    cuerpo.querySelector('[data-accion="confirmar"]').addEventListener('click', function () {
      var ta = cuerpo.querySelector('textarea');
      var nota = ta ? ta.value.trim() : '';
      if (eleccion) nota = (nota ? eleccion + ' — ' + nota : eleccion);
      cerrarModal();
      if (typeof opciones.onConfirmar === 'function') {
        opciones.onConfirmar({ tipo: tipo, nota: nota, cliente: { telefono: telefono, nombre: nombre } });
      }
    });
  }

  /* ---- Modal de descarte individual de un strike ---- */
  function modalDescartarStrike(strike, onConfirmar) {
    if (!strike) return;
    inyectarEstilos();
    var backdrop = abrirModalCon(
      '<div class="sb-stk-head"><h4 class="sb-stk-title">🗑️ Descartar strike</h4><button type="button" class="sb-stk-close">&times;</button></div>' +
      '<div class="sb-stk-body"></div>'
    );
    var cuerpo = backdrop.querySelector('.sb-stk-body');
    var motivo = MOTIVOS_OFICIALES.find(function (m) { return m.id === strike.motivo; });

    cuerpo.innerHTML =
      '<div class="sb-stk-resumen">Strike por <b>' + escapeHtml(motivo ? motivo.etiqueta : strike.motivo) + '</b> del ' + escapeHtml(formatoFecha(strike.creado_en)) +
      '<br>El registro queda visible como <b>DESCARTADO</b> (no se borra del historial).</div>' +
      '<div class="sb-stk-field"><label>Motivo del descarte (opcional)</label>' +
      '<input type="text" maxlength="200" placeholder="Ej.: Error, cliente regularizó, etc."></div>' +
      '<div class="sb-stk-actions">' +
      '  <button type="button" class="sb-stk-btn sb-stk-btn--ghost" data-accion="cancelar">Cancelar</button>' +
      '  <button type="button" class="sb-stk-btn sb-stk-btn--main" data-accion="confirmar">✔ Descartar strike</button>' +
      '</div>';

    cuerpo.querySelector('[data-accion="cancelar"]').addEventListener('click', cerrarModal);
    cuerpo.querySelector('[data-accion="confirmar"]').addEventListener('click', function () {
      var inp = cuerpo.querySelector('input');
      var nota = inp ? inp.value.trim() : '';
      cerrarModal();
      if (typeof onConfirmar === 'function') onConfirmar({ strike: strike, motivo_descarte: nota });
    });
  }

  /* ------------------------------------------------------------------ *
   * Render de la sección de strikes (dentro del historial del cliente)  *
   * ------------------------------------------------------------------ */
  function renderSeccionStrikes(container, telefono, nombreCliente, opts) {
    opts = opts || {};
    var esAdmin = opts.esAdmin !== false;
    var t = String(telefono || '').replace(/\D/g, '');
    if (!container) return Promise.resolve();

    return Promise.resolve(recurso.consultarCliente(t)).then(function (res) {
      var cliente = res.data;
      var nivelInfo = cliente.infoNivel;
      var chips = '';
      if (cliente.contexto.baneado) {
        var b = cliente.contexto.ultimaDecision;
        chips += '<span class="sb-stk-chip sb-stk-chip--baneado">🚫 Baneado desde ' + escapeHtml(formatoFecha(b ? b.decidido_en : '')) + ' por ' + escapeHtml(b ? b.decidido_por : '') + '</span>';
      }
      if (cliente.contexto.enObservacion) {
        var o = cliente.contexto.ultimaDecision;
        chips += '<span class="sb-stk-chip sb-stk-chip--obs">👁️ En observación desde ' + escapeHtml(formatoFecha(o ? o.decidido_en : '')) + '</span>';
      }
      chips += '<span class="sb-stk-chip sb-stk-chip--nivel">' + nivelInfo.etiqueta + ' (' + cliente.activos + ' activo' + (cliente.activos === 1 ? '' : 's') + ')</span>';

      var listaHtml;
      if (!cliente.strikes.length) {
        listaHtml = '<div class="sb-stk-sin-datos">Sin strikes registrados para este cliente.</div>';
      } else {
        listaHtml = cliente.strikes.map(function (s) {
          var est = estadoStrike(s);
          var motivo = MOTIVOS_OFICIALES.find(function (m) { return m.id === s.motivo; });
          var btnDescartar = (esAdmin && est === 'ACTIVO')
            ? '<button type="button" class="sb-stk-btn sb-stk-btn--ghost" style="padding:5px 10px;font-size:12px" data-accion-descartar="' + s.id + '">🗑️ Descartar</button>'
            : '';
          return '<div class="sb-stk-item sb-stk-item--' + est + '">' +
            '<div class="sb-stk-item-top">' +
            '  <div><span class="sb-stk-item-titulo">' + escapeHtml(motivo ? motivo.etiqueta : s.motivo) + '</span></div>' +
            '  <div style="display:flex;gap:6px;align-items:center">' +
            '    <span class="sb-stk-badge sb-stk-badge--' + est + '">' + est + '</span>' +
            btnDescartar +
            '  </div>' +
            '</div>' +
            '<div class="sb-stk-item-meta">' +
            '📅 ' + escapeHtml(formatoFecha(s.creado_en)) +
            (est === 'ACTIVO' ? ' · expira ' + escapeHtml(formatoFecha(s.expira_en)) : '') +
            ' · 📞 ' + escapeHtml(s.telefono) +
            (s.pedido_id ? ' · 🧾 Pedido #' + escapeHtml(s.pedido_id) : ' · 📂 Sin pedido asociado') +
            (s.origen === 'PEDIDO' ? ' (del pedido)' : ' (historial)') +
            ' · 👤 ' + escapeHtml(s.registrado_por || '') +
            (s.observacion ? '<br>💬 ' + escapeHtml(s.observacion) : '') +
            (est === 'DESCARTADO' ? '<br>🗑️ Descartado por ' + escapeHtml(s.descartado_por || '') + ' · ' + escapeHtml(formatoFecha(s.descartado_en)) + (s.motivo_descarte ? ' · " ' + escapeHtml(s.motivo_descarte) + ' "' : '') : '') +
            '</div>' +
            '</div>';
        }).join('');
      }

      var decHtml;
      if (cliente.decisiones.length) {
        decHtml = '<div class="sb-stk-dec"><h5>Historial de decisiones del cliente</h5>' +
          cliente.decisiones.slice(0, 8).map(function (d) {
            var td = TIPOS_DECISION[d.tipo] || {};
            return '<div class="sb-stk-dec-item"><b>' + escapeHtml(td.etiqueta || d.tipo) + '</b> · ' +
              escapeHtml(formatoFecha(d.decidido_en)) + ' · 👤 ' + escapeHtml(d.decidido_por || '') +
              (d.nota ? ' · “' + escapeHtml(d.nota) + '”' : '') + '</div>';
          }).join('') +
          (cliente.decisiones.length > 8 ? '<div class="sb-stk-sub">… y ' + (cliente.decisiones.length - 8) + ' más</div>' : '') +
          '</div>';
      } else {
        decHtml = '';
      }

      // Acciones disponibles según estado y rol
      var esPendienteRevision = cliente.nivel === 'PENDIENTE_REVISION';
      var acciones = [];
      acciones.push('<button type="button" class="sb-stk-btn sb-stk-btn--danger" data-accion="registrar">⚠️ Registrar strike</button>');
      if (esAdmin && esPendienteRevision && !cliente.contexto.baneado) {
        acciones.push('<button type="button" class="sb-stk-btn sb-stk-btn--danger" data-accion="banear">🚫 Banear</button>');
        acciones.push('<button type="button" class="sb-stk-btn sb-stk-btn--main" data-accion="observar">👁️ En observación</button>');
      }
      if (esAdmin && cliente.contexto.baneado) {
        acciones.push('<button type="button" class="sb-stk-btn sb-stk-btn--main" data-accion="quitar_baneo">✅ Quitar baneo</button>');
      }
      if (esAdmin && cliente.contexto.enObservacion) {
        acciones.push('<button type="button" class="sb-stk-btn sb-stk-btn--ghost" data-accion="quitar_observacion">👉 Quitar observación</button>');
      }

      container.innerHTML =
        '<div class="sb-stk-seccion">' +
        '  <div class="sb-stk-cabecera">' +
        '    <h4>' + escapeHtml(nombreCliente || cliente.nombre || 'Cliente') + ' — Strikes</h4>' +
        '    <div class="sb-stk-sub">📞 ' + escapeHtml(cliente.telefono) + '</div>' +
        '    <div style="margin-top:6px">' + chips + '</div>' +
        '    <div class="sb-stk-sub" style="margin-top:4px">' + escapeHtml(nivelInfo.texto) + '</div>' +
        '  </div>' +
        '  <div class="sb-stk-lista">' + listaHtml + '</div>' +
        decHtml +
        '  <div class="sb-stk-actions">' + acciones.join('') + '</div>' +
        '</div>';

      // Descartar individual (solo filas ACTIVAS y admin)
      container.querySelectorAll('[data-accion-descartar]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var strike = cliente.strikes.find(function (s) { return s.id === btn.dataset.accionDescartar; });
          modalDescartarStrike(strike, function (res) {
            Promise.resolve(recurso.descartarStrike({ strikeId: res.strike.id, descartado_por: registradoPorActual(), motivo_descarte: res.motivo_descarte })).then(function (r) {
              if (r.error) { toast('Error al descartar: ' + r.error.message, false); return; }
              toast('🗑️ Strike descartado (queda visible en el historial)', true);
              if (typeof opts.onCambio === 'function') opts.onCambio();
              renderSeccionStrikes(container, telefono, nombreCliente, opts);
            });
          });
        });
      });

      // Acciones generales
      container.querySelectorAll('[data-accion]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var accion = btn.dataset.accion;
          function rerender() { renderSeccionStrikes(container, telefono, nombreCliente, opts); }

          if (accion === 'registrar') {
            abrirModalRegistrarStrike({
              telefono: telefono, nombre: nombreCliente || cliente.nombre,
              pedidoId: null, origen: ORIGENES.HISTORIAL,
              onRegistrado: function () {
                rerender();
                if (typeof opts.onRegistrado === 'function') opts.onRegistrado();
              }
            });
            return;
          }
          if (accion === 'banear') {
            modalDecidir({
              titulo: '🚫 Banear cliente', tipo: 'BANEO', cliente: { telefono: telefono, nombre: nombreCliente || cliente.nombre },
              opcionesRapidas: ['Cliente reincidente', 'Hurtó/pérdida', 'Otro'],
              onConfirmar: function (d) {
                Promise.resolve(recurso.registrarDecision({ id: generarId(), telefono: telefono, tipo: 'BANEO', decidido_por: registradoPorActual(), decidido_en: hoyISO(), nota: d.nota })).then(function (r) {
                  if (r.error) { toast('Error: ' + r.error.message, false); return; }
                  toast('🚫 Cliente baneado — no podrá confirmar nuevos pedidos', true);
                  rerender();
                });
              }
            });
            return;
          }
          if (accion === 'observar') {
            modalDecidir({
              titulo: '👁️ Poner en observación', tipo: 'EN_OBSERVACION', cliente: { telefono: telefono, nombre: nombreCliente || cliente.nombre },
              onConfirmar: function (d) {
                Promise.resolve(recurso.registrarDecision({ id: generarId(), telefono: telefono, tipo: 'EN_OBSERVACION', decidido_por: registradoPorActual(), decidido_en: hoyISO(), nota: d.nota })).then(function (r) {
                  if (r.error) { toast('Error: ' + r.error.message, false); return; }
                  toast('👁️ Cliente en observación (no bloquea pedidos)', true);
                  rerender();
                });
              }
            });
            return;
          }
          if (accion === 'quitar_baneo') {
            modalDecidir({
              titulo: '✅ Quitar baneo', tipo: 'QUITAR_BANEO', cliente: { telefono: telefono, nombre: nombreCliente || cliente.nombre },
              opcionesRapidas: ['Error del sistema', 'Cliente regularizó su situación', 'Otro'],
              onConfirmar: function (d) {
                Promise.resolve(recurso.registrarDecision({ id: generarId(), telefono: telefono, tipo: 'QUITAR_BANEO', decidido_por: registradoPorActual(), decidido_en: hoyISO(), nota: d.nota })).then(function (r) {
                  if (r.error) { toast('Error: ' + r.error.message, false); return; }
                  toast('✅ Baneo quitado — el cliente puede volver a pedir (historial conservado)', true);
                  rerender();
                });
              }
            });
            return;
          }
          if (accion === 'quitar_observacion') {
            modalDecidir({
              titulo: '👉 Quitar observación', tipo: 'QUITAR_OBSERVACION', cliente: { telefono: telefono, nombre: nombreCliente || cliente.nombre },
              onConfirmar: function (d) {
                Promise.resolve(recurso.registrarDecision({ id: generarId(), telefono: telefono, tipo: 'QUITAR_OBSERVACION', decidido_por: registradoPorActual(), decidido_en: hoyISO(), nota: d.nota })).then(function (r) {
                  if (r.error) { toast('Error: ' + r.error.message, false); return; }
                  toast('👉 Observación retirada', true);
                  rerender();
                });
              }
            });
            return;
          }
        });
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Aviso dinámico bajo el input de teléfono del formulario             *
   * ------------------------------------------------------------------ */
  function pintarAvisoClienteEnFormulario(telefono) {
    var input = document.getElementById('telefonoInput') || document.getElementById('telefono');
    if (!input) return;

    var t = String(telefono || '').replace(/\D/g, '');
    if (t.length < 6) {
      var avisoVacio = document.getElementById('sbAvisoCliente');
      if (avisoVacio) { avisoVacio.style.display = 'none'; avisoVacio.innerHTML = ''; }
      return;
    }

    var aviso = document.getElementById('sbAvisoCliente');
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.id = 'sbAvisoCliente';
      aviso.className = 'sb-stk-aviso';
      input.parentNode.insertBefore(aviso, input.nextSibling);
    }
    aviso.className = 'sb-stk-aviso';

    // Consulta por la capa activa (demo síncrona / supabase asíncrona)
    Promise.resolve(recurso.consultarCliente(t)).then(function (res) {
      if (res.error || !res.data) { aviso.style.display = 'none'; aviso.innerHTML = ''; return; }
      var cliente = res.data;
      var hasDatos = cliente.strikes.length || cliente.decisiones.length;
      var puedeVerContexto = (typeof onVerContexto === 'function');

      if (!hasDatos) { aviso.style.display = 'none'; aviso.innerHTML = ''; return; }

      var botonCtx = puedeVerContexto ? '<button type="button" data-sb-verctx>Ver contexto</button>' : '';

      if (cliente.contexto.baneado) {
        aviso.className = 'sb-stk-aviso sb-stk-aviso--baneado';
        aviso.innerHTML = '🚫 <b>Cliente BANEADO</b> — no puede confirmar nuevos pedidos. ' + botonCtx;
      } else if (cliente.contexto.enObservacion) {
        aviso.className = 'sb-stk-aviso sb-stk-aviso--obs';
        aviso.innerHTML = '👁️ Cliente <b>en observación</b>. Puede continuar el pedido. ' + botonCtx;
      } else if (cliente.nivel === 'PENDIENTE_REVISION') {
        aviso.className = 'sb-stk-aviso sb-stk-aviso--revision';
        aviso.innerHTML = '🔎 <b>Pendiente de revisión</b> (3+ strikes activos). No se bloquea automáticamente. ' + botonCtx;
      } else if (cliente.nivel === 'ALERTA_REFORZADA') {
        aviso.className = 'sb-stk-aviso sb-stk-aviso--alerta';
        aviso.innerHTML = '⚠️ <b>2 strikes activos</b> — sugerimos cobrar contra entrega / en efectivo. ' + botonCtx;
      } else if (cliente.nivel === 'ADVERTENCIA') {
        aviso.className = 'sb-stk-aviso sb-stk-aviso--alerta';
        aviso.innerHTML = '⚠️ <b>1 strike activo</b> — puede continuar. ' + botonCtx;
      } else {
        aviso.className = 'sb-stk-aviso sb-stk-aviso--ok';
        aviso.innerHTML = '⚠️ Historial con incidentes antiguos (sin strikes activos hoy). ' + botonCtx;
      }

      var btn = aviso.querySelector('[data-sb-verctx]');
      if (btn) {
        btn.addEventListener('click', function () {
          if (puedeVerContexto) onVerContexto(t, cliente.nombre || '');
        });
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Registro de "quién" actúa (email + perfil persistidos por cada panel) *
   * ------------------------------------------------------------------ */
  function registradoPorActual() {
    var email = '';
    try {
      var auth = JSON.parse(localStorage.getItem('sabrofood-auth') || 'null');
      email = (auth && (auth.email || (auth.user && auth.user.email))) || '';
    } catch (e) { email = ''; }
    if (!email) email = localStorage.getItem('sabrofood_last_email') || '';
    var perfil = localStorage.getItem('repartidor_perfil');
    var partes = [];
    if (email) partes.push(email);
    if (perfil) partes.push(perfil);
    return partes.join(' | ') || 'desconocido';
  }

  /* ------------------------------------------------------------------ *
   * Exposición pública                                                   *
   * ------------------------------------------------------------------ */
  window.SistemaStrikes = {
    VIGENCIA_MESES: VIGENCIA_MESES,
    LIMITE_REVISION: LIMITE_REVISION,
    MOTIVOS_OFICIALES: MOTIVOS_OFICIALES,
    TIPOS_DECISION: TIPOS_DECISION,
    ORIGENES: ORIGENES,
    // Lógica pura
    estadoStrike: estadoStrike,
    esActivo: esActivo,
    contarActivos: contarActivos,
    nivelPorConteo: nivelPorConteo,
    infoNivel: infoNivel,
    estadoDecisionActual: estadoDecisionActual,
    construirRegistro: construirRegistro,
    // Capa de datos activa (demo localStorage o supabase según MODO)
    recurso: recurso,
    getModo: getModo,
    setModo: setModo,
    // UI
    inyectarEstilos: inyectarEstilos,
    abrirModalRegistrarStrike: abrirModalRegistrarStrike,
    modalDecidir: modalDecidir,
    modalDescartarStrike: modalDescartarStrike,
    renderSeccionStrikes: renderSeccionStrikes,
    pintarAvisoClienteEnFormulario: pintarAvisoClienteEnFormulario,
    registradoPorActual: registradoPorActual,
    cerrarModal: cerrarModal,
    // Marcador de contexto (lo asigna cada panel)
    set onVerContexto(fn) { onVerContexto = fn; },
    get onVerContexto() { return onVerContexto; }
  };

  // Estilos y marcador de carga (shared/*.js se ejecutan en <head>).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      inyectarEstilos();
    });
  } else {
    inyectarEstilos();
  }
})();
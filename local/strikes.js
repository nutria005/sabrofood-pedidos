/* ============================================================
 * STRIKES — PANEL ADMINISTRADOR (MODO DEMO LOCAL)
 * Usa el módulo compartido `../shared/strikes.js` (window.SistemaStrikes):
 *  - Datos: capa demo en localStorage (misma API que Supabase en el futuro).
 *  - Estado derivado por el módulo (ACTIVO/DESCARTADO/EXPIRADO, nivel 0-3+,
 *    decisión vigente por historial de decisiones).
 *  - Acciones (banear / observar / quitar / descartar) vía modales del módulo.
 * ============================================================ */

/* ---------- Utilidades locales del panel ---------- */

function escapar(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtFecha(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso || '';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
           ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return iso || ''; }
}

function motivosMap() {
  const m = {};
  (window.SistemaStrikes && SistemaStrikes.MOTIVOS_OFICIALES || []).forEach(x => { m[x.id] = x.etiqueta; });
  return m;
}

function avatarInicial(nombre) {
  return (nombre || '?').trim().charAt(0).toUpperCase() || '?';
}

/* ---------- Estado del panel ---------- */

let filtroSeccion = 'todos';
let textoBusqueda = '';

/* ---------- Carga de datos de ejemplo (solo modo demo) ---------- */

function cargarDatosEjemplo() {
  if (!window.SistemaStrikes) { alert('Módulo de strikes no cargado.'); return; }
  if (SistemaStrikes.getModo() === 'supabase') {
    alert('La semilla de ejemplo solo está disponible en modo demo (localStorage).\nEn modo definitivo los datos vienen de las tablas de Supabase.');
    return;
  }
  if (!confirm('¿Reemplazar los datos del modo demo por los clientes de ejemplo?\n(Se borrarán los strikes y decisiones actuales del almacén local).')) return;
  SistemaStrikes.recurso.sembrarEjemplos();
  pintarTotal();
  renderTablero();
  alert('✅ Datos de ejemplo cargados en el modo demo.\n\nPrueba los casos:\n• María González → pendiente (3 activos)\n• Jorge Pérez → baneado (bloquea pedidos)\n• Claudia Vera → observación (no bloquea)\n• Ana Martínez → incidente expirado (nivel normal)');
}

/* ---------- Agrupación de clientes por sección ---------- */

function agruparClientes(lista) {
  const secciones = {
    pendientes: [],
    alertas: [],
    baneados: [],
    observacion: [],
    sinActivos: []
  };
  lista.forEach(c => {
    const nombre = c.nombre || (c.decisiones[0] && c.decisiones[0].telefono) || c.telefono;
    const cliente = Object.assign({}, c, { nombre });
    if (c.contexto.baneado) { secciones.baneados.push(cliente); return; }
    if (c.contexto.enObservacion) { secciones.observacion.push(cliente); return; }
    if (c.nivel === 'PENDIENTE_REVISION') { secciones.pendientes.push(cliente); return; }
    if (c.nivel === 'ALERTA_REFORZADA' || c.nivel === 'ADVERTENCIA') { secciones.alertas.push(cliente); return; }
    // NORMAL (0 activos) pero con historial: su propio registro/sección
    if ((c.strikes && c.strikes.length) || (c.decisiones && c.decisiones.length)) {
      secciones.sinActivos.push(cliente);
    }
  });
  return secciones;
}

function filtrar(lista) {
  const q = textoBusqueda.trim().toLowerCase();
  if (!q) return lista;
  return lista.filter(c =>
    String(c.telefono || '').toLowerCase().includes(q) ||
    String(c.nombre || '').toLowerCase().includes(q)
  );
}

/* ---------- Render de tarjeta ---------- */

function tarjetaClienteHtml(c, esPendiente, permiteDescarte, esSinActivos) {
  const S = window.SistemaStrikes;
  const motivos = motivosMap();
  const nivelInfo = S.infoNivel(c.nivel);

  // Historial de strikes (los últimos 4)
  const histo = (c.strikes || []).slice(0, 4).map(s => {
    const est = S.estadoStrike(s);
    const badge =
      est === 'ACTIVO' ? '<span class="sb-histo-estado sb-histo-estado--activo" style="color:#b91c1c;background:#fee2e2">ACTIVO</span>' :
      est === 'DESCARTADO' ? '<span class="sb-histo-estado" style="color:#475569;background:#e2e8f0">DESCARTADO</span>' :
      '<span class="sb-histo-estado" style="color:#475569;background:#e2e8f0">EXPIRADO</span>';
    const btnDesc = (permiteDescarte && est === 'ACTIVO')
      ? `<button type="button" class="sb-btn sb-btn--ghost" style="padding:4px 10px;font-size:0.78rem" data-descartar="${s.id}" title="Descartar este strike (queda visible como DESCARTADO)">🗑️</button>`
      : '';
    return `<div class="sb-histo-item${est === 'DESCARTADO' || est === 'EXPIRADO' ? ' sb-histo-item--baneado' : ''}">
      <span class="sb-histo-motivo">${escapar(motivos[s.motivo] || s.motivo)}</span>
      <span class="sb-histo-meta">${fmtFecha(s.creado_en)}${s.pedido_id ? ' · 🧾 #' + escapar(s.pedido_id) : ' · 📂 historial'}${s.observacion ? ' · 💬 ' + escapar(s.observacion) : ''}</span>
      ${badge}${btnDesc}
    </div>`;
  }).join('') || '<div class="sb-vacio">Sin strikes registrados.</div>';

  // Historial de decisiones (últimas 3)
  const decs = (c.decisiones || []).slice(0, 3).map(d => {
    const et = (S.TIPOS_DECISION[d.tipo] || {}).etiqueta || d.tipo;
    const baneada = d.tipo === 'BANEO' ? ' style="color:#c2410c"' : '';
    return `<div class="sb-histo-item" style="${baneada}">
      <span class="sb-histo-motivo">${escapar(et)}</span>
      <span class="sb-histo-meta">${fmtFecha(d.decidido_en)} · 👤 ${escapar(d.decidido_por || '')}${d.nota ? ' · “' + escapar(d.nota) + '”' : ''}</span>
    </div>`;
  }).join('');

  const chipNivel = `<span class="sb-badge sb-badge--${c.nivel === 'PENDIENTE_REVISION' ? 'rust' : c.nivel === 'ALERTA_REFORZADA' ? 'amber' : 'forest'}" title="${escapar(nivelInfo.texto)}">${nivelInfo.etiqueta} (${c.activos} act.)</span>`;

  // Acciones según contexto
  const acciones = [];
  if (esPendiente && !c.contexto.baneado) {
    acciones.push(`<button type="button" class="sb-btn sb-btn--rust" data-accion="banear" data-tel="${c.telefono}" data-nombre="${escapar(c.nombre)}">🚫 Banear</button>`);
    acciones.push(`<button type="button" class="sb-btn sb-btn--amber" data-accion="observar" data-tel="${c.telefono}" data-nombre="${escapar(c.nombre)}">👁️ Observación</button>`);
  }
  if (c.contexto.baneado) {
    acciones.push(`<button type="button" class="sb-btn sb-btn--ghost" data-accion="quitar_baneo" data-tel="${c.telefono}" data-nombre="${escapar(c.nombre)}">✅ Quitar baneo</button>`);
  }
  if (c.contexto.enObservacion && !c.contexto.baneado) {
    acciones.push(`<button type="button" class="sb-btn sb-btn--ghost" data-accion="quitar_observacion" data-tel="${c.telefono}" data-nombre="${escapar(c.nombre)}">👉 Quitar observación</button>`);
  }
  acciones.push(`<button type="button" class="sb-btn sb-btn--ghost" data-accion="registrar" data-tel="${c.telefono}" data-nombre="${escapar(c.nombre)}">⚠️ Registrar strike</button>`);

  const chipObs = c.contexto.enObservacion ? '<span class="sb-badge sb-badge--amber">👁️ En observación</span>' : '';
  const chipBaneo = c.contexto.baneado ? '<span class="sb-badge sb-badge--rust">🚫 Baneado</span>' : '';

  // Texto de la seña: para clientes sin activos se explica que tienen historial propio
  const señaTexto = esSinActivos
    ? ((c.strikes && c.strikes.length)
        ? `📋 Sin strikes activos hoy · ${c.strikes.length} incidente(s) en historial (expirados/descartados)`
        : '📋 Con registro de decisiones · sin strikes activos')
    : nivelInfo.texto;

  return `<article class="sb-card ${esPendiente ? 'sb-card--revision' : 'sb-card--alerta'}">
    <div class="sb-card__head">
      <div class="sb-card__identidad">
        <div class="sb-avatar">${escapar(avatarInicial(c.nombre))}</div>
        <div>
          <h3 class="sb-card__nombre">${escapar(c.nombre || 'Sin nombre')}</h3>
          <p class="sb-card__telefono">📞 ${escapar(c.telefono)}</p>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
        ${chipBaneo}${chipObs}${chipNivel}
      </div>
    </div>
    <p class="sb-card__senal ${esPendiente ? '' : 'sb-card__senal--info'}" style="margin:0">${escapar(señaTexto)}</p>
    <div class="sb-historico">
      <p class="sb-historico-titulo">📜 Historial de strikes</p>
      ${histo}
      ${decs ? '<p class="sb-historico-titulo" style="margin-top:10px">🔐 Decisiones del administrador</p>' + decs : ''}
    </div>
    <div class="sb-card__acciones">${acciones.join('')}</div>
  </article>`;
}

/* ---------- Render del tablero ---------- */

async function renderTablero() {
  const content = document.getElementById('strikesContenido');
  if (!content) return;
  if (!window.SistemaStrikes) { content.innerHTML = '<div class="sb-vacio">Módulo de strikes no disponible.</div>'; return; }

  const res = await Promise.resolve(SistemaStrikes.recurso.obtenerClientes());
  if (res.error) {
    content.innerHTML = `<div class="sb-vacio">Error consultando los strikes: ${escapar(res.error.message || 'desconocido')}<br>Verifica sesión/tablas (modo ${escapar(SistemaStrikes.getModo())}).</div>`;
    return;
  }
  const todos = res.data || [];
  const secciones = agruparClientes(todos);
  const bloques = [];

  const definirSeccion = (clave, titulo, icono, claseGrid) => {
    if (filtroSeccion !== 'todos' && filtroSeccion !== clave) return;
    const lista = filtrar(secciones[clave]);
    if (!lista.length) return;
    bloques.push(`
      <section class="strikes-seccion" data-seccion="${clave}">
        <div class="strikes-seccion__header">
          <h2 class="strikes-seccion__titulo">${icono} ${titulo} <span class="sb-badge sb-badge--rust" style="margin-left:4px">${lista.length}</span></h2>
        </div>
        <div class="sb-grid ${claseGrid}">
          ${lista.map(c => tarjetaClienteHtml(c, clave === 'pendientes', clave !== 'baneados' && clave !== 'sinActivos', clave === 'sinActivos')).join('')}
        </div>
      </section>`);
  };

  definirSeccion('pendientes', 'Pendientes de revisión', '🚨', 'sb-grid--revision');
  definirSeccion('alertas', 'Alertas (1-2 strikes activos)', '👥', 'sb-grid--alerta');
  definirSeccion('baneados', 'Clientes baneados', '🚫', 'sb-grid--revision');
  definirSeccion('observacion', 'En observación', '👁️', 'sb-grid--alerta');
  definirSeccion('sinActivos', 'Sin strikes activos (historial)', '📋', 'sb-grid--alerta');

  content.innerHTML = bloques.length
    ? bloques.join('')
    : '<div class="sb-vacio">Sin clientes en esta vista.' + (textoBusqueda ? ' Ajusta la búsqueda o el filtro.' : ' Usa "Cargar datos de ejemplo" para probar el tablero.') + '</div>';

  // Delegación de acciones
  content.querySelectorAll('[data-accion]').forEach(btn => {
    btn.addEventListener('click', () => ejecutarAccion(btn.dataset.accion, btn.dataset.tel, btn.dataset.nombre));
  });
  content.querySelectorAll('[data-descartar]').forEach(btn => {
    btn.addEventListener('click', () => ejecutarDescartar(btn.dataset.descartar));
  });
}

/* ---------- Acciones (usan modales del módulo compartido) ---------- */

function refrescar() { pintarTotal(); renderTablero(); }

function ejecutarAccion(accion, telefono, nombre) {
  const S = window.SistemaStrikes;

  if (accion === 'registrar') {
    S.abrirModalRegistrarStrike({ telefono, nombre, pedidoId: null, origen: 'HISTORIAL', onRegistrado: refrescar });
    return;
  }

  if (accion === 'banear') {
    S.modalDecidir({
      titulo: '🚫 Banear cliente', tipo: 'BANEO', cliente: { telefono, nombre },
      opcionesRapidas: ['Cliente reincidente', 'Hurtó / pérdida', 'Otro'],
      onConfirmar: d => {
        Promise.resolve(S.recurso.registrarDecision({ id: Date.now().toString(36) + Math.random().toString(36).slice(2), telefono, tipo: 'BANEO', decidido_por: S.registradoPorActual(), decidido_en: new Date().toISOString(), nota: d.nota })).then(r => {
          if (r.error) { alert('Error: ' + r.error.message); return; }
          alert('🚫 Cliente baneado. No podrá confirmar nuevos pedidos.');
          refrescar();
        });
      }
    });
    return;
  }

  if (accion === 'observar') {
    S.modalDecidir({
      titulo: '👁️ Poner en observación', tipo: 'EN_OBSERVACION', cliente: { telefono, nombre },
      onConfirmar: d => {
        Promise.resolve(S.recurso.registrarDecision({ id: Date.now().toString(36) + Math.random().toString(36).slice(2), telefono, tipo: 'EN_OBSERVACION', decidido_por: S.registradoPorActual(), decidido_en: new Date().toISOString(), nota: d.nota })).then(r => {
          if (r.error) { alert('Error: ' + r.error.message); return; }
          alert('👁️ Cliente en observación. No bloquea pedidos (solo aviso).');
          refrescar();
        });
      }
    });
    return;
  }

  if (accion === 'quitar_baneo') {
    S.modalDecidir({
      titulo: '✅ Quitar baneo', tipo: 'QUITAR_BANEO', cliente: { telefono, nombre },
      opcionesRapidas: ['Error del sistema', 'Cliente regularizó su situación', 'Otro'],
      onConfirmar: d => {
        Promise.resolve(S.recurso.registrarDecision({ id: Date.now().toString(36) + Math.random().toString(36).slice(2), telefono, tipo: 'QUITAR_BANEO', decidido_por: S.registradoPorActual(), decidido_en: new Date().toISOString(), nota: d.nota })).then(r => {
          if (r.error) { alert('Error: ' + r.error.message); return; }
          alert('✅ Baneo quitado. Ya puede confirmar pedidos (historial conservado).');
          refrescar();
        });
      }
    });
    return;
  }

  if (accion === 'quitar_observacion') {
    S.modalDecidir({
      titulo: '👉 Quitar observación', tipo: 'QUITAR_OBSERVACION', cliente: { telefono, nombre },
      onConfirmar: d => {
        Promise.resolve(S.recurso.registrarDecision({ id: Date.now().toString(36) + Math.random().toString(36).slice(2), telefono, tipo: 'QUITAR_OBSERVACION', decidido_por: S.registradoPorActual(), decidido_en: new Date().toISOString(), nota: d.nota })).then(r => {
          if (r.error) { alert('Error: ' + r.error.message); return; }
          alert('👉 Observación retirada.');
          refrescar();
        });
      }
    });
    return;
  }
}

async function ejecutarDescartar(strikeId) {
  const S = window.SistemaStrikes;
  const res = await Promise.resolve(S.recurso.obtenerClientes());
  const todos = (res.data || []);
  let strike = null;
  for (const c of todos) {
    strike = (c.strikes || []).find(s => s.id === strikeId);
    if (strike) break;
  }
  if (!strike) { alert('Strike no encontrado.'); return; }
  S.modalDescartarStrike(strike, res2 => {
    Promise.resolve(S.recurso.descartarStrike({ strikeId: res2.strike.id, descartado_por: S.registradoPorActual(), motivo_descarte: res2.motivo_descarte })).then(r => {
      if (r.error) { alert('Error: ' + r.error.message); return; }
      alert('🗑️ Strike descartado (queda visible como DESCARTADO).');
      refrescar();
    });
  });
}

/* ---------- Contador del encabezado ---------- */

async function pintarTotal() {
  const badge = document.getElementById('strikesTotalBadge');
  if (!badge) return;
  const res = await Promise.resolve((window.SistemaStrikes) ? SistemaStrikes.recurso.obtenerClientes() : Promise.resolve({ data: [], error: null }));
  const todos = (res && res.data) || [];
  const pend = todos.filter(c => c.nivel === 'PENDIENTE_REVISION' && !c.contexto.baneado).length;
  const ban = todos.filter(c => c.contexto.baneado).length;
  badge.textContent = `${pend} pendientes · ${ban} baneados`;
}

/* ---------- Selector de modo: 🧪 práctica (demo) / 🟢 real (Supabase) ---------- */

function aplicarModoVisual() {
  const S = window.SistemaStrikes;
  const modo = S ? S.getModo() : 'demo';
  const nota = document.getElementById('sbModoNota');
  if (nota) {
    nota.textContent = modo === 'supabase' ? '🟢 modo real · Supabase' : '🧪 modo práctica · datos locales';
    nota.title = modo === 'supabase'
      ? 'Requeridos: sesión iniciada y las tablas strikes_clientes / decisiones_cliente (ejecutar SQL de docs/SETUP-RLS-STRIKES.md)'
      : 'Datos inventados en este navegador (localStorage), sin base de datos · igual API que Supabase';
  }
  const seedBtn = document.getElementById('sbSeedBtn');
  if (seedBtn) seedBtn.style.display = modo === 'supabase' ? 'none' : '';
  document.querySelectorAll('.sb-modo-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.modo === modo);
  });
}

function cambiarModo(m) {
  const S = window.SistemaStrikes;
  if (!S) return;
  S.setModo(m); // persiste la elección para todos los paneles
  aplicarModoVisual();
  pintarTotal();
  renderTablero();
}

/* ---------- Eventos ---------- */

document.addEventListener('DOMContentLoaded', () => {
  aplicarModoVisual();
  document.querySelectorAll('.sb-modo-btn').forEach(btn => {
    btn.addEventListener('click', () => cambiarModo(btn.dataset.modo));
  });

  const buscar = document.getElementById('strikesBuscar');
  if (buscar) {
    buscar.addEventListener('input', () => { textoBusqueda = buscar.value; renderTablero(); });
  }
  document.querySelectorAll('[data-seccion-filtro]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-seccion-filtro]').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      filtroSeccion = btn.dataset.seccionFiltro;
      renderTablero();
    });
  });
  pintarTotal();
  renderTablero();
});
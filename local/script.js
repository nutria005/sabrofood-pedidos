// === CONFIGURACIÓN ===
// SUPABASE_CONFIG viene de shared/supabase-config.js

// === VARIABLES GLOBALES ===
let productosDisponibles = []; // Catálogo de productos desde Supabase
let ultimaActualizacionCatalogo = null; // Timestamp de última carga del catálogo

// === UTILIDADES ===
/**
 * Formatear número como moneda chilena
 * @param {number} valor - Valor numérico
 * @returns {string} - Valor formateado (ej: "29.990")
 */
function formatoMoneda(valor) {
  if (!valor || isNaN(valor)) return '0';
  return Math.floor(valor).toLocaleString('es-CL');
}

// === SISTEMA DE MODO OFFLINE ===
const OfflineManager = {
  QUEUE_KEY: 'offlineQueue',
  CACHE_KEY: 'pedidosCache',
  
  // Inicializar cola desde localStorage
  colaDeAcciones: JSON.parse(localStorage.getItem('offlineQueue') || '[]'),
  
  /**
   * Guardar una acción en la cola offline
   * @param {string} tipo - Tipo de acción (ENTREGAR, DESMARCAR, ELIMINAR, REAGENDAR, etc)
   * @param {object} datos - Datos de la acción
   */
  guardarEnCola(tipo, datos) {
    const accion = {
      id: Date.now() + Math.random(), // ID único
      tipo: tipo,
      datos: datos,
      timestamp: Date.now(),
      intentos: 0
    };
    
    this.colaDeAcciones.push(accion);
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(this.colaDeAcciones));
    
    this.mostrarNotificacionOffline();
    this.actualizarContadorCola();
  },
  
  /**
   * Procesar toda la cola de acciones pendientes
   */
  async procesarCola() {
    if (this.colaDeAcciones.length === 0) {
      return;
    }
    
    this.mostrarNotificacionSincronizando();
    
    const accionesExitosas = [];
    const accionesFallidas = [];
    
    for (const accion of this.colaDeAcciones) {
      try {
        await this.ejecutarAccion(accion);
        accionesExitosas.push(accion);
      } catch (error) {
        console.error('❌ Error al sincronizar acción:', accion.tipo, error);
        accion.intentos++;
        
        // Si falló más de 3 veces, descartarla
        if (accion.intentos > 3) {
          accionesExitosas.push(accion); // Removerla de la cola
          console.warn('⚠️ Acción descartada después de 3 intentos:', accion);
        } else {
          accionesFallidas.push(accion);
        }
      }
    }
    
    // Actualizar cola solo con acciones que fallaron
    this.colaDeAcciones = accionesFallidas;
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(this.colaDeAcciones));
    
    if (accionesExitosas.length > 0) {
      this.mostrarNotificacionSincronizada(accionesExitosas.length);
      // Recargar pedidos después de sincronizar
      setTimeout(() => cargarPedidos(), 500);
    }
    
    this.actualizarContadorCola();
  },
  
  /**
   * Ejecutar una acción específica
   * @param {object} accion - Acción a ejecutar
   */
  async ejecutarAccion(accion) {
    const { tipo, datos } = accion;
    
    switch(tipo) {
      case 'ENTREGAR':
        await supabase_client.from('pedidos').update({ entregado: true }).eq('id', datos.id);
        break;
        
      case 'DESMARCAR':
        await supabase_client.from('pedidos').update({ entregado: false }).eq('id', datos.id);
        break;
        
      case 'ELIMINAR':
        await supabase_client.from('pedidos').delete().eq('id', datos.id);
        break;
        
      case 'ANULAR':
        await supabase_client.from('pedidos').update({ entregado: true, estado: 'ANULADO' }).eq('id', datos.id);
        break;
        
      case 'REACTIVAR':
        await supabase_client.from('pedidos').update({ entregado: false, estado: null }).eq('id', datos.id);
        break;
        
      case 'REAGENDAR':
        await supabase_client.from('pedidos').update({ fecha: datos.fecha }).eq('id', datos.id);
        break;
        
      case 'CAMBIAR_PRIORIDAD':
        await supabase_client.from('pedidos').update({ prioridad: datos.prioridad }).eq('id', datos.id);
        break;
        
      case 'ACTUALIZAR_ORDEN':
        await supabase_client.from('pedidos').update({ orden_ruta: datos.orden }).eq('id', datos.id);
        break;
        
      case 'PAGO_MIXTO_PAGADO':
        await supabase_client.from('pedidos').update({ 
          metodo_pago: datos.metodo_pago,
          notas: datos.notas
        }).eq('id', datos.id);
        break;
        
      default:
        console.warn('⚠️ Tipo de acción desconocida:', tipo);
    }
  },
  
  /**
   * Verificar si hay conexión a internet
   */
  estaOnline() {
    return navigator.onLine;
  },
  
  /**
   * Guardar pedidos en caché local
   * @param {array} pedidos - Array de pedidos
   */
  guardarCache(pedidos) {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify({
        pedidos: pedidos,
        timestamp: Date.now()
      }));
      console.log('💾 Cache actualizado:', pedidos.length, 'pedidos');
    } catch (error) {
      console.error('Error al guardar cache:', error);
    }
  },
  
  /**
   * Cargar pedidos desde caché
   * @returns {array|null} - Array de pedidos o null
   */
  cargarCache() {
    try {
      const cache = JSON.parse(localStorage.getItem(this.CACHE_KEY));
      if (cache && cache.pedidos) {
        console.log('📂 Cargando desde cache:', cache.pedidos.length, 'pedidos');
        return cache.pedidos;
      }
    } catch (error) {
      console.error('Error al cargar cache:', error);
    }
    return null;
  },
  
  /**
   * Mostrar notificación de modo offline
   */
  mostrarNotificacionOffline() {
    ErrorHandler.mostrarWarning('⚠️ Sin señal. Guardado en el dispositivo. Se enviará al volver la conexión.');
  },
  
  /**
   * Mostrar notificación de sincronización en proceso
   */
  mostrarNotificacionSincronizando() {
    ErrorHandler.mostrarInfo('🔄 Sincronizando datos...');
  },
  
  /**
   * Mostrar notificación de sincronización exitosa
   */
  mostrarNotificacionSincronizada(cantidad) {
    ErrorHandler.mostrarExito(`✅ Conexión recuperada. ${cantidad} acción(es) sincronizada(s).`);
  },
  
  /**
   * Actualizar contador visual de cola
   */
  actualizarContadorCola() {
    const contador = document.getElementById('offlineCounter');
    const contadorTexto = document.getElementById('offlineCounterText');
    
    if (contador && contadorTexto) {
      const cantidad = this.colaDeAcciones.length;
      if (cantidad > 0) {
        contadorTexto.textContent = cantidad;
        contador.style.display = 'flex';
      } else {
        contador.style.display = 'none';
      }
    }
  },
  
  /**
   * Actualizar indicador de estado de conexión
   */
  actualizarEstadoConexion() {
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    
    if (statusIcon && statusText) {
      if (this.estaOnline()) {
        statusIcon.textContent = '🟢';
        statusText.textContent = 'Conectado';
      } else {
        statusIcon.textContent = '🔴';
        statusText.textContent = 'Sin conexión';
      }
    }
  }
};

// Listeners para eventos de conexión
window.addEventListener('online', () => {
  OfflineManager.actualizarEstadoConexion();
  OfflineManager.procesarCola();
});

window.addEventListener('offline', () => {
  OfflineManager.actualizarEstadoConexion();
  ErrorHandler.mostrarWarning('⚠️ Sin conexión. Las acciones se guardarán localmente.');
});

// === VERIFICACIÓN DE PERMISOS ===
/**
 * Verificar que el usuario tenga permisos para acceder al panel de administración (Local)
 * Solo admin@sabrofood.com puede acceder
 */
async function verificarPermisoLocal() {
  try {
    const { data: { user } } = await supabase_client.auth.getUser();
    
    if (!user) {
      window.location.href = '../index.html';
      return false;
    }
    
    // Solo admin puede acceder a Local
    if (!ROLES_CONFIG.esAdmin(user.email)) {
      // Usando alert() aquí porque es una verificación de seguridad crítica
      // que requiere atención inmediata antes de la redirección.
      // ErrorHandler podría no estar disponible en este punto temprano del ciclo de vida.
      alert('❌ No tienes permisos para acceder al panel de administración');
      await supabaseLogout();
      window.location.href = '../index.html';
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error al verificar permisos:', error);
    window.location.href = '../index.html';
    return false;
  }
}

// Inicializar estado de conexión al cargar
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🔧 Iniciando aplicación...');
  
  // Inicializar Supabase client desde shared config
  supabase_client = inicializarSupabase();
  
  if (supabase_client) {
    console.log('✅ Cliente Supabase inicializado en LOCAL');
  } else {
    console.error('❌ Error: No se pudo inicializar Supabase');
    alert('Error crítico: No se pudo conectar a la base de datos');
    return;
  }
  
  // Verificar permisos antes de continuar (ya incluye manejo de errores interno)
  const tienePermiso = await verificarPermisoLocal();
  if (!tienePermiso) {
    console.log('❌ Sin permisos - Redirigiendo...');
    return;
  }
  
  console.log('✅ Permisos verificados - Continuando inicialización...');
  
  OfflineManager.actualizarEstadoConexion();
  OfflineManager.actualizarContadorCola();
  
  // Cargar catálogos de productos (sacos y granel)
  await cargarCatalogoProductos();
  await cargarCatalogoGranel();
  
  // Actualizar indicadores cada minuto
  setInterval(() => {
    actualizarIndicadorActualizacion();
    actualizarIndicadorActualizacionGranel();
  }, 60000); // 60 segundos
  
  // Configurar event listeners para tipo de producto
  configurarSelectoresTipoProducto();
  
  // 🔥 CARGAR PEDIDOS INICIALES (MOVIDO AQUÍ)
  console.log('📦 Cargando pedidos iniciales...');
  await cargarPedidos();
  
  // Activar tiempo real después de cargar pedidos
  console.log('⚡ Activando sincronización en tiempo real...');
  activarTiempoReal();
  activarTiempoRealCarga();
  
  console.log('✅ Aplicación inicializada completamente');
});

// === VALIDACIÓN Y SEGURIDAD ===
const Validator = {
  // Sanitizar HTML para prevenir XSS
  sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/[<>]/g, '');
  },

  // Validar teléfono chileno
  validarTelefono(telefono) {
    if (!telefono) return { valido: false, error: 'Teléfono es obligatorio' };
    const cleaned = telefono.replace(/\D/g, '');
    if (cleaned.length < 8 || cleaned.length > 9) {
      return { valido: false, error: 'Teléfono debe tener 8-9 dígitos' };
    }
    return { valido: true, valor: cleaned };
  },

  // Validar nombre
  validarNombre(nombre) {
    if (!nombre || nombre.trim().length === 0) {
      return { valido: true, valor: '(sin nombre)' }; // Opcional
    }
    if (nombre.length > 50) {
      return { valido: false, error: 'Nombre muy largo (máximo 50 caracteres)' };
    }
    return { valido: true, valor: this.sanitizeHTML(nombre.trim()) };
  },

  // Validar dirección
  validarDireccion(direccion) {
    if (!direccion || direccion.trim().length === 0) {
      return { valido: false, error: 'Dirección es obligatoria' };
    }
    if (direccion.length > 100) {
      return { valido: false, error: 'Dirección muy larga (máximo 100 caracteres)' };
    }
    return { valido: true, valor: this.sanitizeHTML(direccion.trim()) };
  },

  // Validar fecha
  validarFecha(fecha) {
    if (!fecha) {
      return { valido: false, error: 'Fecha de entrega es obligatoria' };
    }
    
    // Crear fechas de manera más precisa
    const fechaObj = new Date(fecha + 'T00:00:00'); // Forzar zona horaria local
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    // Comparar solo fechas (sin horas)
    const fechaSolo = new Date(fechaObj.getFullYear(), fechaObj.getMonth(), fechaObj.getDate());
    const hoySolo = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    
    if (fechaSolo < hoySolo) {
      return { valido: false, error: 'No se pueden programar entregas en el pasado' };
    }
    
    return { valido: true, valor: fecha };
  },

  // Validar producto
  validarProducto(nombre, cantidad, precio) {
    const errores = [];
    
    if (!nombre || nombre.trim().length === 0) {
      errores.push('Nombre del producto es obligatorio');
    } else if (nombre.length > 60) {
      errores.push('Nombre del producto muy largo (máximo 60 caracteres)');
    }
    
    const cant = parseInt(cantidad);
    if (isNaN(cant) || cant < 1 || cant > 99) {
      errores.push('Cantidad debe ser entre 1 y 99');
    }
    
    const prec = parseInt(precio);
    if (isNaN(prec) || prec < 0 || prec > 999999) {
      errores.push('Precio debe ser entre 0 y $999,999');
    }
    
    if (errores.length > 0) {
      return { valido: false, errores };
    }
    
    return { 
      valido: true, 
      valor: { 
        nombre: this.sanitizeHTML(nombre.trim()), 
        cantidad: cant, 
        precio: prec 
      } 
    };
  },

  // Validar nota
  validarNota(nota) {
    if (!nota) return { valido: true, valor: '' };
    if (nota.length > 200) {
      return { valido: false, error: 'Nota muy larga (máximo 200 caracteres)' };
    }
    return { valido: true, valor: this.sanitizeHTML(nota.trim()) };
  }
};

// Sistema de manejo de errores mejorado
const ErrorHandler = {
  mostrarError(mensaje, tipo = 'error') {
    const container = this.getOrCreateErrorContainer();
    const errorDiv = document.createElement('div');
    errorDiv.className = `alert alert-${tipo}`;
    errorDiv.innerHTML = `
      <span class="alert-icon">${tipo === 'error' ? '❌' : '⚠️'}</span>
      <span class="alert-message">${mensaje}</span>
      <button class="alert-close" onclick="this.parentElement.remove()">✕</button>
    `;
    
    container.appendChild(errorDiv);
    
    // Auto-remover después de 5 segundos
    setTimeout(() => {
      if (errorDiv.parentElement) {
        errorDiv.remove();
      }
    }, 5000);
  },

  mostrarExito(mensaje) {
    const container = this.getOrCreateErrorContainer();
    const successDiv = document.createElement('div');
    successDiv.className = 'alert alert-success';
    successDiv.innerHTML = `
      <span class="alert-icon">✅</span>
      <span class="alert-message">${mensaje}</span>
      <button class="alert-close" onclick="this.parentElement.remove()">✕</button>
    `;
    
    container.appendChild(successDiv);
    
    setTimeout(() => {
      if (successDiv.parentElement) {
        successDiv.remove();
      }
    }, 3000);
  },

  mostrarWarning(mensaje) {
    const container = this.getOrCreateErrorContainer();
    const warningDiv = document.createElement('div');
    warningDiv.className = 'alert alert-warning';
    warningDiv.innerHTML = `
      <span class="alert-icon">⚠️</span>
      <span class="alert-message">${mensaje}</span>
      <button class="alert-close" onclick="this.parentElement.remove()">✕</button>
    `;
    
    container.appendChild(warningDiv);
    
    setTimeout(() => {
      if (warningDiv.parentElement) {
        warningDiv.remove();
      }
    }, 4000);
  },

  mostrarInfo(mensaje) {
    const container = this.getOrCreateErrorContainer();
    const infoDiv = document.createElement('div');
    infoDiv.className = 'alert alert-info';
    infoDiv.innerHTML = `
      <span class="alert-icon">ℹ️</span>
      <span class="alert-message">${mensaje}</span>
      <button class="alert-close" onclick="this.parentElement.remove()">✕</button>
    `;
    
    container.appendChild(infoDiv);
    
    setTimeout(() => {
      if (infoDiv.parentElement) {
        infoDiv.remove();
      }
    }, 3000);
  },

  getOrCreateErrorContainer() {
    let container = document.getElementById('alert-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'alert-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 400px;
      `;
      document.body.appendChild(container);
    }
    return container;
  }
};
const RateLimiter = {
  attempts: new Map(),
  
  canAttempt(action, maxAttempts = 5, windowMs = 60000) {
    const now = Date.now();
    const key = action;
    
    if (!this.attempts.has(key)) {
      this.attempts.set(key, []);
    }
    
    const attempts = this.attempts.get(key);
    // Limpiar intentos antiguos
    const validAttempts = attempts.filter(time => now - time < windowMs);
    this.attempts.set(key, validAttempts);
    
    if (validAttempts.length >= maxAttempts) {
      return false;
    }
    
    validAttempts.push(now);
    return true;
  }
};

// === FUNCIONES UTILITARIAS ===
function getElement(id) {
  return document.getElementById(id);
}

function getElements(...ids) {
  return ids.map(id => document.getElementById(id));
}

function clearForm(formId) {
  const form = getElement(formId);
  if (form) form.reset();
  
  // Ocultar checkbox de confirmación al limpiar formulario
  ocultarCheckboxConfirmacion();
  
  // Ocultar historial
  const historialPreview = document.getElementById('historialPreview');
  if (historialPreview) {
    historialPreview.style.display = 'none';
  }
  
  // Limpiar clases de resaltado
  const inputs = ['nombre', 'direccion'];
  inputs.forEach(inputId => {
    const input = document.getElementById(inputId);
    if (input) {
      input.classList.remove('campo-autocompletado');
    }
  });
}

function formatDateISO(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}



function getFechaEntregaElement() {
  return getElement('fechaEntrega');
}

// === SISTEMA DE RUTA DE REPARTO ===
const PRIORIDADES = {
  'A': { label: 'A - Alta', color: '#dc2626', bgColor: '#fee2e2' },
  'B': { label: 'B - Media', color: '#d97706', bgColor: '#fef3c7' },
  'C': { label: 'C - Baja', color: '#16a34a', bgColor: '#dcfce7' }
};
async function cambiarPrioridad(docId, nuevaPrioridad) {
  // MODO OFFLINE: Verificar conectividad primero
  if (!OfflineManager.estaOnline()) {
    OfflineManager.guardarEnCola('CAMBIAR_PRIORIDAD', { id: docId, prioridad: nuevaPrioridad });
    
    // Actualizar localStorage para reflejo inmediato
    let prioridades = JSON.parse(localStorage.getItem('pedidos_prioridades') || '{}');
    prioridades[docId] = nuevaPrioridad;
    localStorage.setItem('pedidos_prioridades', JSON.stringify(prioridades));
    
    // Actualizar UI optimistamente
    const pedido = datosLocal.find(p => p.id === docId);
    if (pedido) {
      pedido.prioridad = nuevaPrioridad;
    }
    
    ErrorHandler.mostrarWarning(`📡 Sin conexión. Prioridad ${PRIORIDADES[nuevaPrioridad].label} se sincronizará automáticamente.`);
    render(datosLocal);
    return;
  }
  
  try {
    // Intentar actualizar en Supabase
    const { error } = await supabase_client
      .from('pedidos')
      .update({ prioridad: nuevaPrioridad })
      .eq('id', docId);
    
    if (error) {
      // Si falla, usar localStorage como respaldo temporal
      console.warn('Columna prioridad no existe en Supabase, usando localStorage temporal');
      
      let prioridades = JSON.parse(localStorage.getItem('pedidos_prioridades') || '{}');
      prioridades[docId] = nuevaPrioridad;
      localStorage.setItem('pedidos_prioridades', JSON.stringify(prioridades));
      
      // Actualizar datos locales
      const pedido = datosLocal.find(p => p.id === docId);
      if (pedido) {
        pedido.prioridad = nuevaPrioridad;
      }
      
      ErrorHandler.mostrarExito(`Prioridad cambiada a ${PRIORIDADES[nuevaPrioridad].label} (temporal)`);
      render(datosLocal);
    } else {
      ErrorHandler.mostrarExito(`Prioridad cambiada a ${PRIORIDADES[nuevaPrioridad].label}`);
      cargarPedidos();
    }
  } catch (error) {
    console.error('Error al cambiar prioridad:', error);
    ErrorHandler.mostrarError('Error inesperado al cambiar prioridad');
  }
}

const PEDIDO_TELEFONO_SECUNDARIO_TAG = 'TEL2:';

function validarTelefonoOpcional(telefono) {
  const valor = String(telefono || '').trim();
  if (!valor) {
    return { valido: true, valor: '' };
  }

  return Validator.validarTelefono(valor);
}

function extraerTelefonoSecundarioDeNotas(notas) {
  const texto = String(notas || '').trim();
  if (!texto) {
    return { telefonoSecundario: '', notasLimpias: '' };
  }

  const partes = texto.split('|').map(parte => parte.trim()).filter(Boolean);
  let telefonoSecundario = '';
  const notasLimpias = partes.filter((parte) => {
    if (parte.startsWith(PEDIDO_TELEFONO_SECUNDARIO_TAG)) {
      telefonoSecundario = parte.slice(PEDIDO_TELEFONO_SECUNDARIO_TAG.length).trim();
      return false;
    }
    return true;
  }).join(' | ');

  return { telefonoSecundario, notasLimpias };
}

function combinarNotasConTelefonoSecundario(notas, telefonoSecundario) {
  const { notasLimpias } = extraerTelefonoSecundarioDeNotas(notas);
  const partes = [];

  if (telefonoSecundario) {
    partes.push(`${PEDIDO_TELEFONO_SECUNDARIO_TAG} ${telefonoSecundario}`);
  }

  if (notasLimpias) {
    partes.push(notasLimpias);
  }

  return partes.join(' | ') || null;
}
async function actualizarOrdenEntrega(docId, nuevoOrden) {
  // Validar el nuevo orden
  if (isNaN(nuevoOrden) || nuevoOrden < 0) {
    nuevoOrden = 0; // Resetear a 0 si es inválido
  }
  
  // MODO OFFLINE: Verificar conectividad primero
  if (!OfflineManager.estaOnline()) {
    OfflineManager.guardarEnCola('ACTUALIZAR_ORDEN', { id: docId, orden: nuevoOrden });
    
    // Actualizar localStorage para reflejo inmediato
    let ordenes = JSON.parse(localStorage.getItem('pedidos_ordenes') || '{}');
    ordenes[docId] = nuevoOrden;
    localStorage.setItem('pedidos_ordenes', JSON.stringify(ordenes));
    
    // Actualizar UI optimistamente
    const pedido = datosLocal.find(p => p.id === docId);
    if (pedido) {
      pedido.orden_ruta = nuevoOrden;
    }
    
    ErrorHandler.mostrarWarning(`📡 Sin conexión. Orden #${nuevoOrden || 'Sin orden'} se sincronizará automáticamente.`);
    render(datosLocal);
    return;
  }
  
  try {
    // Intentar actualizar en Supabase
    try {
      const { error } = await supabase_client
        .from('pedidos')
        .update({ orden_ruta: nuevoOrden })
        .eq('id', docId);
      
      if (error) throw error;
      
      // Actualizar datos locales
      const pedido = datosLocal.find(p => p.id === docId);
      if (pedido) {
        pedido.orden_ruta = nuevoOrden;
      }
      
      ErrorHandler.mostrarExito(`Orden actualizado a #${nuevoOrden || 'Sin orden'}`);
      
      // Recargar y reordenar la vista
      cargarPedidos();
      
    } catch (dbError) {
      // Si falla Supabase, usar localStorage temporal
      console.warn('Error en Supabase, usando localStorage temporal:', dbError);
      
      let ordenes = JSON.parse(localStorage.getItem('pedidos_ordenes') || '{}');
      ordenes[docId] = nuevoOrden;
      localStorage.setItem('pedidos_ordenes', JSON.stringify(ordenes));
      
      // Actualizar datos locales
      const pedido = datosLocal.find(p => p.id === docId);
      if (pedido) {
        pedido.orden_ruta = nuevoOrden;
      }
      
      ErrorHandler.mostrarExito(`Orden actualizado a #${nuevoOrden || 'Sin orden'} (temporal)`);
      
      // Reordenar y renderizar inmediatamente
      datosLocal.sort((a, b) => {
        // Primero por prioridad
        const prioridadA = a.prioridad || 'C';
        const prioridadB = b.prioridad || 'C';
        if (prioridadA !== prioridadB) {
          return prioridadA.localeCompare(prioridadB);
        }
        // Luego por orden numérico
        const ordenA = a.orden_ruta || 999;
        const ordenB = b.orden_ruta || 999;
        return ordenA - ordenB;
      });
      
      render(datosLocal);
    }
    
  } catch (error) {
    console.error('Error al actualizar orden de entrega:', error);
    ErrorHandler.mostrarError('Error al actualizar el orden de entrega');
  }
}
async function moverPedido(docId, direccion) {
  try {
    // Obtener el pedido actual
    const pedidoActual = datosLocal.find(p => p.id === docId);
    if (!pedidoActual) return;
    
    const prioridad = pedidoActual.prioridad || 'C';
    const pedidosMismaPrioridad = datosLocal
      .filter(p => (p.prioridad || 'C') === prioridad)
      .sort((a, b) => (a.orden_ruta || 0) - (b.orden_ruta || 0));
    
    const indiceActual = pedidosMismaPrioridad.findIndex(p => p.id === docId);
    if (indiceActual === -1) return;
    
    let nuevoIndice;
    if (direccion === 'up' && indiceActual > 0) {
      nuevoIndice = indiceActual - 1;
    } else if (direccion === 'down' && indiceActual < pedidosMismaPrioridad.length - 1) {
      nuevoIndice = indiceActual + 1;
    } else {
      return; // No se puede mover
    }
    
    // Intercambiar órdenes
    const pedidoDestino = pedidosMismaPrioridad[nuevoIndice];
    const ordenActual = pedidoActual.orden_ruta || indiceActual;
    const ordenDestino = pedidoDestino.orden_ruta || nuevoIndice;
    
    // Intentar actualizar en Supabase
    try {
      await supabase_client
        .from('pedidos')
        .update({ orden_ruta: ordenDestino })
        .eq('id', docId);
        
      await supabase_client
        .from('pedidos')
        .update({ orden_ruta: ordenActual })
        .eq('id', pedidoDestino.id);
      
      ErrorHandler.mostrarExito('Orden actualizado');
      cargarPedidos();
      
    } catch (dbError) {
      // Si falla Supabase, usar localStorage temporal
      console.warn('Columna orden_ruta no existe, usando localStorage temporal');
      
      let ordenes = JSON.parse(localStorage.getItem('pedidos_ordenes') || '{}');
      ordenes[docId] = ordenDestino;
      ordenes[pedidoDestino.id] = ordenActual;
      localStorage.setItem('pedidos_ordenes', JSON.stringify(ordenes));
      
      // Actualizar datos locales
      pedidoActual.orden_ruta = ordenDestino;
      pedidoDestino.orden_ruta = ordenActual;
      
      ErrorHandler.mostrarExito('Orden actualizado (temporal)');
      render(datosLocal);
    }
    
  } catch (error) {
    console.error('Error al mover pedido:', error);
    ErrorHandler.mostrarError('Error al mover pedido');
  }
}
function ordenarPorRuta(pedidos) {
  return pedidos.sort((a, b) => {
    // 1. PRIORIDAD MÁXIMA: Estado (Pendientes primero)
    const pendienteA = !a.entregado ? 0 : 1;
    const pendienteB = !b.entregado ? 0 : 1;
    
    if (pendienteA !== pendienteB) {
      return pendienteA - pendienteB; // 0 (pendiente) antes que 1 (completado)
    }
    
    // 2. Dentro del mismo estado: Por prioridad de ruta (A, B, C)
    const prioridadA = a.prioridad || 'C';
    const prioridadB = b.prioridad || 'C';
    
    if (prioridadA !== prioridadB) {
      return prioridadA.localeCompare(prioridadB);
    }
    
    // 3. Dentro de la misma prioridad: Por orden numérico manual
    const ordenA = parseInt(a.orden_ruta) || 999;
    const ordenB = parseInt(b.orden_ruta) || 999;
    
    if (ordenA !== ordenB) {
      return ordenA - ordenB;
    }
    
    // 4. Último criterio: Por fecha de creación
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

// Función para cerrar sesión usando Supabase Auth
async function cerrarSesion() {
  try {
    if (confirm('¿Estás seguro de que quieres cerrar la sesión?')) {
      // Limpiar preferencia de "recordar dispositivo"
      localStorage.removeItem('sabrofood_remember_device');
      
      // Cerrar sesión en Supabase
      if (typeof supabaseLogout !== 'undefined') {
        await supabaseLogout();
      }
      
      // Redirigir al login
      window.location.href = '../index.html';
    }
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
    // Si falla, forzar redirección al login
    window.location.href = '../index.html';
  }
}

// Función para inicializar la app después de autenticación
function inicializarApp() {
  console.log('Inicializando app...');
  // Mostrar el contenido principal
  document.body.style.visibility = 'visible';
}

// === INICIALIZACIÓN SUPABASE ===
// Supabase se inicializa desde shared/supabase-config.js
let supabase_client = null;

let datosLocal = [];
let datosFiltrados = []; // Pedidos actualmente visibles después de aplicar filtros
const METODOS = { 
  'E': 'Efectivo', 
  'DC': 'Débito/Crédito', 
  'TP': 'Transf. Pendiente', 
  'TG': 'Transf. Pagada',
  'PE': 'Pagado Local - Efectivo',
  'PC': 'Pagado Local - Tarjeta',
  'PX': 'Pagado Local - Mixto',
  'PM': 'Pago Mixto (Pendiente)',
  'PMP': 'Pago Mixto (Pagado)'
};

/** Muestra/oculta el sub-panel de desglose para PX (Pagado Local Mixto) */
function togglePanelPagoLocal() {
  const metodo = document.getElementById('metodoPago')?.value;
  const panel = document.getElementById('panelPagoLocalMixto');
  if (panel) {
    panel.style.display = metodo === 'PX' ? 'block' : 'none';
    if (metodo === 'PX') actualizarTotalPX();
  }
}

/** Valida que los montos PX sumen al total del pedido */
function actualizarTotalPX() {
  const ef = parseFloat(document.getElementById('pxEfectivo')?.value) || 0;
  const tk = parseFloat(document.getElementById('pxTarjeta')?.value) || 0;
  const total = ef + tk;
  const validacion = document.getElementById('pxValidacion');
  if (!validacion) return;
  if (total === 0) {
    validacion.textContent = '';
    validacion.style.color = '#6b7280';
  } else {
    validacion.textContent = `Total registrado: $${total.toLocaleString('es-CL')}`;
    validacion.style.color = '#166534';
  }
}
let lineasPedido = [];

// === SISTEMA DE DESCUENTOS ===
let subtotalSinDescuento = 0;
let descuentoAplicado = 0;
let tipoDescuentoActual = 'ninguno'; // 'ninguno', 'monto', 'porcentaje'
let valorDescuentoActual = 0;

// === SISTEMA DE TIEMPO REAL ===
function mostrarToast(mensaje, tipo = 'success') {
  // Crear elemento de notificación
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.textContent = mensaje;
  
  // Inyectar CSS si no existe
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      .toast {
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: #16a34a;
        color: white;
        padding: 14px 24px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
        z-index: 10000;
        transition: transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .toast.show {
        transform: translateX(-50%) translateY(0);
      }
      
      .toast-success {
        background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
      }
      
      .toast-info {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      }
      
      .toast-warning {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      }
    `;
    document.head.appendChild(style);
  }
  
  // Agregar al DOM
  document.body.appendChild(toast);
  
  // Mostrar con animación
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Ocultar y remover después de 3 segundos
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}
function mostrarToastNuevoPedido(mensaje) {
  // Crear elemento de notificación especial
  const toast = document.createElement('div');
  toast.className = 'toast-nuevo-pedido';
  toast.innerHTML = `
    <div class="toast-icon-pulse">🔔</div>
    <div class="toast-mensaje">${mensaje}</div>
  `;
  
  // Inyectar CSS específico para nuevo pedido si no existe
  if (!document.getElementById('toast-nuevo-pedido-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-nuevo-pedido-styles';
    style.textContent = `
      .toast-nuevo-pedido {
        position: fixed;
        top: 80px;
        right: 20px;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 20px 28px;
        border-radius: 16px;
        font-size: 16px;
        font-weight: 700;
        box-shadow: 0 12px 40px rgba(16, 185, 129, 0.5);
        z-index: 10001;
        display: flex;
        align-items: center;
        gap: 16px;
        animation: slideInBounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        border: 3px solid #34d399;
        white-space: pre-line;
      }
      
      @keyframes slideInBounce {
        0% {
          transform: translateX(400px);
          opacity: 0;
        }
        60% {
          transform: translateX(-20px);
          opacity: 1;
        }
        80% {
          transform: translateX(10px);
        }
        100% {
          transform: translateX(0);
        }
      }
      
      .toast-icon-pulse {
        font-size: 32px;
        animation: pulse 1s ease-in-out infinite;
      }
      
      @keyframes pulse {
        0%, 100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.2);
        }
      }
      
      .toast-mensaje {
        line-height: 1.4;
      }
      
      .toast-nuevo-pedido.hide {
        animation: slideOutRight 0.4s ease-in forwards;
      }
      
      @keyframes slideOutRight {
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
      
      @media (max-width: 768px) {
        .toast-nuevo-pedido {
          top: 20px;
          right: 10px;
          left: 10px;
          padding: 16px 20px;
          font-size: 14px;
        }
        
        .toast-icon-pulse {
          font-size: 24px;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Agregar al DOM
  document.body.appendChild(toast);
  
  // Ocultar y remover después de 5 segundos (más tiempo para nuevos pedidos)
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 400);
  }, 5000);
  
  // Hacer clic para cerrar manualmente
  toast.addEventListener('click', () => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 400);
  });
}
function activarTiempoReal() {
  // Crear canal de Supabase con un nombre único
  const channel = supabase_client
    .channel('realtime:public:pedidos')
    .on(
      'postgres_changes',
      {
        event: '*', // Escuchar todos los eventos (INSERT, UPDATE, DELETE)
        schema: 'public',
        table: 'pedidos'
      },
      (payload) => {
        console.log('📡 Evento en tiempo real:', payload);
        
        // PROTECCIÓN: Verificar si el usuario está interactuando con el formulario
        const formularioAbierto = document.getElementById('formModalBackdrop')?.style.display === 'flex';
        const hayInputActivo = document.activeElement?.tagName === 'INPUT' || 
                               document.activeElement?.tagName === 'TEXTAREA' ||
                               document.activeElement?.tagName === 'SELECT';
        
        // Si está escribiendo o editando, mostrar notificación discreta en lugar de refrescar
        if (formularioAbierto || hayInputActivo) {
          console.log('⏸️ Usuario ocupado, notificación silenciosa');
          mostrarNotificacionDiscreta(payload.eventType);
          // Guardar que hay datos pendientes de refrescar
          window.refrescoPendiente = true;
          return;
        }
        
        // Detectar si es un NUEVO PEDIDO (INSERT)
        if (payload.eventType === 'INSERT') {
          // 🔔 NOTIFICACIÓN DE NUEVO PEDIDO
          notificarNuevoPedido(payload.new);
        } else if (payload.eventType === 'UPDATE') {
          // Notificación simple para actualizaciones
          mostrarToast('🔄 Pedido actualizado');
        } else if (payload.eventType === 'DELETE') {
          // Notificación para eliminaciones
          mostrarToast('🗑️ Pedido eliminado');
        }
        
        // REFRESCO INTELIGENTE: Recargar manteniendo el estado
        refrescoInteligente();
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        ErrorHandler.mostrarInfo('🔔 Tiempo real activado');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Error en el canal de tiempo real:', err);
        ErrorHandler.mostrarWarning('⚠️ Tiempo real no disponible.');
      }
    });
  
  // Guardar referencia al canal para poder desuscribirse después si es necesario
  window.realtimeChannel = channel;
}
function activarTiempoRealCarga() {
  const channelCarga = supabase_client
    .channel('realtime:public:carga_marcados')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'carga_marcados'
      },
      async (payload) => {
        console.log('📦 Cambio en carga:', payload);
        
        const checkboxId = payload.new?.checkbox_id || payload.old?.checkbox_id;
        
        // Actualizar cache local
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (payload.new?.marcado) {
            itemsMarcadosCache.add(checkboxId);
            const compatKey = crearClaveCompatibilidadCarga(payload.new?.pedido_id, payload.new || {});
            itemsMarcadosDetalleCache.set(compatKey, checkboxId);
          } else {
            itemsMarcadosCache.delete(checkboxId);
            const compatKey = crearClaveCompatibilidadCarga(payload.new?.pedido_id, payload.new || {});
            itemsMarcadosDetalleCache.delete(compatKey);
          }
        } else if (payload.eventType === 'DELETE') {
          itemsMarcadosCache.delete(checkboxId);
          const compatKey = crearClaveCompatibilidadCarga(payload.old?.pedido_id, payload.old || {});
          itemsMarcadosDetalleCache.delete(compatKey);
        }
        
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('📦 Sincronización de carga activada');
      }
    });
  
  window.realtimeChannelCarga = channelCarga;
}
async function refrescoInteligente() {
  console.log('🔄 Iniciando refresco inteligente...');
  
  // 1. CAPTURAR ESTADO ACTUAL
  const estadoGuardado = {
    filtro: filtroActual,
    busqueda: textoTerminoBusqueda,
    scrollY: window.scrollY || document.documentElement.scrollTop,
    fechaCustom: document.getElementById('filterDate')?.value
  };
  
  console.log('💾 Estado guardado:', estadoGuardado);
  
  // 2. RECARGAR DATOS desde Supabase
  await cargarPedidos();
  
  // 3. RE-APLICAR FILTROS
  setTimeout(() => {
    // Re-aplicar filtro de fecha
    if (estadoGuardado.filtro === 'custom' && estadoGuardado.fechaCustom) {
      const dateInput = document.getElementById('filterDate');
      if (dateInput) {
        dateInput.value = estadoGuardado.fechaCustom;
        filtrarPorFecha();
      }
    } else if (estadoGuardado.filtro && estadoGuardado.filtro !== 'todos') {
      aplicarFiltroFecha(estadoGuardado.filtro);
    }
    
    // Re-aplicar búsqueda si existía
    if (estadoGuardado.busqueda) {
      // TODO: Implementar búsqueda si existe en la app
      console.log('🔍 Búsqueda guardada:', estadoGuardado.busqueda);
    }
    
    // 4. RESTAURAR SCROLL
    if (estadoGuardado.scrollY > 0) {
      window.scrollTo(0, estadoGuardado.scrollY);
    }
    
    console.log('✅ Estado restaurado');
  }, 100);
}

/**
 * Mostrar notificación discreta cuando el usuario está ocupado
 */
function mostrarNotificacionDiscreta(eventoTipo) {
  const mensajes = {
    'INSERT': '🆕 Nuevo pedido recibido',
    'UPDATE': '🔄 Pedido actualizado',
    'DELETE': '🗑️ Pedido eliminado'
  };
  
  const mensaje = mensajes[eventoTipo] || '📡 Cambio detectado';
  
  // Crear notificación pequeña en la esquina
  const notif = document.createElement('div');
  notif.className = 'notificacion-discreta';
  notif.innerHTML = `
    ${mensaje}
    <button onclick="location.reload()" style="margin-left: 8px; background: #667eea; color: white; border: none; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">Actualizar</button>
  `;
  notif.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: #1f2937;
    color: white;
    padding: 10px 14px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    font-size: 13px;
    display: flex;
    align-items: center;
    animation: slideInRight 0.3s ease;
  `;
  
  document.body.appendChild(notif);
  
  // Auto-remover después de 5 segundos
  setTimeout(() => {
    notif.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notif.remove(), 300);
  }, 5000);
}

/**
 * Notificar nuevo pedido con sonido, vibración y alerta visual
 * @param {object} pedido - Datos del nuevo pedido
 */
function notificarNuevoPedido(pedido) {
  console.log('🔔 ¡NUEVO PEDIDO RECIBIDO!', pedido);
  
  // 1. REPRODUCIR SONIDO
  const audio = document.getElementById('audio-notificacion');
  if (audio) {
    // Intentar reproducir, manejar error si el navegador bloquea autoplay
    audio.play().catch(error => {
      console.warn('⚠️ Autoplay bloqueado por el navegador:', error);
      // El usuario debe interactuar primero con la página para permitir sonidos
    });
  }
  
  // 2. VIBRAR EL DISPOSITIVO (solo funciona en móviles)
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200]); // Patrón: vibrar 200ms, pausa 100ms, vibrar 200ms
  }
  
  // 3. MOSTRAR NOTIFICACIÓN VISUAL (Toast verde)
  const nombreCliente = pedido.nombre || 'Sin nombre';
  const telefono = pedido.telefono || 'Sin teléfono';
  mostrarToastNuevoPedido(`🔔 ¡NUEVO PEDIDO!\n${nombreCliente} - ${telefono}`);
  
  // 4. NOTIFICACIÓN DEL NAVEGADOR (si está permitido)
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('🔔 ¡Nuevo Pedido!', {
      body: `Cliente: ${nombreCliente}\nTeléfono: ${telefono}`,
      icon: '📦',
      badge: '🔔',
      vibrate: [200, 100, 200],
      requireInteraction: true // Mantener hasta que el usuario la cierre
    });
  }
}

// Cargar pedidos con datos de ruta desde localStorage si es necesario
async function cargarPedidos() {
  const [statusEl, resultadosEl] = getElements('status', 'resultados');
  
  // 🔥 VERIFICAR QUE SUPABASE ESTÉ INICIALIZADO
  if (!supabase_client) {
    console.error('❌ supabase_client no está inicializado');
    statusEl.innerText = 'Estado: ERROR - Cliente no inicializado';
    resultadosEl.innerHTML = '<div class="item">❌ Error crítico: El cliente de Supabase no está inicializado. Recarga la página.</div>';
    return;
  }
  
  statusEl.innerText = 'Estado: Conectando...';
  
  try {
    // 🔥 PRIORIDAD #1: SIEMPRE INTENTAR SUPABASE PRIMERO
    console.log('🔥 BAJANDO DATOS FRESCOS DE SUPABASE...');
    
    const { data, error } = await supabase_client.from('pedidos').select('*').order('created_at', { ascending: false });
    
    if(error) {
      console.error('❌ Error de Supabase:', error);
      console.warn('⚠️ SUPABASE FALLÓ - Intentando con caché de emergencia...');
      
      // RESPALDO DE EMERGENCIA: Solo usar cache si FALLA Supabase
      const cachedData = OfflineManager.cargarCache();
      if (cachedData && cachedData.length > 0) {
        statusEl.innerText = '⚠️ Error de conexión - Usando cache de emergencia';
        datosLocal = cachedData;
        render(datosLocal);
        updateResultCount(datosLocal.length || 0, '');
        actualizarResumenCaja(datosLocal, filtroActual);
        ErrorHandler.mostrarWarning('⚠️ Supabase no responde. Mostrando últimos datos guardados.');
        return;
      }
      
      const statusIcon = document.getElementById('statusIcon');
      const statusText = document.getElementById('statusText');
      if (statusText) statusText.textContent = 'Error de conexión';
      if (statusIcon) statusIcon.textContent = '🔴';
      resultadosEl.innerHTML = '<div class="item">Error al conectar con la base de datos. Verifica tu conexión y permisos en Supabase.</div>';
      return;
    }
    
    // ✅ DATOS FRESCOS DE SUPABASE
    console.log('✅ DATOS FRESCOS RECIBIDOS DE SUPABASE');
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = 'Conectado';
    if (statusIcon) statusIcon.textContent = '🟢';
    datosLocal = data || [];
    
    // Guardar en cache para uso offline
    OfflineManager.guardarCache(datosLocal);
  
    // Cargar prioridades y órdenes desde localStorage (temporal)
    const prioridadesLocal = JSON.parse(localStorage.getItem('pedidos_prioridades') || '{}');
    const ordenesLocal = JSON.parse(localStorage.getItem('pedidos_ordenes') || '{}');
    
    // Aplicar datos de localStorage a los pedidos
    datosLocal = datosLocal.map(pedido => ({
      ...pedido,
      prioridad: prioridadesLocal[pedido.id] || pedido.prioridad || 'C',
      orden_ruta: ordenesLocal[pedido.id] || pedido.orden_ruta || 0
    }));
    
    // Aplicar filtro actual después de cargar datos
    if (filtroActual && filtroActual !== 'todos') {
      aplicarFiltroFecha(filtroActual);
    } else {
      render(datosLocal);
      updateResultCount(datosLocal.length || 0, '');
      actualizarResumenCaja(datosLocal, filtroActual);
    }
  } catch (err) {
    console.error('🚨 Error inesperado en cargarPedidos:', err);
    
    // Fallback final a cache
    const cachedData = OfflineManager.cargarCache();
    if (cachedData && cachedData.length > 0) {
      statusEl.innerText = '⚠️ Error inesperado - Usando cache';
      datosLocal = cachedData;
      render(datosLocal);
      updateResultCount(datosLocal.length || 0, '');
      actualizarResumenCaja(datosLocal, filtroActual);
      ErrorHandler.mostrarWarning('⚠️ Error inesperado. Mostrando últimos datos guardados.');
      return;
    }
    
    statusEl.innerText = 'Estado: ERROR';
    resultadosEl.innerHTML = '<div class="item">Error inesperado. Ver consola para detalles.</div>';
  }
}

// Guardar pedido con validación robusta
async function guardarPedido() {
  // Rate limiting
  if (!RateLimiter.canAttempt('guardar_pedido', 10, 60000)) {
    ErrorHandler.mostrarError('Demasiados intentos. Espera un minuto.');
    return;
  }

  try {
    const [nombreEl, direccionEl, telefonoEl, telefonoSecundarioEl, fechaEl, metodoEl, notasEl, rutaEl, asignadoEl] = 
      getElements('nombre', 'direccion', 'telefono', 'telefonoSecundario', 'fechaEntrega', 'metodoPago', 'notas', 'rutaSelect', 'asignadoA');
    
    // NUEVA VALIDACIÓN: Verificar checkbox de confirmación si está visible
    const checkboxContainer = document.getElementById('checkboxConfirmacionContainer');
    const checkbox = document.getElementById('checkboxConfirmacionDireccion');
    
    if (checkboxContainer && checkboxContainer.style.display !== 'none') {
      if (!checkbox || !checkbox.checked) {
        ErrorHandler.mostrarError('⚠️ ERROR: Debes CONFIRMAR que verificaste la dirección de entrega.\n\nMarca el checkbox amarillo antes de guardar el pedido.');
        
        // Resaltar el checkbox con animación
        if (checkboxContainer) {
          checkboxContainer.style.animation = 'pulseWarning 1.5s ease-in-out 3';
        }
        
        return;
      }
    }
    
    // Validación CRÍTICA: Verificar que se haya seleccionado un método de pago
    if (!metodoEl.value || metodoEl.value === '') {
      ErrorHandler.mostrarError('¡ERROR! Debes seleccionar un método de pago antes de agendar.');
      return;
    }
    
    // Validar todos los campos
    const validaciones = {
      nombre: Validator.validarNombre(nombreEl.value),
      direccion: Validator.validarDireccion(direccionEl.value),
      telefono: Validator.validarTelefono(telefonoEl.value),
      telefonoSecundario: validarTelefonoOpcional(telefonoSecundarioEl?.value),
      fecha: Validator.validarFecha(fechaEl.value),
      nota: Validator.validarNota(notasEl.value)
    };

    // Verificar si hay productos
    if (lineasPedido.length === 0) {
      ErrorHandler.mostrarError('⚠️ Debe agregar al menos un producto al pedido');
      return;
    }

    // Calcular total del pedido
    const totalPedido = lineasPedido.reduce((acc, p) => {
      const esGranel = p.nombre && p.nombre.toLowerCase().includes('(granel)');
      return acc + (esGranel ? p.cantidad : p.cantidad * p.precio);
    }, 0);
    
    // Verificar que el total no sea $0
    if (totalPedido === 0) {
      ErrorHandler.mostrarError('⚠️ El total del pedido no puede ser $0. Verifica los precios de los productos.');
      return;
    }

    // Recopilar errores
    const errores = [];
    Object.entries(validaciones).forEach(([campo, result]) => {
      if (!result.valido) {
        errores.push(`${campo}: ${result.error}`);
      }
    });

    if (errores.length > 0) {
      ErrorHandler.mostrarError('Errores de validación:\n• ' + errores.join('\n• '));
      return;
    }

    // Construir objeto pedido con datos validados
    const metodoPagoSeleccionado = metodoEl.value || 'E';
    let notasPedido = validaciones.nota.valor;

    // Si es PX (Pagado Local Mixto), agregar desglose de montos a las notas
    if (metodoPagoSeleccionado === 'PX') {
      const efPX = parseFloat(document.getElementById('pxEfectivo')?.value) || 0;
      const tkPX = parseFloat(document.getElementById('pxTarjeta')?.value) || 0;
      if (efPX + tkPX === 0) {
        ErrorHandler.mostrarError('⚠️ Para Pagado Local Mixto debes ingresar los montos de efectivo y/o tarjeta.');
        return;
      }
      const partesPX = [];
      if (efPX > 0) partesPX.push(`💵 Efectivo: $${efPX.toLocaleString('es-CL')}`);
      if (tkPX > 0) partesPX.push(`💳 Tarjeta: $${tkPX.toLocaleString('es-CL')}`);
      const detallePX = `💰 PAGADO LOCAL MIXTO: ${partesPX.join(', ')}`;
      notasPedido = notasPedido ? `${detallePX} | ${notasPedido}` : detallePX;
    }

    notasPedido = combinarNotasConTelefonoSecundario(notasPedido, validaciones.telefonoSecundario.valor);

    const pedido = {
      id: generarId(),
      nombre: validaciones.nombre.valor,
      direccion: validaciones.direccion.valor,
      telefono: validaciones.telefono.valor,
      fecha: validaciones.fecha.valor,
      metodo_pago: metodoPagoSeleccionado,
      notas: notasPedido,
      total: Math.max(0, subtotalSinDescuento - descuentoAplicado), // Total con descuento aplicado
      entregado: false,
      prioridad: rutaEl.value || 'C', // Prioridad desde selector de ruta (por defecto C)
      orden_ruta: Math.floor(Date.now() / 1000), // Timestamp en segundos (más pequeño)
      asignado_a: asignadoEl?.value || null, // Asignación de chofer (null si no está asignado)
      created_at: new Date().toISOString(),
      items: lineasPedido.map(item => ({
        producto_id: item.producto_id || null, // ⚡ INCLUIR para descuento de stock
        nombre: Validator.sanitizeHTML(item.nombre),
        cantidad: parseInt(item.cantidad),
        precio: parseInt(item.precio)
      }))
    };
    
    // Agregar información de descuento si se aplicó
    if (descuentoAplicado > 0) {
      pedido.descuento = descuentoAplicado;
      pedido.tipo_descuento = tipoDescuentoActual;
      pedido.valor_descuento = valorDescuentoActual;
      pedido.subtotal_sin_descuento = subtotalSinDescuento;
    }

    // Mostrar indicador de carga
    const btnAgregar = getElement('btnAgregar');
    const textoOriginal = btnAgregar.textContent;
    btnAgregar.textContent = 'Guardando...';
    btnAgregar.disabled = true;

    const { data, error } = await supabase_client.from('pedidos').insert([pedido]);
    
    if (error) {
      console.error('Error de Supabase detallado:', error);
      console.error('Pedido que se intentó guardar:', pedido);
      ErrorHandler.mostrarError(`Error al guardar el pedido: ${error.message}`);
    } else {
      ErrorHandler.mostrarExito('Pedido guardado exitosamente');
      clearForm('formAgregar');
      lineasPedido = [];
      
      // Resetear descuentos
      descuentoAplicado = 0;
      tipoDescuentoActual = 'ninguno';
      valorDescuentoActual = 0;
      subtotalSinDescuento = 0;
      
      renderLineasPedido();
      
      // Ocultar checkbox de confirmación después de guardar exitosamente
      ocultarCheckboxConfirmacion();
      setFechaHoyDefault();
      getElement('formModalBackdrop').style.display = 'none';
      cargarPedidos();
    }

  } catch (error) {
    console.error('Error inesperado:', error);
    ErrorHandler.mostrarError('Error inesperado. Por favor, inténtelo nuevamente.');
  } finally {
    // Restaurar botón
    const btnAgregar = getElement('btnAgregar');
    if (btnAgregar) {
      btnAgregar.textContent = 'Agregar Pedido';
      btnAgregar.disabled = false;
    }
  }
}

// Eliminar pedido
/**
 * Eliminar pedido con gestión de estado UI
 * @param {string} docId - ID del pedido a eliminar
 * @param {HTMLElement} btnElement - Elemento del botón que activó la acción
 */
async function eliminarPedido(docId, btnElement = null) {
  // MODO OFFLINE: Verificar conectividad primero
  if (!OfflineManager.estaOnline()) {
    OfflineManager.guardarEnCola('ELIMINAR', { id: docId });
    ErrorHandler.mostrarWarning('📡 Sin conexión. La eliminación se sincronizará automáticamente cuando vuelva la señal.');
    
    // Ocultar tarjeta optimistamente
    const card = document.querySelector(`[data-pedido-id="${docId}"]`);
    if (card) {
      card.style.transition = 'all 0.3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
      setTimeout(() => card.style.display = 'none', 300);
    }
    
    return;
  }
  
  // Paso 1: Gestión inmediata del UI
  let textoOriginal = '';
  if (btnElement) {
    textoOriginal = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.classList.add('btn-loading');
    btnElement.innerHTML = '⏳ Eliminando...';
    btnElement.style.opacity = '0.7';
  }

  try {
    // Paso 2: Llamada a Supabase
    const { error } = await supabase_client.from('pedidos').delete().eq('id', docId);
    
    // Paso 3: Manejo de error
    if (error) {
      throw new Error(error.message);
    }
    
    // Éxito
    ErrorHandler.mostrarExito('🗑️ Pedido eliminado correctamente');
    cargarPedidos();
    
  } catch (error) {
    // Paso 3: Manejo de errores de conexión
    console.error('Error en eliminarPedido:', error);
    alert('⚠️ Error de conexión. No se pudo eliminar el pedido. Intenta de nuevo.\n\nDetalle: ' + error.message);
    
  } finally {
    // Paso 4: Restauración del botón (solo si hay error)
    if (btnElement && btnElement.disabled) {
      btnElement.disabled = false;
      btnElement.classList.remove('btn-loading');
      btnElement.innerHTML = textoOriginal;
      btnElement.style.opacity = '1';
    }
  }
}

/**
 * Anular pedido (Soft Delete - No se cobró)
 * Marca el pedido como entregado pero con estado ANULADO
 * @param {string} docId - ID del pedido a anular
 * @param {HTMLElement} btnElement - Elemento del botón que activó la acción
 */
async function anularPedido(docId, btnElement = null) {
  // Confirmación antes de anular
  const confirmar = confirm('🚫 ¿Marcar como ANULADO (No cobrado)?\n\nEl pedido saldrá de la lista de pendientes pero NO se contabilizará en la caja.\n\nUsa esta opción cuando:\n- El cliente canceló\n- No se pudo entregar\n- Hubo un error en el pedido');
  
  if (!confirmar) {
    return;
  }
  
  // MODO OFFLINE: Verificar conectividad primero
  if (!OfflineManager.estaOnline()) {
    OfflineManager.guardarEnCola('ANULAR', { id: docId });
    ErrorHandler.mostrarWarning('📡 Sin conexión. La anulación se sincronizará automáticamente cuando vuelva la señal.');
    
    // Ocultar tarjeta optimistamente
    const card = document.querySelector(`[data-cliente-id="${docId}"]`);
    if (card) {
      card.style.transition = 'all 0.3s ease';
      card.style.opacity = '0.5';
      card.style.filter = 'grayscale(100%)';
    }
    
    return;
  }
  
  // Gestión inmediata del UI
  let textoOriginal = '';
  if (btnElement) {
    textoOriginal = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = '⏳ Anulando...';
    btnElement.style.opacity = '0.7';
  }

  try {
    // Obtener datos del pedido completos antes de anular
    const { data: pedido, error: errorGet } = await supabase_client
      .from('pedidos')
      .select('*')
      .eq('id', docId)
      .single();
    
    if (errorGet) {
      throw new Error(errorGet.message);
    }
    
    // 🔥 DEVOLVER STOCK DE ITEMS MARCADOS EN CARGA
    await devolverStockItemsMarcados(docId, pedido);
    
    // Verificar si el pedido ya estaba entregado (necesita devolución de stock)
    const yaEstregado = pedido.entregado === true && pedido.estado !== 'ANULADO';
    
    // Actualizar pedido en Supabase
    const { error } = await supabase_client
      .from('pedidos')
      .update({ 
        entregado: true,
        estado: 'ANULADO'
      })
      .eq('id', docId);
    
    if (error) {
      throw new Error(error.message);
    }
    
    // Si estaba entregado, devolver stock
    if (yaEstregado) {
      await devolverStockPedido(docId, pedido);
      ErrorHandler.mostrarExito('🚫 Pedido ANULADO y stock restaurado. El encargado ha sido notificado.');
    } else {
      ErrorHandler.mostrarExito('🚫 Pedido marcado como ANULADO (no se contabiliza en caja)');
    }
    
    cargarPedidos();
    
  } catch (error) {
    console.error('Error en anularPedido:', error);
    ErrorHandler.mostrarError(`⚠️ Error al anular el pedido: ${error.message}`);
    
  } finally {
    // Restaurar botón si hay error
    if (btnElement && btnElement.disabled) {
      btnElement.disabled = false;
      btnElement.innerHTML = textoOriginal;
      btnElement.style.opacity = '1';
    }
  }
}

/**
 * Asignar pedido a un repartidor
 * @param {string} docId - ID del pedido a asignar
 */
async function asignarRepartidor(docId) {
  // Obtener pedido actual para mostrar info
  const pedido = datosLocal.find(p => p.id === docId);
  if (!pedido) {
    ErrorHandler.mostrarError('No se encontró el pedido');
    return;
  }

  // Crear modal de selección
  const asignadoActual = pedido.asignado_a || 'Sin asignar';
  const opciones = `
    <div style="background:white;padding:24px;border-radius:12px;max-width:400px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
      <h3 style="margin:0 0 16px 0;font-size:20px;color:#1f2937;">🚚 Asignar Repartidor</h3>
      <p style="margin:0 0 16px 0;color:#6b7280;font-size:14px;">
        <strong>Pedido:</strong> ${pedido.nombre}<br>
        <strong>Actual:</strong> ${asignadoActual}
      </p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <button class="btn-asignar-repartidor" data-repartidor="repartidor_1" style="background:#3b82f6;color:white;border:none;padding:12px;border-radius:8px;font-size:16px;cursor:pointer;font-weight:600;">
          🚚 Repartidor 1
        </button>
        <button class="btn-asignar-repartidor" data-repartidor="repartidor_2" style="background:#10b981;color:white;border:none;padding:12px;border-radius:8px;font-size:16px;cursor:pointer;font-weight:600;">
          🚚 Repartidor 2
        </button>
        <button class="btn-asignar-repartidor" data-repartidor="" style="background:#6b7280;color:white;border:none;padding:12px;border-radius:8px;font-size:16px;cursor:pointer;font-weight:600;">
          ❌ Sin asignar
        </button>
        <button class="btn-cancelar-asignar" style="background:#ef4444;color:white;border:none;padding:12px;border-radius:8px;font-size:16px;cursor:pointer;font-weight:600;">
          Cancelar
        </button>
      </div>
    </div>
  `;

  // Mostrar modal
  const modalOverlay = document.createElement('div');
  modalOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
  modalOverlay.innerHTML = opciones;
  document.body.appendChild(modalOverlay);

  // Event listeners para botones
  const botonesAsignar = modalOverlay.querySelectorAll('.btn-asignar-repartidor');
  const btnCancelar = modalOverlay.querySelector('.btn-cancelar-asignar');

  botonesAsignar.forEach(btn => {
    btn.onclick = async () => {
      const repartidor = btn.dataset.repartidor;
      
      try {
        // Actualizar en Supabase
        const { error } = await supabase_client
          .from('pedidos')
          .update({ asignado_a: repartidor || null })
          .eq('id', docId);
        
        if (error) throw new Error(error.message);
        
        ErrorHandler.mostrarExito(`✅ Pedido asignado a: ${repartidor || 'Sin asignar'}`);
        document.body.removeChild(modalOverlay);
        cargarPedidos();
        
      } catch (error) {
        console.error('Error al asignar repartidor:', error);
        ErrorHandler.mostrarError(`⚠️ Error: ${error.message}`);
      }
    };
  });

  btnCancelar.onclick = () => {
    document.body.removeChild(modalOverlay);
  };

  // Cerrar al hacer clic fuera
  modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) {
      document.body.removeChild(modalOverlay);
    }
  };
}

/**
 * Reactivar un pedido anulado (volver a estado pendiente normal)
 * @param {string} docId - ID del pedido a reactivar
 * @param {HTMLElement} btnElement - Elemento del botón que activó la acción
 */
async function reactivarPedido(docId, btnElement = null) {
  // Confirmación antes de reactivar
  const confirmar = confirm('🔄 ¿Reactivar este pedido?\n\nEl pedido volverá a aparecer como PENDIENTE y se podrá entregar normalmente.\n\n¿Continuar?');
  
  if (!confirmar) {
    return;
  }
  
  // MODO OFFLINE: Verificar conectividad primero
  if (!OfflineManager.estaOnline()) {
    OfflineManager.guardarEnCola('REACTIVAR', { id: docId });
    ErrorHandler.mostrarWarning('📡 Sin conexión. La reactivación se sincronizará automáticamente cuando vuelva la señal.');
    
    // Actualizar UI optimistamente
    const card = document.querySelector(`[data-cliente-id="${docId}"]`);
    if (card) {
      card.style.transition = 'all 0.3s ease';
      card.style.opacity = '1';
      card.style.filter = 'none';
    }
    
    return;
  }
  
  // Gestión inmediata del UI
  let textoOriginal = '';
  if (btnElement) {
    textoOriginal = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = '⏳ Reactivando...';
    btnElement.style.opacity = '0.7';
  }

  try {
    // Actualizar pedido en Supabase - volver a estado pendiente
    const { error } = await supabase_client
      .from('pedidos')
      .update({ 
        entregado: false,
        estado: null
      })
      .eq('id', docId);
    
    if (error) {
      throw new Error(error.message);
    }
    
    // Éxito
    ErrorHandler.mostrarExito('✅ Pedido reactivado correctamente');
    cargarPedidos();
    
  } catch (error) {
    console.error('Error en reactivarPedido:', error);
    ErrorHandler.mostrarError(`⚠️ Error al reactivar el pedido: ${error.message}`);
    
  } finally {
    // Restaurar botón si hay error
    if (btnElement && btnElement.disabled) {
      btnElement.disabled = false;
      btnElement.innerHTML = textoOriginal;
      btnElement.style.opacity = '1';
    }
  }
}

/**
 * Marcar/desmarcar pedido como entregado con confirmación de pago
 * @param {string} docId - ID del pedido
 * @param {boolean} estadoActual - Estado actual de entrega
 * @param {HTMLElement} btnElement - Elemento del botón que activó la acción
 */
async function toggleEntregado(docId, estadoActual, btnElement = null) {
  // MODO OFFLINE: Verificar conectividad primero
  if (!OfflineManager.estaOnline()) {
    // Guardar en cola con estado optimista
    const tipo = estadoActual ? 'DESMARCAR' : 'ENTREGAR';
    OfflineManager.guardarEnCola(tipo, { id: docId, estadoActual });
    
    // Actualizar UI optimistamente
    ErrorHandler.mostrarWarning(`📡 Sin conexión. ${estadoActual ? 'Desmarcado' : 'Entrega'} se sincronizará automáticamente cuando vuelva la señal.`);
    
    // Ocultar la tarjeta del pedido optimistamente
    const card = document.querySelector(`[data-pedido-id="${docId}"]`);
    if (card) {
      card.style.opacity = '0.5';
      card.style.filter = 'grayscale(100%)';
      const badge = document.createElement('div');
      badge.style.cssText = 'position:absolute;top:10px;right:10px;background:#ff9800;color:white;padding:5px 10px;border-radius:5px;font-size:12px;font-weight:bold;';
      badge.textContent = '📡 Pendiente sincronización';
      card.style.position = 'relative';
      card.appendChild(badge);
    }
    
    return; // Salir temprano
  }
  
  // Paso 1: Gestión inmediata del UI
  let textoOriginal = '';
  if (btnElement) {
    textoOriginal = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.classList.add('btn-loading');
    btnElement.innerHTML = '⏳ Procesando...';
    btnElement.style.opacity = '0.7';
  }

  try {
    if (estadoActual) {
      // Si ya está entregado, desmarcar directamente sin confirmación
      // Paso 2: Llamada a Supabase
      const { error } = await supabase_client.from('pedidos').update({ entregado: false }).eq('id', docId);
      
      // Paso 3: Manejo de error
      if (error) {
        throw new Error(error.message);
      }
      
      // Éxito
      ErrorHandler.mostrarExito('📦 Pedido marcado como pendiente');
      cargarPedidos();
      
    } else {
      // Verificar si el pedido ya está pagado antes de abrir modal
      const { data: pedido, error } = await supabase_client
        .from('pedidos')
        .select('metodo_pago, nombre')
        .eq('id', docId)
        .single();
      
      if (error) {
        throw new Error(error.message);
      }
      
      const metodoPago = pedido.metodo_pago || 'E';
      
      // Si ya es TG o "Pagado en local" (PE/PC/PX/P), entregar directamente sin modal
      // El pago ya ocurrió en el local — el repartidor solo hace la entrega física
      const metodosDirectos = {
        'TG': '✅ Pedido entregado - Transferencia ya confirmada',
        'P':  '✅ Pedido entregado - Ya estaba pagado en el local',
        'PE': '✅ Pedido entregado - Pagado en local (Efectivo)',
        'PC': '✅ Pedido entregado - Pagado en local (Tarjeta)',
        'PX': '✅ Pedido entregado - Pagado en local (Mixto)'
      };
      if (metodosDirectos[metodoPago]) {
        const { error: errEntrega } = await supabase_client
          .from('pedidos')
          .update({ entregado: true, updated_at: new Date().toISOString() })
          .eq('id', docId);
        if (errEntrega) throw new Error(errEntrega.message);
        if (btnElement) {
          btnElement.disabled = false;
          btnElement.classList.remove('btn-loading');
          btnElement.innerHTML = textoOriginal;
          btnElement.style.opacity = '1';
        }
        ErrorHandler.mostrarExito(metodosDirectos[metodoPago]);
        cargarPedidos();
        return;
      }
      
      // Para otros métodos, abrir modal de confirmación de pago
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.classList.remove('btn-loading');
        btnElement.innerHTML = textoOriginal;
        btnElement.style.opacity = '1';
      }
      abrirModalConfirmacionPago(docId)
    }
    
  } catch (error) {
    // Paso 3: Manejo de errores de conexión
    console.error('Error en toggleEntregado:', error);
    alert('⚠️ Error de conexión. No se pudo actualizar el pedido. Intenta de nuevo.\n\nDetalle: ' + error.message);
    
  } finally {
    // Paso 4: Restauración del botón (solo si hubo error, en caso de éxito ya recargó)
    if (btnElement && !btnElement.disabled) {
      // Ya fue restaurado por alguna cancelación o modal
      return;
    }
    // Si llegamos aquí con el botón aún deshabilitado, hubo un error
    if (btnElement && btnElement.disabled) {
      btnElement.disabled = false;
      btnElement.classList.remove('btn-loading');
      btnElement.innerHTML = textoOriginal;
      btnElement.style.opacity = '1';
    }
  }
}

// ========================================
// SISTEMA DE CONFIRMACIÓN DE PAGO AL ENTREGAR
// ========================================

/**
 * Abre el modal de confirmación de pago para repartidores
 * @param {string} docId - ID del pedido a entregar
 */
async function abrirModalConfirmacionPago(docId) {
  // Obtener datos del pedido
  const { data: pedido, error } = await supabase_client
    .from('pedidos')
    .select('*')
    .eq('id', docId)
    .single();
  
  if (error) {
    alert('Error al cargar pedido: ' + error.message);
    return;
  }

  // Crear el modal
  const modalHtml = `
    <div id="modalPago" class="modal-pago-backdrop">
      <div class="modal-pago">
        <div class="modal-pago-header">
          <h3>💰 CONFIRMACIÓN DE ENTREGA Y PAGO</h3>
          <button id="cerrarModalPago" class="modal-close">✕</button>
        </div>
        
        <div class="modal-pago-body">
          <div class="pedido-info-resumen">
            <h4>📦 ${pedido.nombre || 'Sin nombre'}</h4>
            <p class="pedido-total-destacado">💵 Total a Cobrar: <strong>$${pedido.total?.toLocaleString() || '0'}</strong></p>
          </div>
          
          <div class="pago-pregunta">
            <h4>❓ ¿Cómo pagó realmente el cliente?</h4>
            <p class="pago-subtitulo">Selecciona una de las siguientes opciones:</p>
            
            <div class="metodo-pago-opciones-grandes">
              <label class="metodo-opcion-grande efectivo">
                <input type="radio" name="metodoPagoReal" value="efectivo" checked>
                <div class="metodo-contenido">
                  <span class="metodo-icono-grande">💵</span>
                  <span class="metodo-titulo">EFECTIVO</span>
                  <span class="metodo-descripcion">Suma a la Caja del Chofer</span>
                </div>
              </label>
              
              <label class="metodo-opcion-grande tarjeta">
                <input type="radio" name="metodoPagoReal" value="tarjeta">
                <div class="metodo-contenido">
                  <span class="metodo-icono-grande">💳</span>
                  <span class="metodo-titulo">TARJETA (POS)</span>
                  <span class="metodo-descripcion">Suma a la Caja del Chofer en Vouchers</span>
                </div>
              </label>
              
              <label class="metodo-opcion-grande transferencia">
                <input type="radio" name="metodoPagoReal" value="transferencia">
                <div class="metodo-contenido">
                  <span class="metodo-icono-grande">🔄</span>
                  <span class="metodo-titulo">TRANSFERENCIA</span>
                  <span class="metodo-descripcion">Va directo al Banco, NO suma al chofer</span>
                </div>
              </label>
              
              <label class="metodo-opcion-grande pagado">
                <input type="radio" name="metodoPagoReal" value="pagado">
                <div class="metodo-contenido">
                  <span class="metodo-icono-grande">💰</span>
                  <span class="metodo-titulo">YA PAGADO / LOCAL</span>
                  <span class="metodo-descripcion">Monto $0 a cobrar</span>
                </div>
              </label>
              
              <label class="metodo-opcion-grande mixto">
                <input type="radio" name="metodoPagoReal" value="mixto">
                <div class="metodo-contenido">
                  <span class="metodo-icono-grande">🔀</span>
                  <span class="metodo-titulo">PAGO MIXTO</span>
                  <span class="metodo-descripcion">Combinación de métodos</span>
                </div>
              </label>
            </div>
            
            <div id="pagoMixtoDetalle" class="pago-mixto-detalle" style="display: none;">
              <h5>💰 Detalle del Pago Mixto</h5>
              <p class="mixto-instruccion">Distribuye el total de $${pedido.total?.toLocaleString() || '0'} entre los métodos usados:</p>
              <div class="mixto-item">
                <label>💵 Efectivo: $</label>
                <input type="number" id="montoEfectivo" min="0" value="0" step="1000">
              </div>
              <div class="mixto-item">
                <label>💳 Tarjeta: $</label>
                <input type="number" id="montoTarjeta" min="0" value="0" step="1000">
              </div>
              <div class="mixto-item">
                <label>🔄 Transferencia: $</label>
                <input type="number" id="montoTransferencia" min="0" value="0" step="1000">
              </div>
              <div class="mixto-total">
                <strong>Total: $<span id="totalMixto">0</span></strong>
                <span id="validacionMixto" class="validacion-mixto"></span>
              </div>
            </div>
            
            <div id="pagoLocalDetalle" class="pago-local-detalle" style="display: none; margin-top: 12px; padding: 12px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
              <h5 style="margin: 0 0 10px 0; color: #166534;">💰 ¿Cómo pagó en el local?</h5>
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600;">
                  <input type="radio" name="metodoLocalPago" value="efectivo" checked>
                  💵 Efectivo
                </label>
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600;">
                  <input type="radio" name="metodoLocalPago" value="tarjeta">
                  💳 Tarjeta
                </label>
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600;">
                  <input type="radio" name="metodoLocalPago" value="mixto">
                  🔀 Mixto
                </label>
              </div>
              <div id="pagoLocalMixtoDetalle" style="display: none; margin-top: 10px; padding: 10px; background: #fff; border-radius: 6px; border: 1px solid #d1fae5;">
                <p style="margin: 0 0 8px 0; font-size: 0.9rem; color: #374151;">Distribuye el total de $${pedido.total?.toLocaleString('es-CL') || '0'}:</p>
                <div class="mixto-item">
                  <label>💵 Efectivo local: $</label>
                  <input type="number" id="montoLocalEfectivo" min="0" value="0" step="1000">
                </div>
                <div class="mixto-item">
                  <label>💳 Tarjeta local: $</label>
                  <input type="number" id="montoLocalTarjeta" min="0" value="0" step="1000">
                </div>
                <div class="mixto-total">
                  <strong>Total: $<span id="totalLocalMixto">0</span></strong>
                  <span id="validacionLocalMixto" class="validacion-mixto"></span>
                </div>
              </div>
            </div>
            
            <div class="notas-pago">
              <label for="notasPago">📝 Observaciones (opcional):</label>
              <textarea id="notasPago" placeholder="Ej: Cliente pidió vuelto de $10.000, se le entregó factura, etc."></textarea>
            </div>
          </div>
        </div>
        
        <div class="modal-pago-footer">
          <button id="confirmarEntrega" class="btn-confirmar-grande">✅ CONFIRMAR ENTREGA</button>
          <button id="cancelarModalPago" class="btn-cancelar">❌ Cancelar</button>
        </div>
      </div>
    </div>
  `;

  // Agregar al DOM
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Event listeners
  setupModalPagoEvents(docId, pedido);
}

/**
 * Configura los eventos del modal de pago
 * @param {string} docId - ID del pedido
 * @param {object} pedido - Datos del pedido
 */
function setupModalPagoEvents(docId, pedido) {
  const modal = document.getElementById('modalPago');
  const radioButtons = document.querySelectorAll('input[name="metodoPagoReal"]');
  const pagoMixtoDetalle = document.getElementById('pagoMixtoDetalle');
  const pagoLocalDetalle = document.getElementById('pagoLocalDetalle');
  
  // Cerrar modal
  document.getElementById('cerrarModalPago').onclick = () => modal.remove();
  document.getElementById('cancelarModalPago').onclick = () => modal.remove();
  
  // Cambio de método de pago
  radioButtons.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'mixto') {
        pagoMixtoDetalle.style.display = 'block';
        pagoLocalDetalle.style.display = 'none';
        actualizarTotalMixto();
      } else if (radio.value === 'pagado') {
        pagoLocalDetalle.style.display = 'block';
        pagoMixtoDetalle.style.display = 'none';
      } else {
        pagoMixtoDetalle.style.display = 'none';
        pagoLocalDetalle.style.display = 'none';
      }
    });
  });

  // Toggle sub-panel mixto dentro de "pagado local"
  document.addEventListener('change', (e) => {
    if (e.target.name === 'metodoLocalPago') {
      const subPanel = document.getElementById('pagoLocalMixtoDetalle');
      if (subPanel) {
        subPanel.style.display = e.target.value === 'mixto' ? 'block' : 'none';
        if (e.target.value === 'mixto') actualizarTotalLocalMixto();
      }
    }
  });

  // Actualizar total en pago mixto local
  function actualizarTotalLocalMixto() {
    const ef = parseFloat(document.getElementById('montoLocalEfectivo')?.value) || 0;
    const tk = parseFloat(document.getElementById('montoLocalTarjeta')?.value) || 0;
    const total = ef + tk;
    const spanTotal = document.getElementById('totalLocalMixto');
    const spanVal = document.getElementById('validacionLocalMixto');
    const totalPedido = pedido.total || 0;
    if (spanTotal) spanTotal.textContent = total.toLocaleString('es-CL');
    if (spanVal) {
      const diff = Math.abs(total - totalPedido);
      if (diff < 1 && total > 0) {
        spanTotal.style.color = '#10b981';
        spanVal.textContent = '✅ Correcto';
        spanVal.style.color = '#10b981';
      } else if (total === 0) {
        spanTotal.style.color = '#6b7280';
        spanVal.textContent = '';
      } else {
        spanTotal.style.color = '#dc2626';
        spanVal.textContent = `❌ Falta $${(totalPedido - total).toLocaleString('es-CL')}`;
        spanVal.style.color = '#dc2626';
      }
    }
  }

  document.getElementById('montoLocalEfectivo')?.addEventListener('input', actualizarTotalLocalMixto);
  document.getElementById('montoLocalTarjeta')?.addEventListener('input', actualizarTotalLocalMixto);
  
  // Actualizar total en pago mixto
  function actualizarTotalMixto() {
    const efectivo = parseFloat(document.getElementById('montoEfectivo').value) || 0;
    const tarjeta = parseFloat(document.getElementById('montoTarjeta').value) || 0;
    const transferencia = parseFloat(document.getElementById('montoTransferencia').value) || 0;
    const total = efectivo + tarjeta + transferencia;
    const totalMixto = document.getElementById('totalMixto');
    const validacion = document.getElementById('validacionMixto');
    
    totalMixto.textContent = total.toLocaleString('es-CL');
    
    // Validar que coincida con el total del pedido
    const totalPedido = pedido.total || 0;
    const diferencia = Math.abs(total - totalPedido);
    
    if (diferencia < 1 && total > 0) {
      totalMixto.style.color = '#10b981';
      validacion.textContent = '✅ Correcto';
      validacion.style.color = '#10b981';
    } else if (total === 0) {
      totalMixto.style.color = '#6b7280';
      validacion.textContent = '';
    } else {
      totalMixto.style.color = '#dc2626';
      validacion.textContent = `❌ Falta $${(totalPedido - total).toLocaleString('es-CL')}`;
      validacion.style.color = '#dc2626';
    }
  }
  
  // Event listeners para inputs de pago mixto
  document.getElementById('montoEfectivo').oninput = actualizarTotalMixto;
  document.getElementById('montoTarjeta').oninput = actualizarTotalMixto;
  document.getElementById('montoTransferencia').oninput = actualizarTotalMixto;
  
  // Confirmar entrega
  document.getElementById('confirmarEntrega').onclick = () => confirmarEntregaPago(docId, pedido);
}

/**
 * Confirma la entrega y actualiza el método de pago
 * @param {string} docId - ID del pedido
 * @param {object} pedido - Datos del pedido original
 */
async function confirmarEntregaPago(docId, pedido) {
  const metodoPagoReal = document.querySelector('input[name="metodoPagoReal"]:checked').value;
  const notasPago = document.getElementById('notasPago').value;
  
  let updateData = {
    entregado: true,
    updated_at: new Date().toISOString()
  };
  
  let metodoPagoFinal = '';
  let notasFinales = notasPago;
  
  // Mapear el valor del modal a los códigos del sistema
  if (metodoPagoReal === 'mixto') {
    // Pago mixto
    const efectivo = parseFloat(document.getElementById('montoEfectivo').value) || 0;
    const tarjeta = parseFloat(document.getElementById('montoTarjeta').value) || 0;
    const transferencia = parseFloat(document.getElementById('montoTransferencia').value) || 0;
    const totalMixto = efectivo + tarjeta + transferencia;
    const totalPedido = pedido.total || 0;
    
    // Validar que el total coincida
    if (Math.abs(totalMixto - totalPedido) > 1) {
      alert(`⚠️ Error: El total del pago mixto ($${totalMixto.toLocaleString('es-CL')}) no coincide con el precio del pedido ($${totalPedido.toLocaleString('es-CL')})\n\nPor favor ajusta los montos antes de confirmar.`);
      return;
    }
    
    // Determinar el método principal (el que tiene mayor monto)
    if (efectivo >= tarjeta && efectivo >= transferencia) {
      metodoPagoFinal = 'E'; // Efectivo principal
    } else if (tarjeta >= transferencia) {
      metodoPagoFinal = 'DC'; // Tarjeta principal
    } else {
      metodoPagoFinal = 'TP'; // Transferencia principal
    }
    
    // Agregar detalle a las notas
    const detallesPago = [];
    if (efectivo > 0) detallesPago.push(`💵 Efectivo: $${efectivo.toLocaleString('es-CL')}`);
    if (tarjeta > 0) detallesPago.push(`💳 Tarjeta: $${tarjeta.toLocaleString('es-CL')}`);
    if (transferencia > 0) detallesPago.push(`🔄 Transferencia: $${transferencia.toLocaleString('es-CL')}`);
    
    notasFinales = `🔀 PAGO MIXTO: ${detallesPago.join(', ')}${notasPago ? ` | ${notasPago}` : ''}`;
    
  } else {
    // Pago simple
    switch(metodoPagoReal) {
      case 'efectivo':
        metodoPagoFinal = 'E'; // Efectivo - Suma a caja del chofer
        break;
      case 'tarjeta':
        metodoPagoFinal = 'DC'; // Débito/Crédito - Suma a caja del chofer
        break;
      case 'transferencia':
        metodoPagoFinal = 'TP'; // Transferencia Pendiente - NO suma a caja (va al banco)
        break;
      case 'pagado': {
        // Pagado en local — leer sub-método seleccionado
        const subMetodoLocal = document.querySelector('input[name="metodoLocalPago"]:checked')?.value || 'efectivo';
        if (subMetodoLocal === 'mixto') {
          const efLocal = parseFloat(document.getElementById('montoLocalEfectivo').value) || 0;
          const tkLocal = parseFloat(document.getElementById('montoLocalTarjeta').value) || 0;
          const totalPedido = pedido.total || 0;
          if (Math.abs((efLocal + tkLocal) - totalPedido) > 1) {
            alert(`⚠️ El total del pago mixto local ($${(efLocal + tkLocal).toLocaleString('es-CL')}) no coincide con el pedido ($${totalPedido.toLocaleString('es-CL')}). Ajusta los montos.`);
            return;
          }
          metodoPagoFinal = 'PX'; // Pagado Local - Mixto
          const detallesLocal = [];
          if (efLocal > 0) detallesLocal.push(`💵 Efectivo: $${efLocal.toLocaleString('es-CL')}`);
          if (tkLocal > 0) detallesLocal.push(`💳 Tarjeta: $${tkLocal.toLocaleString('es-CL')}`);
          notasFinales = `💰 PAGADO LOCAL MIXTO: ${detallesLocal.join(', ')}${notasPago ? ` | ${notasPago}` : ''}`;
        } else {
          metodoPagoFinal = subMetodoLocal === 'tarjeta' ? 'PC' : 'PE';
        }
        break;
      }
      default:
        metodoPagoFinal = 'E'; // Por defecto efectivo
    }
    
    // Agregar información sobre cambio de método si es diferente
    if (metodoPagoFinal !== pedido.metodo_pago) {
      const metodoOriginal = obtenerNombreMetodoPago(pedido.metodo_pago);
      const metodoReal = obtenerNombreMetodoPago(metodoPagoFinal);
      notasFinales += `${notasFinales ? ' | ' : ''}📝 Cambio: ${metodoOriginal} → ${metodoReal}`;
    }
  }
  
  updateData.metodo_pago = metodoPagoFinal;
  if (notasFinales) {
    updateData.notas = (pedido.notas ? pedido.notas + ' | ' : '') + notasFinales;
  }
  
  // Actualizar en la base de datos
  const { error } = await supabase_client.from('pedidos').update(updateData).eq('id', docId);
  
  if (error) {
    alert('Error al confirmar entrega: ' + error.message);
  } else {
    // ✅ STOCK YA SE DESCONTÓ AL MARCAR ITEMS EN "VER CARGA"
    // (La función descontarStockItem() se ejecuta desde agregarItemMarcado())
    
    document.getElementById('modalPago').remove();
    ErrorHandler.mostrarExito('✅ Pedido entregado y registrado correctamente');
    cargarPedidos();
  }
}

/**
 * Obtiene el nombre legible del método de pago
 * @param {string} codigo - Código del método de pago
 * @returns {string} Nombre del método
 */
function obtenerNombreMetodoPago(codigo) {
  const metodos = {
    'E': '💵 Efectivo',
    'DC': '💳 Tarjeta',
    'TP': '⏳ Transf. Pendiente',
    'TG': '✅ Transf. Pagada',
    'P': '💰 Pagado',
    'PE': '💵 Pagado Local - Efectivo',
    'PC': '💳 Pagado Local - Tarjeta',
    'PX': '🔀 Pagado Local - Mixto',
    'efectivo': '💵 Efectivo',
    'tarjeta': '💳 Tarjeta',
    'transferencia': '🔄 Transferencia',
    'mixto': '💰 Pago Mixto',
    'MIXTO': '💰 Pago Mixto'
  };
  return metodos[codigo] || 'Desconocido';
}

// ========================================
// SISTEMA DE REAGENDAR
// ========================================

/**
 * Reagenda un pedido para el siguiente día hábil
 * @param {string} docId - ID del pedido  
 * @param {string} fechaActual - Fecha actual del pedido
 */
async function reagendarPedido(docId, fechaActual){
  // MODO OFFLINE: Verificar conectividad primero
  if (!OfflineManager.estaOnline()) {
    const nuevaFecha = nextBusinessDayISO(fechaActual);
    OfflineManager.guardarEnCola('REAGENDAR', { id: docId, fecha: nuevaFecha });
    ErrorHandler.mostrarWarning(`📡 Sin conexión. El reagendamiento a ${nuevaFecha} se sincronizará automáticamente.`);
    
    // Actualizar UI optimistamente
    const card = document.querySelector(`[data-pedido-id="${docId}"]`);
    if (card) {
      const fechaElement = card.querySelector('.fecha-pedido') || card.querySelector('.info-item');
      if (fechaElement) {
        fechaElement.textContent = `📅 ${nuevaFecha}`;
        fechaElement.style.background = '#ff9800';
        fechaElement.style.color = 'white';
      }
    }
    
    return;
  }
  
  const nuevaFecha = nextBusinessDayISO(fechaActual);
  const { error } = await supabase_client.from('pedidos').update({ fecha: nuevaFecha }).eq('id', docId);
  if(error) {
    alert('⚠️ Error de conexión. No se pudo reagendar el pedido. Intenta de nuevo.\n\nDetalle: ' + error.message);
  } else { 
    ErrorHandler.mostrarExito('📅 Pedido reagendado para: ' + nuevaFecha);
    cargarPedidos();
  }
}

// ========================================

// Función para manejar transferencias pagadas
  
// Función para manejar transferencias pagadas (ya implementada más adelante)

// ========================================

// Eliminar pedido (solo pedidos no entregados)
async function eliminarPedido(docId){
  // Confirmación doble por seguridad
  if (!confirm('⚠️ ADVERTENCIA: ¿Estás seguro de que quieres ELIMINAR este pedido?\n\n⚠️ Esta acción NO se puede deshacer.\n\n✅ Solo eliminar si hay errores en el pedido.')) {
    return;
  }
  
  if (!confirm('⚠️ ÚLTIMA CONFIRMACIÓN: ¿Realmente quieres eliminar este pedido?\n\nEsta acción es PERMANENTE.')) {
    return;
  }

  try {
    // Obtener datos del pedido para verificar que no esté entregado
    const { data: pedido, error: errorFetch } = await supabase_client
      .from('pedidos')
      .select('*')
      .eq('id', docId)
      .single();
      
    if (errorFetch) {
      alert('Error al verificar pedido: ' + errorFetch.message);
      return;
    }
    
    // Seguridad: No permitir eliminar pedidos entregados
    if (pedido.entregado) {
      alert('❌ ERROR: No se puede eliminar un pedido que ya fue entregado.\n\nPor seguridad, solo se pueden eliminar pedidos pendientes.');
      return;
    }

    await devolverStockItemsMarcados(docId, pedido);
    
    // Eliminar pedido de Supabase
    const { error } = await supabase_client.from('pedidos').delete().eq('id', docId);
    
    if (error) {
      alert('Error al eliminar pedido: ' + error.message);
      return;
    }
    
    // Mostrar confirmación y recargar
    alert('✅ Pedido eliminado exitosamente.');
    cargarPedidos();
    
  } catch (error) {
    console.error('Error eliminando pedido:', error);
    alert('Error inesperado al eliminar pedido: ' + error.message);
  }
}

// Cambiar transferencia de pendiente a pagada
async function marcarTransferenciaPagada(docId) {
  if(!confirm('🔄 ¿Confirmar que la transferencia ya fue recibida?\n\n✅ El pedido se marcará como "Transferencia Pagada".')) return;
  
  try {
    const { error } = await supabase_client
      .from('pedidos')
      .update({ metodo_pago: 'TG' }) // TG = Transferencia Pagada
      .eq('id', docId);
    
    if (error) {
      alert('Error al actualizar transferencia: ' + error.message);
    } else {
      alert('✅ Transferencia marcada como pagada');
      cargarPedidos(); // Recargar para actualizar el resumen de caja
    }
  } catch (error) {
    console.error('Error actualizando transferencia:', error);
    alert('Error inesperado al actualizar transferencia: ' + error.message);
  }
}

/**
 * Marca la transferencia de un pago mixto como pagada
 * Cambia el texto en las notas de "Transferencia" a "Transferencia PAGADA"
 */
async function marcarPagoMixtoPagado(docId) {
  console.log('🔀 Marcando pago mixto como pagado:', docId);
  
  try {
    // Obtener el pedido actual
    const { data: pedido, error: errorFetch } = await supabase_client
      .from('pedidos')
      .select('*')
      .eq('id', docId)
      .single();
    
    if (errorFetch) {
      console.error('❌ Error al obtener pedido:', errorFetch);
      alert('Error al obtener datos del pedido: ' + errorFetch.message);
      return;
    }
    
    console.log('📦 Pedido actual:', pedido);
    
    // Actualizar notas para marcar transferencia como PAGADA
    let notasActualizadas = pedido.notas || '';
    notasActualizadas = notasActualizadas.replace('🔄 Transferencia:', '✅ Transferencia PAGADA:');
    
    // Si usa código PM, cambiar a PMP
    let nuevoMetodo = pedido.metodo_pago;
    if (nuevoMetodo === 'PM') {
      nuevoMetodo = 'PMP';
    }
    
    // Verificar conexión
    if (!OfflineManager.estaOnline()) {
      console.log('⚠️ Sin conexión - Guardando en cola offline');
      OfflineManager.guardarEnCola('PAGO_MIXTO_PAGADO', { 
        id: docId,
        notas: notasActualizadas,
        metodo_pago: nuevoMetodo
      });
      ErrorHandler.mostrarWarning('⚠️ Sin conexión. Se marcará cuando vuelva internet.');
      
      // Actualizar localmente en cache
      const pedidoIndex = datosLocal.findIndex(p => p.id === docId);
      if (pedidoIndex !== -1) {
        datosLocal[pedidoIndex].notas = notasActualizadas;
        datosLocal[pedidoIndex].metodo_pago = nuevoMetodo;
        renderizarPedidos(datosLocal);
        actualizarResumenCaja(datosLocal, filtroActual);
      }
      return;
    }
    
    const { data, error } = await supabase_client
      .from('pedidos')
      .update({ 
        notas: notasActualizadas,
        metodo_pago: nuevoMetodo
      })
      .eq('id', docId)
      .select();
    
    if (error) {
      console.error('❌ Error al actualizar:', error);
      alert('Error al actualizar pago mixto: ' + error.message);
    } else {
      console.log('✅ Pago mixto actualizado:', data);
      ErrorHandler.mostrarExito('✅ Transferencia confirmada - Pago Mixto completado');
      cargarPedidos(); // Recargar para actualizar el resumen de caja
    }
  } catch (error) {
    console.error('❌ Error inesperado:', error);
    alert('Error inesperado: ' + error.message);
  }
}

/**
 * Marca un pedido como pagado y permite cambiar el método de pago
 * @param {string} docId - ID del pedido
 * @param {string} metodoActual - Método de pago actual
 */
async function marcarComoPagado(docId, metodoActual) {
  // Obtener datos del pedido primero
  const { data: pedido, error: errorFetch } = await supabase_client
    .from('pedidos')
    .select('*')
    .eq('id', docId)
    .single();
  
  if (errorFetch) {
    alert('Error al cargar pedido: ' + errorFetch.message);
    return;
  }

  const metodoNombre = obtenerNombreMetodoPago(metodoActual);
  const opciones = [
    { valor: 'E', nombre: '💵 Efectivo' },
    { valor: 'DC', nombre: '💳 Tarjeta' },
    { valor: 'TG', nombre: '📱 Transferencia' }
  ];
  
  // Crear modal simple para seleccionar método de pago
  const modalHtml = `
    <div id="modalPagado" class="modal-pago-backdrop">
      <div class="modal-pago" style="max-width: 400px;">
        <div class="modal-pago-header">
          <h3>💰 Marcar como Pagado</h3>
          <button id="cerrarModalPagado" class="modal-close">✕</button>
        </div>
        
        <div class="modal-pago-body">
          <div class="pedido-info">
            <h4>📦 ${pedido.nombre || 'Sin nombre'}</h4>
            <p><strong>💵 Total:</strong> $${pedido.total?.toLocaleString() || '0'}</p>
            <p><strong>📅 Método Original:</strong> ${metodoNombre}</p>
          </div>
          
          <div class="pago-actual">
            <h4>💳 ¿Cómo pagó realmente?</h4>
            <div class="metodo-pago-opciones">
              ${opciones.map(opcion => `
                <label class="metodo-opcion">
                  <input type="radio" name="metodoPagoFinal" value="${opcion.valor}" ${opcion.valor === metodoActual ? 'checked' : ''}>
                  <span>${opcion.nombre}</span>
                </label>
              `).join('')}
            </div>
            
            <div class="notas-pago">
              <label for="notasPago">📝 Notas (opcional):</label>
              <textarea id="notasPago" placeholder="Ej: Cliente cambió de efectivo a tarjeta"></textarea>
            </div>
          </div>
        </div>
        
        <div class="modal-pago-footer">
          <button id="confirmarPagado" class="btn-entregar">✅ Marcar Pagado</button>
          <button id="cancelarPagado" class="btn-cancelar">❌ Cancelar</button>
        </div>
      </div>
    </div>
  `;

  // Agregar al DOM
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Event listeners
  document.getElementById('cerrarModalPagado').onclick = () => document.getElementById('modalPagado').remove();
  document.getElementById('cancelarPagado').onclick = () => document.getElementById('modalPagado').remove();
  
  document.getElementById('confirmarPagado').onclick = async () => {
    const metodoPagoFinal = document.querySelector('input[name="metodoPagoFinal"]:checked').value;
    const notas = document.getElementById('notasPago').value;
    
    let updateData = {
      metodo_pago: metodoPagoFinal,
      updated_at: new Date().toISOString()
    };
    
    // Agregar notas si cambió el método o hay notas adicionales
    if (metodoPagoFinal !== metodoActual || notas) {
      let notasFinales = '';
      
      if (metodoPagoFinal !== metodoActual) {
        const metodoOriginalNombre = obtenerNombreMetodoPago(metodoActual);
        const metodoFinalNombre = obtenerNombreMetodoPago(metodoPagoFinal);
        notasFinales += `💰 Cambio de pago: ${metodoOriginalNombre} → ${metodoFinalNombre}`;
      }
      
      if (notas) {
        notasFinales += (notasFinales ? ' | ' : '') + notas;
      }
      
      updateData.notas = (pedido.notas ? pedido.notas + ' | ' : '') + notasFinales;
    }
    
    // Actualizar en la base de datos
    const { error } = await supabase_client.from('pedidos').update(updateData).eq('id', docId);
    
    if (error) {
      alert('Error al marcar como pagado: ' + error.message);
    } else {
      document.getElementById('modalPagado').remove();
      alert('✅ Pedido marcado como pagado');
      cargarPedidos();
    }
  };
}

// Editar pedido existente
async function editarPedido(docId) {
  try {
    // Obtener datos del pedido actual
    const { data: pedido, error } = await supabase_client
      .from('pedidos')
      .select('*')
      .eq('id', docId)
      .single();
    
    if (error) {
      alert('Error al cargar pedido: ' + error.message);
      return;
    }
    
    if (!pedido) {
      alert('No se encontró el pedido');
      return;
    }
    
    // Precargar datos en el formulario
    const datosNotas = extraerTelefonoSecundarioDeNotas(pedido.notas);
    document.getElementById('nombre').value = pedido.nombre || '';
    document.getElementById('direccion').value = pedido.direccion || '';
    document.getElementById('telefono').value = pedido.telefono || '';
    document.getElementById('telefonoSecundario').value = datosNotas.telefonoSecundario || '';
    document.getElementById('metodoPago').value = pedido.metodo_pago || 'E';
    document.getElementById('fechaEntrega').value = pedido.fecha || '';
    document.getElementById('notas').value = datosNotas.notasLimpias || '';
    
    // Cargar productos
    lineasPedido = Array.isArray(pedido.items) ? [...pedido.items] : [];
    
    // Cargar datos de descuento si existen
    if (pedido.descuento && pedido.descuento > 0) {
      descuentoAplicado = pedido.descuento || 0;
      tipoDescuentoActual = pedido.tipo_descuento || 'ninguno';
      valorDescuentoActual = pedido.valor_descuento || 0;
      subtotalSinDescuento = pedido.subtotal_sin_descuento || 0;
      
      // Precargar campos del descuento
      const tipoDesc = document.getElementById('tipoDescuento');
      const valorDesc = document.getElementById('valorDescuento');
      if (tipoDesc) tipoDesc.value = tipoDescuentoActual;
      if (valorDesc) valorDesc.value = valorDescuentoActual;
      
      // Cambiar label según tipo
      cambiarTipoDescuento();
    }
    
    renderLineasPedido();
    
    // Cambiar el botón para modo edición
    const btnAgregar = document.getElementById('btnAgregar');
    if (btnAgregar) {
      btnAgregar.textContent = '✏️ Actualizar Pedido';
      btnAgregar.onclick = () => actualizarPedido(docId);
    }
    
    // Cambiar título del modal
    const modalTitle = document.querySelector('#formModal h3');
    if (modalTitle) {
      modalTitle.textContent = '✏️ Editando Pedido';
    }
    
    // Mostrar el modal
    getElement('formModalBackdrop').style.display = 'flex';
    
  } catch (error) {
    console.error('Error cargando pedido para editar:', error);
    alert('Error inesperado al cargar pedido: ' + error.message);
  }
}

// Actualizar pedido existente
async function actualizarPedido(docId) {
  try {
    // Validar campos obligatorios
    const direccion = document.getElementById('direccion').value.trim();
    const telefono = document.getElementById('telefono').value.trim();
    const telefonoSecundario = document.getElementById('telefonoSecundario').value.trim();
    
    if (!direccion) {
      alert('La dirección es obligatoria');
      return;
    }
    
    if (!telefono) {
      alert('El teléfono es obligatorio');
      return;
    }

    const validacionTelefonoSecundario = validarTelefonoOpcional(telefonoSecundario);
    if (!validacionTelefonoSecundario.valido) {
      alert(validacionTelefonoSecundario.error);
      return;
    }
    
    if (lineasPedido.length === 0) {
      alert('Debe agregar al menos un producto');
      return;
    }
    
    // Preparar datos actualizados
    const pedidoActualizado = {
      nombre: document.getElementById('nombre').value.trim() || null,
      direccion: direccion,
      telefono: telefono,
      metodo_pago: document.getElementById('metodoPago').value,
      fecha: document.getElementById('fechaEntrega').value,
      items: lineasPedido.map(item => ({
        producto_id: item.producto_id || null, // ⚡ INCLUIR para descuento de stock
        nombre: item.nombre,
        cantidad: item.cantidad,
        precio: item.precio
      })),
      total: Math.max(0, subtotalSinDescuento - descuentoAplicado), // Total con descuento
      notas: combinarNotasConTelefonoSecundario(document.getElementById('notas').value.trim(), validacionTelefonoSecundario.valor),
      updated_at: new Date().toISOString()
    };
    
    // Agregar información de descuento si se aplicó
    if (descuentoAplicado > 0) {
      pedidoActualizado.descuento = descuentoAplicado;
      pedidoActualizado.tipo_descuento = tipoDescuentoActual;
      pedidoActualizado.valor_descuento = valorDescuentoActual;
      pedidoActualizado.subtotal_sin_descuento = subtotalSinDescuento;
    } else {
      // Si no hay descuento, limpiar campos en la BD
      pedidoActualizado.descuento = null;
      pedidoActualizado.tipo_descuento = null;
      pedidoActualizado.valor_descuento = null;
      pedidoActualizado.subtotal_sin_descuento = null;
    }
    
    // Actualizar en Supabase
    const btnActualizar = document.getElementById('btnAgregar');
    btnActualizar.textContent = 'Actualizando...';
    btnActualizar.disabled = true;
    
    const { error } = await supabase_client
      .from('pedidos')
      .update(pedidoActualizado)
      .eq('id', docId);
    
    if (error) {
      // Manejar errores específicos de manera más clara
      let mensajeError;
      if (error.message && error.message.includes('nota')) {
        mensajeError = '📝 Por favor agrega una nota o detalle en el campo "Detalle/cantidad" para poder actualizar el pedido.';
      } else if (error.message && error.message.includes('constraint')) {
        mensajeError = '⚠️ Error de validación: Revisa que todos los campos obligatorios estén completos.';
      } else if (error.message && error.message.includes('not-null')) {
        mensajeError = '⚠️ Faltan datos obligatorios. Por favor completa todos los campos requeridos.';
      } else {
        mensajeError = `❌ Error al actualizar pedido: ${error.message}`;
      }
      alert(mensajeError);
    } else {
      // Limpiar formulario y cerrar modal
      clearForm('formAgregar');
      lineasPedido = [];
      
      // Resetear descuentos
      descuentoAplicado = 0;
      tipoDescuentoActual = 'ninguno';
      valorDescuentoActual = 0;
      subtotalSinDescuento = 0;
      
      renderLineasPedido();
      getElement('formModalBackdrop').style.display = 'none';
      
      // Recargar pedidos
      cargarPedidos();
      
      // Restaurar botón a modo agregar
      restaurarModoAgregar();
    }
    
  } catch (error) {
    console.error('Error actualizando pedido:', error);
    alert('Error inesperado al actualizar pedido: ' + error.message);
  } finally {
    // Restaurar botón
    const btnActualizar = document.getElementById('btnAgregar');
    if (btnActualizar) {
      btnActualizar.disabled = false;
    }
  }
}

// Restaurar formulario al modo "agregar"
function restaurarModoAgregar() {
  const btnAgregar = document.getElementById('btnAgregar');
  if (btnAgregar) {
    btnAgregar.textContent = 'Agregar Pedido';
    btnAgregar.onclick = guardarPedido;
  }
  
  const modalTitle = document.querySelector('#formModal h3');
  if (modalTitle) {
    modalTitle.textContent = 'Agregar / Nuevo Pedido';
  }
}

// Mostrar historial de cliente
async function mostrarHistorialCliente(telefono, nombreCliente) {
  if (!telefono || telefono === '(sin teléfono)') {
    alert('No se puede mostrar el historial: el cliente no tiene número de teléfono registrado.');
    return;
  }
  
  // Buscar todos los pedidos del mismo teléfono
  const { data, error } = await supabase_client
    .from('pedidos')
    .select('*')
    .eq('telefono', telefono)
    .order('created_at', { ascending: false });
  
  if (error) {
    alert('Error al cargar historial: ' + error.message);
    return;
  }
  
  if (!data || data.length === 0) {
    alert('No se encontraron pedidos anteriores para este cliente.');
    return;
  }
  
  // Crear el contenido del modal
  let historialHTML = `
    <div class="hist-entry" style="background: #f0f9ff; border-left: 4px solid #0369a1;">
      <h3 style="margin: 0 0 8px 0; color: #0369a1;">📚 Historial de ${nombreCliente || 'Cliente'}</h3>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">📞 ${telefono} • Total de pedidos: ${data.length}</p>
    </div>
  `;
  
  // Agrupar productos más pedidos
  const productosCount = {};
  
  data.forEach((pedido, index) => {
    const fechaFormateada = new Date(pedido.created_at).toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Contar productos
    if (pedido.items && Array.isArray(pedido.items)) {
      pedido.items.forEach(item => {
        productosCount[item.nombre] = (productosCount[item.nombre] || 0) + item.cantidad;
      });
    }
    
    const itemsTexto = pedido.items && pedido.items.length > 0 
      ? pedido.items.map(item => `${item.cantidad}x ${item.nombre}`).join(', ')
      : '(sin productos)';
    
    const estadoIcon = pedido.entregado ? '✅' : '📦';
    const totalFormateado = pedido.total ? `$${pedido.total.toLocaleString('es-CL')}` : '$0';
    
    historialHTML += `
      <div class="hist-entry">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
          <strong style="color: #374151;">Pedido #${index + 1} ${estadoIcon}</strong>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span style="color: #16a34a; font-weight: 700;">${totalFormateado}</span>
            <button class="btn-repetir-pedido" data-pedido-index="${index}" style="background: #667eea; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: 600;">🔄 Repetir</button>
          </div>
        </div>
        <div class="hist-items" style="color: #6b7280; font-size: 14px; margin-bottom: 6px;">
          🛒 ${itemsTexto}
        </div>
        <div class="hist-meta">
          📅 ${fechaFormateada} • 📍 ${pedido.direccion || '(sin dirección)'}
          ${pedido.notas ? `<br>💬 ${pedido.notas}` : ''}
        </div>
      </div>
    `;
  });
  
  // Mostrar productos más pedidos
  const productosOrdenados = Object.entries(productosCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5);
  
  if (productosOrdenados.length > 0) {
    historialHTML += `
      <div class="hist-entry" style="background: #f9fafb; border-left: 4px solid #16a34a;">
        <h4 style="margin: 0 0 8px 0; color: #16a34a;">🏆 Productos Favoritos</h4>
        ${productosOrdenados.map(([producto, cantidad]) => 
          `<div style="font-size: 14px; color: #374151;">• ${producto} (${cantidad} veces)</div>`
        ).join('')}
      </div>
    `;
  }
  
  // Mostrar el modal
  const modalBody = getElement('histModalBody');
  if (modalBody) {
    modalBody.innerHTML = historialHTML;
    getElement('histModal').classList.add('show');
    
    // MEJORA 3: Event listeners para botones "Repetir"
    const botonesRepetir = modalBody.querySelectorAll('.btn-repetir-pedido');
    botonesRepetir.forEach(btn => {
      btn.onclick = () => {
        const index = parseInt(btn.dataset.pedidoIndex);
        const pedidoOriginal = data[index];
        repetirPedido(pedidoOriginal);
      };
    });
  }
}

// Helpers
function generarId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function setFechaHoyDefault(){
  const inp = getFechaEntregaElement();
  if (!inp) return;
  
  let fechaEntrega = new Date();
  inp.value = formatDateISO(fechaEntrega);
}
setFechaHoyDefault();

function nextBusinessDayISO(isoDate){
  let dt = isoDate ? new Date(isoDate + 'T00:00:00') : new Date();
  dt.setDate(dt.getDate() + 1); // Avanzar al siguiente día
  
  return formatDateISO(dt);
}

// Validar fecha de entrega
function validarFechaEntrega() {
  const inp = getFechaEntregaElement();
  if (!inp || !inp.value) return;
  
  // Ya no validamos domingos - permitir cualquier día
  return;
}

// Renderiza la lista de productos y el total
function renderLineasPedido() {
  const cont = document.getElementById('lineasPedidoContainer');
  if (!cont) return;
  cont.innerHTML = '';
  let total = 0;
  lineasPedido.forEach((p, idx) => {
    // Detectar si es producto granel
    const esGranel = p.nombre && p.nombre.toLowerCase().includes('(granel)');
    
    // Para granel: cantidad YA ES el total (monto en pesos)
    // Para catálogo: cantidad * precio
    const subtotal = esGranel ? p.cantidad : (p.cantidad * p.precio);
    total += subtotal;
    
    const div = document.createElement('div');
    div.className = 'flex-between flex-gap-8';
    div.style.padding = '4px 0';
    
    // Para granel: solo mostrar el monto total
    // Para catálogo: mostrar cantidad, precio unitario y subtotal
    if (esGranel) {
      div.innerHTML = `
        <span class="item-name">${p.nombre}</span>
        <span class="item-quantity" style="color:#16a34a;font-weight:600;">$${p.cantidad.toLocaleString('es-CL')}</span>
        <button type="button" class="remove-item-btn" data-idx="${idx}">✕</button>
      `;
    } else {
      div.innerHTML = `
        <span class="item-name">${p.nombre}</span>
        <span class="item-quantity">x${p.cantidad}</span>
        <span class="item-price">$${p.precio.toLocaleString('es-CL')}</span>
        <span class="item-subtotal">Subtotal: $${subtotal.toLocaleString('es-CL')}</span>
        <button type="button" class="remove-item-btn" data-idx="${idx}">✕</button>
      `;
    }
    
    div.querySelector('button').onclick = () => {
      lineasPedido.splice(idx, 1);
      renderLineasPedido();
    };
    cont.appendChild(div);
  });
  
  // Actualizar subtotal sin descuento
  subtotalSinDescuento = total;
  
  // Mostrar/ocultar sección de descuento
  const seccionDescuento = document.getElementById('seccionDescuento');
  if (seccionDescuento) {
    seccionDescuento.style.display = lineasPedido.length > 0 ? 'block' : 'none';
  }
  
  // Recalcular descuento si hay uno activo
  if (tipoDescuentoActual !== 'ninguno' && valorDescuentoActual > 0) {
    aplicarDescuentoPedido();
  } else {
    // Sin descuento: mostrar solo total
    const subtotalDiv = document.getElementById('pedidoSubtotalDisplay');
    const totalDiv = document.getElementById('pedidoTotalDisplay');
    if (subtotalDiv) subtotalDiv.style.display = 'none';
    if (totalDiv) totalDiv.textContent = 'Total: $' + total.toLocaleString('es-CL');
  }
}

// ==================================================
// SISTEMA DE DESCUENTOS PARA PEDIDOS
// ==================================================

/**
 * Aplicar descuento al pedido actual
 */
function aplicarDescuentoPedido() {
  const tipoSelect = document.getElementById('tipoDescuento');
  const valorInput = document.getElementById('valorDescuento');
  const tipo = tipoSelect.value;
  const valor = parseFloat(valorInput.value) || 0;
  
  if (valor <= 0) {
    ErrorHandler.mostrarWarning('⚠️ Ingresa un valor de descuento mayor a 0');
    return;
  }
  
  if (subtotalSinDescuento === 0) {
    ErrorHandler.mostrarWarning('⚠️ Agrega productos antes de aplicar descuento');
    return;
  }
  
  // Calcular descuento según tipo
  if (tipo === 'porcentaje') {
    if (valor > 100) {
      ErrorHandler.mostrarWarning('⚠️ El porcentaje debe ser entre 0 y 100');
      return;
    }
    descuentoAplicado = Math.round((subtotalSinDescuento * valor) / 100);
    tipoDescuentoActual = 'porcentaje';
    valorDescuentoActual = valor;
  } else if (tipo === 'monto') {
    if (valor > subtotalSinDescuento) {
      ErrorHandler.mostrarWarning('⚠️ El descuento no puede ser mayor al subtotal');
      return;
    }
    descuentoAplicado = valor;
    tipoDescuentoActual = 'monto';
    valorDescuentoActual = valor;
  }
  
  // Calcular total con descuento
  const totalConDescuento = Math.max(0, subtotalSinDescuento - descuentoAplicado);
  
  // Actualizar UI
  const subtotalDiv = document.getElementById('pedidoSubtotalDisplay');
  const totalDiv = document.getElementById('pedidoTotalDisplay');
  const descuentoInfo = document.getElementById('descuentoAplicadoInfo');
  const textoDescuento = document.getElementById('textoDescuentoAplicado');
  const montoDescuento = document.getElementById('montoDescuentoAplicado');
  const btnQuitar = document.getElementById('btnQuitarDescuento');
  
  if (subtotalDiv) {
    subtotalDiv.style.display = 'block';
    subtotalDiv.textContent = 'Subtotal: $' + subtotalSinDescuento.toLocaleString('es-CL');
  }
  
  if (descuentoInfo && textoDescuento && montoDescuento) {
    descuentoInfo.style.display = 'block';
    if (tipo === 'porcentaje') {
      textoDescuento.textContent = `Porcentaje de ${valor}%`;
    } else {
      textoDescuento.textContent = `Monto fijo de $${valor.toLocaleString('es-CL')}`;
    }
    montoDescuento.textContent = '-$' + descuentoAplicado.toLocaleString('es-CL');
  }
  
  if (totalDiv) {
    totalDiv.textContent = 'TOTAL: $' + totalConDescuento.toLocaleString('es-CL');
  }
  
  if (btnQuitar) {
    btnQuitar.style.display = 'block';
  }
  
  ErrorHandler.mostrarExito(`✅ Descuento de $${descuentoAplicado.toLocaleString('es-CL')} aplicado`);
}

/**
 * Quitar descuento del pedido
 */
function quitarDescuentoPedido() {
  descuentoAplicado = 0;
  tipoDescuentoActual = 'ninguno';
  valorDescuentoActual = 0;
  
  // Limpiar campos
  const valorInput = document.getElementById('valorDescuento');
  if (valorInput) valorInput.value = '';
  
  // Ocultar elementos de descuento
  const descuentoInfo = document.getElementById('descuentoAplicadoInfo');
  const btnQuitar = document.getElementById('btnQuitarDescuento');
  const subtotalDiv = document.getElementById('pedidoSubtotalDisplay');
  
  if (descuentoInfo) descuentoInfo.style.display = 'none';
  if (btnQuitar) btnQuitar.style.display = 'none';
  if (subtotalDiv) subtotalDiv.style.display = 'none';
  
  // Actualizar total
  const totalDiv = document.getElementById('pedidoTotalDisplay');
  if (totalDiv) {
    totalDiv.textContent = 'Total: $' + subtotalSinDescuento.toLocaleString('es-CL');
  }
  
  ErrorHandler.mostrarInfo('Descuento eliminado');
}

/**
 * Cambiar label según tipo de descuento
 */
function cambiarTipoDescuento() {
  const tipoSelect = document.getElementById('tipoDescuento');
  const label = document.getElementById('labelValorDescuento');
  const valorInput = document.getElementById('valorDescuento');
  
  if (!tipoSelect || !label || !valorInput) return;
  
  if (tipoSelect.value === 'porcentaje') {
    label.textContent = 'Porcentaje (%):';
    valorInput.placeholder = 'Ej: 10';
    valorInput.max = '100';
    valorInput.step = '1';
  } else {
    label.textContent = 'Descuento ($):';
    valorInput.placeholder = '0';
    valorInput.max = '';
    valorInput.step = '100';
  }
  
  // Limpiar valor al cambiar tipo
  valorInput.value = '';
}

// ==================================================
// SISTEMA DE INTEGRACIÓN CON CATÁLOGO DE PRODUCTOS
// ==================================================

// Variables para catálogos separados
let catalogoProductos = []; // Productos por sacos (NO granel)
let catalogoGranel = []; // Productos a granel
let productoSeleccionado = null; // Producto de catálogo seleccionado
let productoGranelSeleccionado = null; // Producto granel seleccionado

async function cargarProductosCatalogoPaginados(construirQuery, pageSize = 1000) {
  const registros = [];
  let offset = 0;

  while (true) {
    const { data, error } = await construirQuery(offset, pageSize);
    if (error) throw error;

    const lote = data || [];
    registros.push(...lote);

    if (lote.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return registros;
}

/**
 * Cargar catálogo de productos desde Supabase
 * Excluye productos de tipo "granel" para mostrar solo productos empacados (sacos)
 */
async function cargarCatalogoProductos(mostrarMensaje = false) {
  try {
    if (mostrarMensaje) {
      console.log('🔄 Recargando catálogo de productos...');
    }
    
    const data = await cargarProductosCatalogoPaginados((offset, pageSize) => {
      return supabase_client
        .from('productos')
        .select('id, nombre, categoria, marca, stock, stock_minimo_sacos, precio, tipo')
        .order('nombre', { ascending: true })
        .range(offset, offset + pageSize - 1);
    });
    
    // Filtrar también por nombre (por si acaso no tienen el campo tipo)
    productosDisponibles = (data || []).filter(p => {
      const nombre = String(p?.nombre || '').toLowerCase();
      const tipo = String(p?.tipo || '').toLowerCase();
      return tipo !== 'granel' && !nombre.includes('(granel)');
    });
    
    // Actualizar timestamp
    ultimaActualizacionCatalogo = new Date();
    
    console.log(`📦 ${productosDisponibles.length} productos cargados del catálogo`);
    actualizarIndicadorActualizacion();
    
    if (mostrarMensaje) {
      mostrarNotificacionTemporal('✅ Catálogo actualizado');
    }
    
  } catch (error) {
    console.error('Error cargando catálogo de productos:', error);
    ErrorHandler.mostrarError('No se pudo cargar el catálogo de productos');
  }
}

/**
 * Recargar catálogo manualmente (botón)
 */
async function recargarCatalogoManual() {
  await cargarCatalogoProductos(true);
}

/**
 * Cargar catálogo de productos GRANEL desde Supabase
 * SOLO productos de tipo "granel"
 */
async function cargarCatalogoGranel(mostrarMensaje = false) {
  try {
    if (mostrarMensaje) {
      console.log('🔄 Recargando catálogo de productos a granel...');
    }
    
    const data = await cargarProductosCatalogoPaginados((offset, pageSize) => {
      return supabase_client
        .from('productos')
        .select('id, nombre, categoria, marca, stock, stock_minimo_sacos, precio, tipo')
        .eq('tipo', 'granel')
        .order('nombre', { ascending: true })
        .range(offset, offset + pageSize - 1);
    });
    
    catalogoGranel = data || [];
    
    console.log(`⚖️ ${catalogoGranel.length} productos granel cargados`);
    actualizarIndicadorActualizacionGranel();
    
    if (mostrarMensaje) {
      mostrarNotificacionTemporal('✅ Catálogo granel actualizado');
    }
    
  } catch (error) {
    console.error('Error cargando catálogo granel:', error);
    ErrorHandler.mostrarError('No se pudo cargar el catálogo de productos granel');
  }
}

/**
 * Recargar catálogo granel manualmente (botón)
 */
async function recargarCatalogoGranel() {
  await cargarCatalogoGranel(true);
}

/**
 * Actualizar indicador visual de última actualización granel
 */
function actualizarIndicadorActualizacionGranel() {
  const indicador = document.getElementById('indicadorActualizacionGranel');
  if (!indicador) return;
  
  indicador.textContent = 'Actualizado ahora';
}

/**
 * Actualizar stock local en memoria (sin consultar BD)
 * @param {number} productoId - ID del producto
 * @param {number} cantidadCambio - Cantidad a sumar/restar (negativo para descuento)
 */
function actualizarStockLocal(productoId, cantidadCambio) {
  const producto = productosDisponibles.find(p => p.id === productoId);
  if (producto) {
    const stockAnterior = producto.stock;
    producto.stock = Math.max(0, producto.stock + cantidadCambio);
    console.log(`🔄 Stock local actualizado: ${producto.nombre} (${stockAnterior} → ${producto.stock})`);
    
    // Si hay búsqueda activa, refrescar resultados
    const searchInput = document.getElementById('searchProductInput');
    if (searchInput && searchInput.value.trim()) {
      filtrarProductos(searchInput.value);
    }
  }
}

/**
 * Actualizar indicador visual de última actualización
 */
function actualizarIndicadorActualizacion() {
  const indicador = document.getElementById('indicadorActualizacion');
  if (!indicador || !ultimaActualizacionCatalogo) return;
  
  const ahora = new Date();
  const diffMs = ahora - ultimaActualizacionCatalogo;
  const diffMin = Math.floor(diffMs / 60000);
  
  let texto = '';
  if (diffMin < 1) {
    texto = 'Actualizado hace menos de 1 min';
  } else if (diffMin === 1) {
    texto = 'Actualizado hace 1 min';
  } else {
    texto = `Actualizado hace ${diffMin} min`;
  }
  
  indicador.textContent = texto;
}

/**
 * Mostrar notificación temporal (toast)
 */
function mostrarNotificacionTemporal(mensaje, duracion = 2000) {
  // Crear elemento si no existe
  let toast = document.getElementById('toastNotificacion');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastNotificacion';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-weight: 500;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(toast);
  }
  
  toast.textContent = mensaje;
  toast.style.opacity = '1';
  
  setTimeout(() => {
    toast.style.opacity = '0';
  }, duracion);
}

/**
 * Filtrar y mostrar resultados de búsqueda de productos
 */
function filtrarProductos(query) {
  const resultsContainer = document.getElementById('productSearchResults');
  if (!resultsContainer) return;
  
  // Limpiar resultados
  resultsContainer.innerHTML = '';
  
  // Si no hay query, ocultar resultados
  if (!query || query.trim().length < 2) {
    resultsContainer.style.display = 'none';
    return;
  }
  
  // Filtrar productos
  const queryLower = query.toLowerCase();
  const productosFiltrados = productosDisponibles.filter(producto => {
    return (
      producto.nombre.toLowerCase().includes(queryLower) ||
      (producto.marca && producto.marca.toLowerCase().includes(queryLower)) ||
      (producto.categoria && producto.categoria.toLowerCase().includes(queryLower))
    );
  });
  
  // Mostrar resultados
  if (productosFiltrados.length === 0) {
    resultsContainer.innerHTML = `
      <div class="search-empty-state">
        <div class="search-empty-state-icon">🔍</div>
        <div class="search-empty-state-title">No se encontraron productos</div>
        <div class="search-empty-state-text">Intenta con otro término de búsqueda</div>
      </div>
    `;
    resultsContainer.style.display = 'block';
    return;
  }
  
  // Generar tarjetas de productos
  resultsContainer.innerHTML = productosFiltrados.map(producto => {
    const stock = Math.floor(producto.stock || 0);
    const stockMinimo = producto.stock_minimo_sacos || 0;
    
    // Determinar clase de stock
    let stockClass = 'stock-ok';
    let stockText = `${stock} unid.`;
    
    if (stock === 0) {
      stockClass = 'stock-out';
      stockText = 'Sin stock';
    } else if (stock <= stockMinimo) {
      stockClass = 'stock-low';
      stockText = `⚠️ ${stock} unid.`;
    } else {
      stockText = `✅ ${stock} unid.`;
    }
    
    return `
      <div class="product-result-card" data-producto-id="${producto.id}" onclick="seleccionarProducto(${producto.id})">
        <div class="product-result-info">
          <div class="product-result-name">${producto.nombre}</div>
          <div class="product-result-meta">
            ${producto.categoria ? `<span class="product-result-category">${producto.categoria}</span>` : ''}
            <span class="product-result-price">$${formatoMoneda(producto.precio || 0)}</span>
          </div>
        </div>
        <span class="product-result-stock ${stockClass}">${stockText}</span>
      </div>
    `;
  }).join('');
  
  resultsContainer.style.display = 'block';
}

/**
 * Seleccionar un producto del buscador
 */
function seleccionarProducto(productoId) {
  const producto = productosDisponibles.find(p => p.id === productoId);
  if (!producto) return;
  
  // Guardar producto seleccionado
  productoSeleccionado = producto;
  
  // Ocultar resultados de búsqueda
  const resultsContainer = document.getElementById('productSearchResults');
  if (resultsContainer) {
    resultsContainer.style.display = 'none';
  }
  
  // Limpiar input de búsqueda
  const searchInput = document.getElementById('searchProductInput');
  if (searchInput) {
    searchInput.value = '';
  }
  
  // Ocultar botón limpiar búsqueda
  const btnClear = document.getElementById('btnClearSearchProduct');
  if (btnClear) {
    btnClear.style.display = 'none';
  }
  
  // Mostrar tarjeta de producto seleccionado
  mostrarProductoSeleccionado(producto);
  
  // Enfocar campo de cantidad
  const inputCantidad = document.getElementById('itemCantidad');
  if (inputCantidad) {
    inputCantidad.focus();
    inputCantidad.select();
  }
}

/**
 * Mostrar tarjeta del producto seleccionado
 */
function mostrarProductoSeleccionado(producto) {
  const card = document.getElementById('selectedProductCard');
  if (!card) return;
  
  const stock = Math.floor(producto.stock || 0);
  const stockMinimo = producto.stock_minimo_sacos || 0;
  
  let stockText = '';
  if (stock === 0) {
    stockText = '⚠️ Sin stock';
  } else if (stock <= stockMinimo) {
    stockText = `⚠️ Stock: ${stock}`;
  } else {
    stockText = `✅ Stock: ${stock}`;
  }
  
  card.querySelector('.selected-product-name').textContent = producto.nombre;
  card.querySelector('.selected-product-price').textContent = `$${formatoMoneda(producto.precio || 0)}`;
  card.querySelector('.selected-product-stock').textContent = stockText;
  
  card.style.display = 'flex';
}

/**
 * Limpiar selección de producto
 */
function limpiarSeleccionProducto() {
  productoSeleccionado = null;
  
  const card = document.getElementById('selectedProductCard');
  if (card) {
    card.style.display = 'none';
  }
  
  // Enfocar input de búsqueda
  const searchInput = document.getElementById('searchProductInput');
  if (searchInput) {
    searchInput.focus();
  }
}

/**
 * Filtrar productos GRANEL por búsqueda
 */
function filtrarProductosGranel(query) {
  const resultsContainer = document.getElementById('productSearchResultsGranel');
  if (!resultsContainer) return;
  
  if (!query || query.length < 2) {
    resultsContainer.style.display = 'none';
    return;
  }
  
  const queryLower = query.toLowerCase();
  const resultados = catalogoGranel.filter(p => {
    const nombre = (p.nombre || '').toLowerCase();
    const categoria = (p.categoria || '').toLowerCase();
    const marca = (p.marca || '').toLowerCase();
    
    return nombre.includes(queryLower) || 
           categoria.includes(queryLower) || 
           marca.includes(queryLower);
  });
  
  if (resultados.length === 0) {
    resultsContainer.innerHTML = '<div class="no-results">No se encontraron productos</div>';
    resultsContainer.style.display = 'block';
    return;
  }
  
  // Renderizar tarjetas de resultados
  resultsContainer.innerHTML = resultados.map(p => {
    const stock = Math.floor(p.stock || 0);
    const stockMinimo = p.stock_minimo_sacos || 0;
    
    let badgeClass = 'badge-success';
    let stockText = `Stock: ${stock}`;
    
    if (stock === 0) {
      badgeClass = 'badge-danger';
      stockText = 'Sin stock';
    } else if (stock <= stockMinimo) {
      badgeClass = 'badge-warning';
      stockText = `Stock: ${stock} ⚠️`;
    }
    
    return `
      <div class="product-result-card" data-producto-id="${p.id}" onclick="seleccionarProductoGranel(${p.id})">
        <div class="product-result-info">
          <div class="product-result-name">${p.nombre}</div>
          <div class="product-result-meta">
            ${p.categoria ? `<span class="text-muted">${p.categoria}</span>` : ''}
            ${p.marca ? `<span class="text-muted">• ${p.marca}</span>` : ''}
          </div>
        </div>
        <div class="product-result-actions">
          <span class="badge ${badgeClass}">${stockText}</span>
          <div class="product-result-price">$${formatoMoneda(p.precio || 0)}/kg</div>
        </div>
      </div>
    `;
  }).join('');
  
  resultsContainer.style.display = 'block';
}

/**
 * Seleccionar producto GRANEL
 */
function seleccionarProductoGranel(productoId) {
  const producto = catalogoGranel.find(p => p.id === productoId);
  if (!producto) return;
  
  productoGranelSeleccionado = producto;
  
  // Ocultar resultados
  const resultsContainer = document.getElementById('productSearchResultsGranel');
  if (resultsContainer) {
    resultsContainer.style.display = 'none';
  }
  
  // Limpiar búsqueda
  const searchInput = document.getElementById('searchProductInputGranel');
  if (searchInput) {
    searchInput.value = '';
  }
  
  // Ocultar botón limpiar búsqueda
  const btnClear = document.getElementById('btnClearSearchProductGranel');
  if (btnClear) {
    btnClear.style.display = 'none';
  }
  
  // Mostrar tarjeta de producto seleccionado
  mostrarProductoGranelSeleccionado(producto);
  
  // Enfocar campo de monto
  const inputCantidad = document.getElementById('itemCantidad');
  if (inputCantidad) {
    inputCantidad.focus();
    inputCantidad.select();
  }
}

/**
 * Mostrar tarjeta del producto granel seleccionado
 */
function mostrarProductoGranelSeleccionado(producto) {
  const card = document.getElementById('selectedProductCardGranel');
  if (!card) return;
  
  const stock = Math.floor(producto.stock || 0);
  
  let stockText = '';
  if (stock === 0) {
    stockText = '⚠️ Sin stock';
  } else {
    stockText = `✅ Stock: ${stock} kg`;
  }
  
  card.querySelector('.selected-product-name').textContent = producto.nombre;
  card.querySelector('.selected-product-price').textContent = `$${formatoMoneda(producto.precio || 0)}/kg`;
  card.querySelector('.selected-product-stock').textContent = stockText;
  
  card.style.display = 'flex';
}

/**
 * Limpiar selección de producto granel
 */
function limpiarSeleccionProductoGranel() {
  productoGranelSeleccionado = null;
  
  const card = document.getElementById('selectedProductCardGranel');
  if (card) {
    card.style.display = 'none';
  }
  
  // Enfocar input de búsqueda
  const searchInput = document.getElementById('searchProductInputGranel');
  if (searchInput) {
    searchInput.focus();
  }
}

/**
 * Configurar event listeners para cambiar entre tipo de producto y buscador
 */
function configurarSelectoresTipoProducto() {
  const radioCatalogo = document.getElementById('radioProductoCatalogo');
  const radioGranel = document.getElementById('radioProductoGranel');
  const containerCatalogo = document.getElementById('containerProductoCatalogo');
  const containerGranel = document.getElementById('containerProductoGranel');
  const labelCantidad = document.getElementById('labelCantidad');
  const inputCantidad = document.getElementById('itemCantidad');
  
  // BUSCADOR DE CATÁLOGO (SACOS)
  const searchInput = document.getElementById('searchProductInput');
  const btnClear = document.getElementById('btnClearSearchProduct');
  const btnRemoveSelection = document.getElementById('btnRemoveSelection');
  
  // BUSCADOR DE GRANEL
  const searchInputGranel = document.getElementById('searchProductInputGranel');
  const btnClearGranel = document.getElementById('btnClearSearchProductGranel');
  const btnRemoveSelectionGranel = document.getElementById('btnRemoveSelectionGranel');
  
  if (!radioCatalogo || !radioGranel) return;
  
  // Cambiar entre catálogo y granel
  function actualizarVista() {
    if (radioCatalogo.checked) {
      // MODO CATÁLOGO (SACOS)
      containerCatalogo.style.display = 'block';
      containerGranel.style.display = 'none';
      labelCantidad.textContent = 'Cantidad:';
      inputCantidad.min = 1;
      inputCantidad.step = 1;
      inputCantidad.value = 1;
      inputCantidad.placeholder = 'Cant.';
      if (searchInput) searchInput.focus();
    } else {
      // MODO GRANEL (MONTO)
      containerCatalogo.style.display = 'none';
      containerGranel.style.display = 'block';
      labelCantidad.textContent = '💰 Monto ($):';
      inputCantidad.min = 100;
      inputCantidad.step = 100;
      inputCantidad.value = 1000;
      inputCantidad.placeholder = 'Ej: 5000';
      if (searchInputGranel) searchInputGranel.focus();
      limpiarSeleccionProducto();
    }
  }
  
  radioCatalogo.addEventListener('change', actualizarVista);
  radioGranel.addEventListener('change', actualizarVista);
  
  // ==== EVENT LISTENERS PARA CATÁLOGO (SACOS) ====
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value;
      filtrarProductos(query);
      
      if (btnClear) {
        btnClear.style.display = query ? 'block' : 'none';
      }
    });
    
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const resultsContainer = document.getElementById('productSearchResults');
        const firstCard = resultsContainer ? resultsContainer.querySelector('.product-result-card') : null;
        if (firstCard) {
          const productoId = firstCard.dataset.productoId;
          if (productoId) {
            seleccionarProducto(parseInt(productoId));
          }
        }
      }
    });
    
    searchInput.focus();
  }
  
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      btnClear.style.display = 'none';
      const resultsContainer = document.getElementById('productSearchResults');
      if (resultsContainer) {
        resultsContainer.style.display = 'none';
      }
    });
  }
  
  if (btnRemoveSelection) {
    btnRemoveSelection.addEventListener('click', limpiarSeleccionProducto);
  }
  
  // ==== EVENT LISTENERS PARA GRANEL ====
  if (searchInputGranel) {
    searchInputGranel.addEventListener('input', (e) => {
      const query = e.target.value;
      filtrarProductosGranel(query);
      
      if (btnClearGranel) {
        btnClearGranel.style.display = query ? 'block' : 'none';
      }
    });
    
    searchInputGranel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const resultsContainer = document.getElementById('productSearchResultsGranel');
        const firstCard = resultsContainer ? resultsContainer.querySelector('.product-result-card') : null;
        if (firstCard) {
          const productoId = firstCard.dataset.productoId;
          if (productoId) {
            seleccionarProductoGranel(parseInt(productoId));
          }
        }
      }
    });
  }
  
  if (btnClearGranel) {
    btnClearGranel.addEventListener('click', () => {
      if (searchInputGranel) {
        searchInputGranel.value = '';
        searchInputGranel.focus();
      }
      btnClearGranel.style.display = 'none';
      const resultsContainer = document.getElementById('productSearchResultsGranel');
      if (resultsContainer) {
        resultsContainer.style.display = 'none';
      }
    });
  }
  
  if (btnRemoveSelectionGranel) {
    btnRemoveSelectionGranel.addEventListener('click', limpiarSeleccionProductoGranel);
  }
  
  // Inicializar vista
  actualizarVista();
}

/**
 * Crear alerta de producto sin stock
 */
async function crearAlertaSinStock(producto, cantidadSolicitada, stockDisponible) {
  try {
    await supabase_client
      .from('alertas_sistema')
      .insert([{
        tipo: 'SIN_STOCK',
        titulo: `Sin stock: ${producto.nombre}`,
        mensaje: `Se agendó un pedido de ${cantidadSolicitada} unidades pero solo hay ${stockDisponible} en stock.`,
        producto_id: producto.id,
        leido: false
      }]);
    
    console.log('⚠️ Alerta de stock creada');
  } catch (error) {
    console.error('Error creando alerta:', error);
  }
}

/**
 * Descontar stock de productos al marcar pedido como entregado
 * @param {string} pedidoId - ID del pedido
 * @param {object} pedido - Datos del pedido
 */
async function descontarStockPedido(pedidoId, pedido) {
  try {
    const items = pedido.items || [];
    console.log('🔍 DEBUG - Items del pedido:', items);
    
    const productosConId = items.filter(item => item.producto_id);
    console.log('🔍 DEBUG - Productos con ID (catálogo):', productosConId);
    
    if (productosConId.length === 0) {
      console.log('📦 Pedido sin productos del catálogo, no se descuenta stock');
      return;
    }
    
    console.log(`📦 Procesando ${productosConId.length} productos para descuento de stock...`);
    
    for (const item of productosConId) {
      try {
        console.log(`🔄 Procesando: ${item.nombre} (ID: ${item.producto_id}, Cantidad: ${item.cantidad})`);
        
        // Obtener stock actual del producto
        const { data: producto, error: errorGet } = await supabase_client
          .from('productos')
          .select('stock, nombre')
          .eq('id', item.producto_id)
          .single();
        
        if (errorGet) {
          console.error(`❌ Error obteniendo producto ${item.producto_id}:`, errorGet);
          continue;
        }
        
        const stockAnterior = Math.floor(producto.stock || 0);
        const nuevoStock = stockAnterior - item.cantidad;
        
        console.log(`   Stock anterior: ${stockAnterior}, Nuevo stock: ${nuevoStock}`);
        
        // Actualizar stock
        const { error: errorUpdate } = await supabase_client
          .from('productos')
          .update({ stock: nuevoStock })
          .eq('id', item.producto_id);
        
        if (errorUpdate) {
          console.error(`❌ Error actualizando stock de ${item.nombre}:`, errorUpdate);
          continue;
        }
        
        // Registrar movimiento en tabla de auditoría
        const { error: errorMovimiento } = await supabase_client
          .from('movimientos_stock')
          .insert([{
            producto_id: item.producto_id,
            pedido_id: pedidoId,
            tipo: 'SALIDA',
            cantidad: item.cantidad,
            stock_anterior: stockAnterior,
            stock_nuevo: nuevoStock,
            usuario: 'sistema_reparto',
            motivo: `Pedido entregado - ${pedido.nombre || 'Cliente'}`
          }]);
        
        if (errorMovimiento) {
          console.error(`⚠️ Error registrando movimiento:`, errorMovimiento);
        }
        
        console.log(`✅ Stock actualizado: ${item.nombre} (${stockAnterior} → ${nuevoStock})`);
        
      } catch (error) {
        console.error(`❌ Error procesando producto ${item.nombre}:`, error);
      }
    }
    
    console.log('✅ Descuento de stock completado');
    
  } catch (error) {
    console.error('❌ Error en descontarStockPedido:', error);
  }
}

/**
 * Devolver stock de productos al anular un pedido entregado
 * @param {string} pedidoId - ID del pedido
 * @param {object} pedido - Datos del pedido
 */
async function devolverStockPedido(pedidoId, pedido) {
  try {
    const items = pedido.items || [];
    const productosConId = items.filter(item => item.producto_id);
    
    if (productosConId.length === 0) {
      console.log('📦 Pedido sin productos del catálogo, no se devuelve stock');
      return;
    }
    
    console.log(`♻️ Devolviendo stock de ${productosConId.length} productos...`);
    
    for (const item of productosConId) {
      try {
        // Obtener stock actual del producto
        const { data: producto, error: errorGet } = await supabase_client
          .from('productos')
          .select('stock, nombre')
          .eq('id', item.producto_id)
          .single();
        
        if (errorGet) {
          console.error(`Error obteniendo producto ${item.producto_id}:`, errorGet);
          continue;
        }
        
        const stockAnterior = Math.floor(producto.stock || 0);
        const nuevoStock = stockAnterior + item.cantidad;
        
        // Actualizar stock
        const { error: errorUpdate } = await supabase_client
          .from('productos')
          .update({ stock: nuevoStock })
          .eq('id', item.producto_id);
        
        if (errorUpdate) {
          console.error(`Error actualizando stock de ${item.nombre}:`, errorUpdate);
          continue;
        }
        
        // Registrar movimiento en tabla de auditoría
        await supabase_client
          .from('movimientos_stock')
          .insert([{
            producto_id: item.producto_id,
            pedido_id: pedidoId,
            tipo: 'DEVOLUCION',
            cantidad: item.cantidad,
            stock_anterior: stockAnterior,
            stock_nuevo: nuevoStock,
            usuario: 'sistema_reparto',
            motivo: `Pedido anulado - Devolución de stock`
          }]);
        
        console.log(`♻️ Stock devuelto: ${item.nombre} (${stockAnterior} → ${nuevoStock})`);
        
      } catch (error) {
        console.error(`Error procesando producto ${item.nombre}:`, error);
      }
    }
    
    // Crear alerta para el encargado
    await supabase_client
      .from('alertas_sistema')
      .insert([{
        tipo: 'PEDIDO_ANULADO',
        titulo: '⚠️ Pedido anulado - Stock restaurado',
        mensaje: `El pedido #${pedidoId} fue anulado. Se restauraron ${productosConId.length} productos al inventario.`,
        pedido_id: pedidoId,
        leido: false
      }]);
    
    console.log('✅ Devolución de stock y alerta completadas');
    
  } catch (error) {
    console.error('Error en devolverStockPedido:', error);
  }
}

// ==================================================
// FIN SISTEMA DE INTEGRACIÓN CON CATÁLOGO
// ==================================================

// Añadir producto al carrito con validación
function anadirProducto() {
  const tipoProducto = document.querySelector('input[name="tipoProducto"]:checked').value;
  const cantidadEl = document.getElementById('itemCantidad');
  
  if (tipoProducto === 'catalogo') {
    // ===== MODO CATÁLOGO (SACOS) =====
    if (!productoSeleccionado) {
      ErrorHandler.mostrarError('⚠️ Debes buscar y seleccionar un producto del catálogo');
      return;
    }
    
    const producto = productoSeleccionado;
    const cantidad = parseInt(cantidadEl.value);
    
    if (!cantidad || cantidad <= 0) {
      ErrorHandler.mostrarError('Cantidad debe ser mayor a 0');
      return;
    }
    
    // Validar stock disponible
    const stockDisponible = Math.floor(producto.stock || 0);
    const stockMinimo = producto.stock_minimo_sacos || 0;
    
    // Mostrar alerta si no hay stock suficiente (pero permitir continuar)
    if (stockDisponible < cantidad) {
      const confirmar = confirm(
        `⚠️ ALERTA DE STOCK\n\n` +
        `Producto: ${producto.nombre}\n` +
        `Stock disponible: ${stockDisponible} unidades\n` +
        `Cantidad solicitada: ${cantidad} unidades\n\n` +
        `No hay stock suficiente.\n` +
        `¿Deseas agendar el pedido de todas formas?`
      );
      
      if (!confirmar) return;
      
      // Crear alerta en sistema
      crearAlertaSinStock(producto, cantidad, stockDisponible);
    } else if (stockDisponible <= stockMinimo) {
      // Advertencia de stock bajo
      ErrorHandler.mostrarWarning(
        `⚠️ Stock bajo: ${producto.nombre} (${stockDisponible} disponibles)`
      );
    }
    
    const productoData = {
      producto_id: producto.id,
      nombre: Validator.sanitizeHTML(producto.nombre),
      cantidad: cantidad,
      precio: producto.precio || 0
    };
    
    // Verificar duplicados
    const productoExistente = lineasPedido.find(p => p.producto_id === productoData.producto_id);
    
    if (productoExistente) {
      productoExistente.cantidad += cantidad;
      ErrorHandler.mostrarExito(`Cantidad actualizada para ${productoData.nombre}`);
    } else {
      lineasPedido.push(productoData);
      ErrorHandler.mostrarExito(`${productoData.nombre} agregado al pedido`);
    }
    
    // Limpiar selección y resetear cantidad
    limpiarSeleccionProducto();
    cantidadEl.value = 1;
    
  } else {
    // ===== MODO GRANEL (MONTO) =====
    if (!productoGranelSeleccionado) {
      ErrorHandler.mostrarError('⚠️ Debes buscar y seleccionar un producto a granel');
      return;
    }
    
    const producto = productoGranelSeleccionado;
    const monto = parseInt(cantidadEl.value);
    
    if (!monto || monto < 100) {
      ErrorHandler.mostrarError('💰 El monto debe ser al menos $100');
      return;
    }
    
    // Preparar datos del producto granel (monto como cantidad)
    const productoData = {
      producto_id: producto.id,
      nombre: Validator.sanitizeHTML(producto.nombre),
      cantidad: monto, // MONTO en pesos
      precio: monto // Precio = monto para cálculo de total
    };
    
    console.log(`⚖️ Agregando producto granel: ${producto.nombre} - Monto: $${monto.toLocaleString('es-CL')}`);
    
    // Verificar duplicados (mismo producto granel)
    const productoExistente = lineasPedido.find(p => p.producto_id === productoData.producto_id);
    
    if (productoExistente) {
      // Sumar al monto existente
      productoExistente.cantidad += monto;
      productoExistente.precio += monto;
      ErrorHandler.mostrarExito(`💰 Monto actualizado para ${productoData.nombre}: $${productoExistente.cantidad.toLocaleString('es-CL')}`);
    } else {
      lineasPedido.push(productoData);
      ErrorHandler.mostrarExito(`✅ ${productoData.nombre} agregado - $${monto.toLocaleString('es-CL')}`);
    }
    
    // Limpiar selección y resetear monto
    limpiarSeleccionProductoGranel();
    cantidadEl.value = 1000;
  }
  
  renderLineasPedido();
}

// Limpiar formulario y productos
function limpiarFormulario() {
  clearForm('formAgregar');
  lineasPedido = [];
  
  // Resetear descuentos
  descuentoAplicado = 0;
  tipoDescuentoActual = 'ninguno';
  valorDescuentoActual = 0;
  subtotalSinDescuento = 0;
  
  renderLineasPedido();
  setFechaHoyDefault();
  
  // Limpiar producto seleccionado del buscador
  limpiarSeleccionProducto();
  
  // Limpiar input de búsqueda
  const searchInput = document.getElementById('searchProductInput');
  if (searchInput) {
    searchInput.value = '';
  }
  
  // Ocultar resultados de búsqueda
  const resultsContainer = document.getElementById('productSearchResults');
  if (resultsContainer) {
    resultsContainer.style.display = 'none';
  }
  
  // Ocultar botón limpiar búsqueda
  const btnClear = document.getElementById('btnClearSearchProduct');
  if (btnClear) {
    btnClear.style.display = 'none';
  }
  
  // Establecer chofer por defecto
  const choferSelect = document.getElementById('asignadoA');
  if (choferSelect) {
    choferSelect.value = 'repartidor_1';
  }
  
  // Resetear método de pago a opción por defecto (obligar selección manual)
  const metodoPagoSelect = document.getElementById('metodoPago');
  if (metodoPagoSelect) {
    metodoPagoSelect.value = '';
  }
  
  // Limpiar preview de historial
  const previewEl = document.getElementById('historialPreview');
  if (previewEl) {
    previewEl.style.display = 'none';
  }
  
  // Restaurar al modo agregar
  restaurarModoAgregar();
}

// Render principal
// Render principal con sistema de rutas
function render(datosParaRenderizar){
  // Guardar los datos actualmente visibles para el modal de carga
  datosFiltrados = datosParaRenderizar || [];
  
  const cont = getElement('resultados'); 
  cont.innerHTML = '';
  if (!datosParaRenderizar.length){
    cont.innerHTML = `<div class="item">No hay datos. Agrega un pedido a la derecha.</div>`;
    datosFiltrados = []; // Limpiar también si no hay datos
    return;
  }
  
  // Ordenar datos por ruta (prioridad + orden manual)
  const datosOrdenados = ordenarPorRuta([...datosParaRenderizar]);
  
  datosOrdenados.forEach(d => {
    const esPedidoErroneo = (!d.nombre || d.nombre.trim() === '' || d.nombre === '(sin nombre)') &&
                            (!d.telefono || d.telefono.trim() === '' || d.telefono === '(sin teléfono)');
    const div = document.createElement('div');
    // Distinguir entre anulado y entregado exitosamente
    let claseEstado = '';
    if (d.estado === 'ANULADO') {
      claseEstado = ' anulado';
    } else if (d.entregado) {
      claseEstado = ' delivered';
    }
    div.className = 'card-order' + claseEstado;
    div.dataset.clienteId = d.id;

    const resumenTexto = (Array.isArray(d.items) && d.items.length)
          ? d.items.map(it => {
              const esGranel = it.nombre && it.nombre.toLowerCase().includes('(granel)');
              return esGranel ? `${it.nombre} ($${it.cantidad.toLocaleString('es-CL')})` : `${it.nombre} (${it.cantidad}x)`;
            }).join(', ')
          : 'Sin productos';
    
    // Usar nueva función para mostrar precio/PAGADO
    const cobrarLabel = obtenerTextoVenta(d);

    // Información de prioridad
    const prioridad = d.prioridad || 'C';
    const prioridadInfo = PRIORIDADES[prioridad];

    // Separar mensaje de cambio de método de pago de las notas regulares
    let notasRegulares = d.notas || '';
    let mensajeCambio = '';
    if (notasRegulares.includes('📝 Cambio:')) {
      const partes = notasRegulares.split('📝 Cambio:');
      notasRegulares = partes[0].replace(/\s*\|\s*$/, '').trim();
      mensajeCambio = '📝 Cambio:' + partes[1];
    }
    
    // SEMÁFORO DE COBRO - Detectar si hay que cobrar
    const metodoPago = d.metodo_pago || 'E';
    const debeColectar = (metodoPago === 'E' || metodoPago === 'DC'); // Efectivo o Tarjeta
    div.classList.add(debeColectar ? 'cobrar-pendiente' : 'cobrar-pagado');
    
    // Badge de NUEVO
    const esNuevo = esPedidoNuevo(d.created_at);
    const badgeNuevo = esNuevo ? '<span class="badge-nuevo">🆕 NUEVO</span>' : '';
    
    // Badge de REPARTIDOR ASIGNADO
    let badgeRepartidor = '';
    if (d.asignado_a === 'repartidor_1') {
      badgeRepartidor = '<span style="display:inline-block;background:#3b82f6;color:white;padding:1px 4px;border-radius:3px;font-size:0.5rem;font-weight:700;margin-left:4px;">🚚 R1</span>';
    } else if (d.asignado_a === 'repartidor_2') {
      badgeRepartidor = '<span style="display:inline-block;background:#10b981;color:white;padding:1px 4px;border-radius:3px;font-size:0.5rem;font-weight:700;margin-left:4px;">🚚 R2</span>';
    }
    
    // Extraer monto del cobrarLabel
    const montoMatch = cobrarLabel.match(/\$[\d.,]+/);
    const montoTexto = montoMatch ? montoMatch[0] : '$0';
    
    // Estado de pago para mostrar
    const estadoPagoTexto = debeColectar ? 'POR COBRAR' : 'PAGADO';
    
    div.innerHTML = `
      <div class="card-row">
        <div class="card-left">
          ${badgeNuevo}${badgeRepartidor}
          <!-- Línea 1: Monto + Nombre en horizontal -->
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span class="price-tag" style="font-size:1rem;padding:2px 6px;">${cobrarLabel}</span>
            <span class="client-name" style="font-size:1rem;font-weight:600;flex:1;min-width:0;">${d.nombre || '(sin nombre)'}</span>
          </div>
          <!-- Línea 2: Teléfono + WhatsApp compacto -->
          ${d.telefono ? `
            <div style="display:flex;align-items:center;gap:4px;">
              <span style="font-size:0.9375rem;">📞</span>
              <span class="client-phone" data-telefono="${d.telefono}" data-action="call" style="cursor:pointer;font-size:0.9375rem;padding:2px 5px;">${d.telefono}</span>
              <a href="https://wa.me/56${d.telefono.replace(/\D/g, '')}?text=Hola%20👋,%20somos%20Sabrofood%20🐶🐱%0AQueremos%20avisarte%20que%20tu%20pedido%20ya%20está%20listo%20y%20estamos%20próximos%20a%20realizar%20la%20entrega%20🚚%0A¿Te%20encuentras%20disponible%20para%20recibirlo?%0A¡Quedamos%20atentos!" 
                 target="_blank" 
                 style="display:inline-flex;align-items:center;justify-content:center;background:#25d366;color:white;padding:3px;border-radius:50%;text-decoration:none;width:20px;height:20px;"
                 title="WhatsApp">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </a>
            </div>
          ` : ''}
          <!-- Línea 3: Dirección compacta -->
          ${d.direccion ? `<div style="display:flex;align-items:center;gap:3px;" data-direccion="${d.direccion}" data-action="navigation"><span style="font-size:0.875rem;">📍</span><span class="client-address" style="font-size:0.875rem;padding:2px 5px;flex:1;min-width:0;">${d.direccion}</span></div>` : ''}
          <!-- Línea 4: Productos compacto -->
          ${resumenTexto !== 'Sin productos' ? `<div style="display:flex;align-items:center;gap:3px;"><span style="font-size:0.875rem;">🛒</span><span class="product-name" style="font-size:0.875rem;padding:2px 5px;flex:1;min-width:0;">${resumenTexto}</span></div>` : ''}
          
          ${mensajeCambio ? `<div class="cambio-metodo-pago"><span class="cambio-texto" style="font-size:0.875rem;">${mensajeCambio}</span></div>` : ''}
        
        ${notasRegulares ? `
          <div class="nota-importante" style="background: #fee2e2; border-left: 4px solid #dc2626;">
            <div class="line">
              <span class="icon">⚠️</span>
              <span class="note-destacada" style="color: #991b1b; font-weight: 600;">${notasRegulares}</span>
            </div>
          </div>
        ` : ''}
        </div>
        <div class="ruta-controls">
          <div class="prioridad-section">
            <label class="prioridad-label" style="font-size: 0.7rem; font-weight: 600; color: #374151;">🚚:</label>
            <select class="prioridad-select" data-doc="${d.id}" style="
              background: ${prioridadInfo.bgColor}; 
              color: ${prioridadInfo.color}; 
              border: 1px solid ${prioridadInfo.color};
              border-radius: 5px;
              padding: 4px 5px;
              font-weight: 600;
              font-size: 0.7rem;
            ">
              <option value="A" ${prioridad === 'A' ? 'selected' : ''}>🔴 A - Alta</option>
              <option value="B" ${prioridad === 'B' ? 'selected' : ''}>🟡 B - Media</option>
              <option value="C" ${prioridad === 'C' ? 'selected' : ''}>🟢 C - Baja</option>
            </select>
          </div>
          <div class="prioridad-numerica">
            <label for="orden-${d.id}" style="font-size: 0.7rem; color: #666; margin-bottom: 2px; display: block; font-weight: 600;">🔢:</label>
            <input 
              type="number" 
              id="orden-${d.id}"
              class="input-orden-entrega"
              data-doc="${d.id}"
              value="${(d.orden_ruta && d.orden_ruta <= 99) ? d.orden_ruta : ''}"
              min="1"
              max="99"
              placeholder="#"
              title="Orden de entrega (1, 2, 3...)"
              style="
                width: 50px;
                height: 30px;
                padding: 4px 6px;
                border: 1px solid #ddd;
                -webkit-appearance: none;
                -moz-appearance: textfield;
                border-radius: 5px;
                font-size: 0.8125rem;
                font-weight: 600;
                text-align: center;
                background: #fff;
                box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                transition: all 0.2s ease;
                -webkit-appearance: none;
                -moz-appearance: textfield;
              "
              onFocus="this.style.borderColor='#3b82f6'; this.style.boxShadow='0 0 0 3px rgba(59,130,246,0.1)'"
              onBlur="this.style.borderColor='#ddd'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.1)'"
            >
          </div>
        </div>
        
        <!-- ACCIONES PRINCIPALES DEL REPARTIDOR -->
        <div class="acciones-repartidor">
          ${d.estado === 'ANULADO' ? `
            <!-- Pedido ANULADO: Mostrar opción de reactivar -->
            <div class="estado-entregado estado-anulado">
              <span class="entregado-info">
                🚫 ANULADO - No Cobrado
              </span>
            </div>
            <button class="btn-reactivar-pedido" type="button" aria-label="Reactivar pedido anulado" data-doc="${d.id}">
              🔄 Reactivar Pedido
            </button>
          ` : `
            <!-- Pedido NORMAL o ENTREGADO -->
            <button class="btn-entregado-principal ${d.entregado ? 'entregado' : 'pendiente'}" type="button" aria-label="${d.entregado ? 'Marcar como pendiente' : 'Marcar como entregado'}" data-doc="${d.id}" data-entregado="${d.entregado}">
              ${d.entregado ? '↩️ Desmarcar' : '✓ Entregar'}
            </button>
            ${!d.entregado ? `
              <button class="btn-reagendar-principal" type="button" aria-label="Reagendar pedido" data-doc="${d.id}" data-fecha="${d.fecha}">
                📅 Reagendar
              </button>
            ` : `
              <div class="estado-entregado">
                <span class="entregado-info">
                  ✓ Completado
                </span>
              </div>
            `}
          `}
          
          <!-- Contenedor del botón de menú y dropdown -->
          <div style="position: relative;">
            <button class="btn-menu-acciones" type="button" aria-label="Más opciones" data-doc="${d.id}" title="Más opciones">
              ⚙️
            </button>
            
            <!-- Menú desplegable -->
            <div class="menu-acciones-dropdown" data-menu="${d.id}" style="display:none;">
              <button class="menu-item" data-action="historial" data-telefono="${d.telefono}" data-nombre="${d.nombre}">
                <span class="menu-icon">📚</span>
                <span class="menu-text">Historial</span>
              </button>
              ${!d.entregado && d.estado !== 'ANULADO' ? `
                <button class="menu-item" data-action="asignar-repartidor" data-doc="${d.id}">
                  <span class="menu-icon">🚚</span>
                  <span class="menu-text">Asignar Repartidor</span>
                </button>
                <button class="menu-item" data-action="editar" data-doc="${d.id}">
                  <span class="menu-icon">✏️</span>
                  <span class="menu-text">Editar</span>
                </button>
                <button class="menu-item" data-action="anular" data-doc="${d.id}">
                  <span class="menu-icon">🚫</span>
                  <span class="menu-text">Anular</span>
                </button>
                <button class="menu-item menu-item-danger" data-action="eliminar" data-doc="${d.id}">
                  <span class="menu-icon">🗑️</span>
                  <span class="menu-text">Eliminar</span>
                </button>
              ` : ''}
            </div>
          </div>
          
          <!-- Botón especial para transferencias pendientes -->
          ${d.metodo_pago === 'TP' && !(d.notas || '').includes('PAGO MIXTO') ? `
            <button class="btn-transferencia-pagada" type="button" aria-label="Marcar transferencia como pagada" data-doc="${d.id}" style="background: #10b981; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; width: 100%; margin-top: 8px;">
              💰 Marcar como Pagada
            </button>
          ` : ''}
          
          <!-- Botón especial para pago mixto con transferencia pendiente -->
          ${(d.metodo_pago === 'PM' || (d.notas || '').includes('PAGO MIXTO')) && (d.notas || '').includes('Transferencia') && !(d.notas || '').includes('Transferencia PAGADA') ? `
            <button class="btn-pago-mixto-pagado" type="button" aria-label="Confirmar transferencia del pago mixto" data-doc="${d.id}" style="background: #8b5cf6; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; width: 100%; margin-top: 8px;">
              💰 Marcar como Pagada
            </button>
          ` : ''}
        </div>
      </div>
    </div>
    `;

    // CLICS INTELIGENTES - Dirección y Teléfono
    const direccionEl = div.querySelector('[data-action="navigation"]');
    const telefonoEl = div.querySelector('[data-action="call"]');
    
    if (direccionEl) {
      direccionEl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const direccion = ev.currentTarget.dataset.direccion;
        if (direccion && direccion !== '(sin dirección)') {
          // Intentar Waze primero, si falla Google Maps
          const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(direccion)}&navigate=yes`;
          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
          window.open(wazeUrl, '_blank') || window.open(mapsUrl, '_blank');
        }
      });
    }
    
    if (telefonoEl) {
      telefonoEl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const telefono = ev.currentTarget.dataset.telefono;
        if (telefono && telefono !== '(sin teléfono)') {
          window.location.href = `tel:${telefono}`;
        }
      });
    }
    
    // Swipe desactivado - se usan botones directos
    
    // eventos en botones principales del repartidor
    const btnEntPrincipal = div.querySelector('.btn-entregado-principal');
    const btnReaPrincipal = div.querySelector('.btn-reagendar-principal');
    
    // eventos en botones secundarios
    const btnRe = div.querySelector('.btn-reagendar'); // mantener compatibilidad
    const btnEnt = div.querySelector('.btn-entregado'); // mantener compatibilidad
    const btnReactivar = div.querySelector('.btn-reactivar-pedido');
    const btnTransfPagada = div.querySelector('.btn-transferencia-pagada');
    const btnPagoMixtoPagado = div.querySelector('.btn-pago-mixto-pagado');
    
    // MEJORA 1: Botón y menú de acciones compacto
    const btnMenuAcciones = div.querySelector('.btn-menu-acciones');
    const menuDropdown = div.querySelector('.menu-acciones-dropdown');
    
    // eventos en controles de ruta
    const selectPrioridad = div.querySelector('.prioridad-select');
    const inputOrden = div.querySelector('.input-orden-entrega');
    
    // Event listeners para botones principales del repartidor
    if(btnEntPrincipal) btnEntPrincipal.onclick = (ev)=>{
      ev.stopPropagation();
      toggleEntregado(d.id, d.entregado, ev.currentTarget);
    };
    if(btnReaPrincipal) btnReaPrincipal.onclick = (ev)=>{ 
      ev.stopPropagation(); 
      reagendarPedido(d.id, d.fecha); 
    };
    
    // Event listeners para botones de compatibilidad (si existen)
    if(btnRe) btnRe.onclick = (ev)=>{ ev.stopPropagation(); reagendarPedido(d.id, d.fecha); };
    if(btnEnt) btnEnt.onclick = (ev)=>{
      ev.stopPropagation();
      toggleEntregado(d.id, d.entregado, ev.currentTarget);
    };
    if(btnReactivar) btnReactivar.onclick = (ev)=>{
      ev.stopPropagation();
      reactivarPedido(d.id, ev.currentTarget);
    };
    if(btnTransfPagada) btnTransfPagada.onclick = (ev)=>{
      ev.stopPropagation();
      marcarTransferenciaPagada(d.id);
    };
    if(btnPagoMixtoPagado) {
      console.log('✅ Botón de Pago Mixto encontrado para pedido:', d.id);
      btnPagoMixtoPagado.onclick = (ev)=>{
        ev.stopPropagation();
        console.log('🔀 Click en botón Pago Mixto - ID:', d.id);
        marcarPagoMixtoPagado(d.id);
      };
    }
    
    // MEJORA 1: Event listeners para menú compacto
    if(btnMenuAcciones) {
      btnMenuAcciones.onclick = (ev)=>{
        ev.stopPropagation();
        toggleMenuAcciones(menuDropdown, btnMenuAcciones);
      };
    }
    
    if(menuDropdown) {
      const menuItems = menuDropdown.querySelectorAll('.menu-item');
      menuItems.forEach(item => {
        item.onclick = (ev) => {
          ev.stopPropagation();
          const action = item.dataset.action;
          const docId = item.dataset.doc;
          
          // Cerrar menú
          menuDropdown.style.display = 'none';
          
          // Ejecutar acción
          switch(action) {
            case 'historial':
              mostrarHistorialCliente(item.dataset.telefono, item.dataset.nombre);
              break;
            case 'asignar-repartidor':
              asignarRepartidor(docId);
              break;
            case 'editar':
              editarPedido(docId);
              break;
            case 'anular':
              anularPedido(docId, item);
              break;
            case 'eliminar':
              eliminarPedido(docId, item);
              break;
          }
        };
      });
    }
    
    // Event listeners para ruta
    if(selectPrioridad) selectPrioridad.onchange = (ev) => {
      ev.stopPropagation();
      cambiarPrioridad(d.id, ev.target.value);
    };
    
    // Event listener para cambio de orden numérico
    if(inputOrden) {
      inputOrden.onchange = (ev) => {
        ev.stopPropagation();
        const nuevoOrden = parseInt(ev.target.value) || 0;
        actualizarOrdenEntrega(d.id, nuevoOrden);
      };
      
      inputOrden.onblur = (ev) => {
        ev.stopPropagation();
        const nuevoOrden = parseInt(ev.target.value) || 0;
        actualizarOrdenEntrega(d.id, nuevoOrden);
      };
    }

    cont.appendChild(div);
  });
  
  // Actualizar resumen de caja después de renderizar
  actualizarResumenCaja(datosLocal, filtroActual);
}

// Contador de resultados
function updateResultCount(n, q){
  const el = getElement('resultCount');
  if(!el) return;
  // Ocultar contador de resultados
  el.textContent = '';
  
  // Actualizar contador de pedidos en el badge
  actualizarContadorPedidos(n);
}

/**
 * MEJORA 3: CONTADOR DE PROGRESO
 * Muestra "✅ [Entregados] / � [Anulados] / 📦 [Total]"
 * Solo cuenta los pedidos que se están mostrando según el filtro actual
 */
function actualizarContadorPedidos(cantidad) {
  // Usar SOLO los datos filtrados que se están mostrando
  const datosActuales = datosFiltrados.length > 0 ? datosFiltrados : datosLocal;
  
  // Contar cada categoría
  const entregados = datosActuales.filter(p => p.entregado && p.estado !== 'ANULADO').length;
  const anulados = datosActuales.filter(p => p.estado === 'ANULADO').length;
  const pendientes = datosActuales.filter(p => !p.entregado && p.estado !== 'ANULADO').length;
  
  // El total debe ser la suma exacta de lo que se muestra
  const total = entregados + anulados + pendientes;
  
  // Actualizar contador de progreso
  const contadorEntregados = document.getElementById('contadorEntregados');
  const contadorAnulados = document.getElementById('contadorAnulados');
  const contadorTotal = document.getElementById('contadorTotal');
  
  if (contadorEntregados) {
    contadorEntregados.textContent = `✅ ${entregados}`;
  }
  
  if (contadorAnulados) {
    contadorAnulados.textContent = `🚫 ${anulados}`;
  }
  
  if (contadorTotal) {
    contadorTotal.textContent = `📦 ${total}`;
  }
  
  // Mantener compatibilidad con contador antiguo si existe
  const contadorEl = document.getElementById('contadorPedidos');
  if (contadorEl) {
    contadorEl.textContent = total;
  }
}

// Abrir/Cerrar Modal de Formulario (nuevo pedido)
async function abrirModalFormulario() {
  const [backdropEl, modalEl] = getElements('formModalBackdrop', 'formModal');
  backdropEl.style.display = 'flex';
  setTimeout(() => { modalEl.classList.add('show'); }, 10);
  
  // Establecer chofer por defecto
  const choferSelect = document.getElementById('asignadoA');
  if (choferSelect) {
    choferSelect.value = 'repartidor_1';
  }
  
  // 🔄 RECARGAR CATÁLOGO para tener stock actualizado
  await cargarCatalogoProductos(false);
  
  // Si hay búsqueda activa, refiltrar con datos actualizados
  const searchInput = document.getElementById('searchProductInput');
  if (searchInput && searchInput.value.trim()) {
    filtrarProductos(searchInput.value);
  }
}

function closeFormModal(){
  const modal = document.getElementById('formModal');
  modal.classList.remove('show');
  modal.classList.add('hide');
  setTimeout(() => { 
    document.getElementById('formModalBackdrop').style.display = 'none'; 
    modal.classList.remove('hide');
  }, 300);
  
  // Resetear descuentos
  descuentoAplicado = 0;
  tipoDescuentoActual = 'ninguno';
  valorDescuentoActual = 0;
  subtotalSinDescuento = 0;
  
  // Restaurar el formulario al modo "agregar" al cerrar
  restaurarModoAgregar();
}

// Función de búsqueda
/**
 * MEJORA 5: BÚSQUEDA MULTIFUNCIONAL
 * Filtra por: Nombre, Teléfono, Dirección, Notas, Productos, Fecha Y MÉTODO DE PAGO
 * RESPETA EL FILTRO DE FECHA ACTIVO (Hoy/Mañana/Mes)
 */
function buscarPedidos() {
  const query = document.getElementById('buscador').value.trim().toLowerCase();
  textoTerminoBusqueda = query; // Guardar para refresco inteligente
  
  if (!query) {
    // Si no hay búsqueda, re-aplicar el filtro de fecha activo
    aplicarFiltroFecha(filtroActual);
    return;
  }
  
  // PASO 1: Obtener datos filtrados por fecha según la pestaña activa
  let datosFiltradosPorFecha = [];
  
  switch(filtroActual) {
    case 'hoy':
      const fechaHoy = getFechaFormateada(new Date());
      datosFiltradosPorFecha = datosLocal.filter(pedido => pedido.fecha === fechaHoy);
      break;
      
    case 'manana':
      const fechaManana = getFechaManana();
      datosFiltradosPorFecha = datosLocal.filter(pedido => pedido.fecha === fechaManana);
      break;
      
    case 'mes':
      datosFiltradosPorFecha = datosLocal.filter(pedido => esMesActual(pedido.fecha));
      break;
      
    case 'custom':
      const fechaCustom = document.getElementById('filterDate').value;
      if (fechaCustom) {
        datosFiltradosPorFecha = datosLocal.filter(pedido => pedido.fecha === fechaCustom);
      } else {
        datosFiltradosPorFecha = datosLocal;
      }
      break;
      
    default:
      datosFiltradosPorFecha = datosLocal;
  }
  
  // PASO 2: Aplicar búsqueda sobre los datos ya filtrados por fecha
  const resultados = datosFiltradosPorFecha.filter(pedido => {
    const nombre = (pedido.nombre || '').toLowerCase();
    const telefono = (pedido.telefono || '').toLowerCase();
    const direccion = (pedido.direccion || '').toLowerCase();
    const nota = (pedido.notas || '').toLowerCase();
    
    // Buscar también en los productos
    let productosText = '';
    if (Array.isArray(pedido.items)) {
      productosText = pedido.items.map(item => item.nombre || '').join(' ').toLowerCase();
    }
    
    // Buscar en fecha (formato dd/mm)
    let fechaText = '';
    if (pedido.fecha) {
      const fecha = new Date(pedido.fecha);
      fechaText = `${fecha.getDate().toString().padStart(2, '0')}/${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
    }
    
    // 🆕 BUSCAR EN MÉTODO DE PAGO (incluyendo TODAS las variantes)
    let metodoPagoText = '';
    if (pedido.metodo_pago) {
      const metodoCodigo = pedido.metodo_pago;
      // Obtener nombre completo del método (ej: "Transf. Pendiente")
      const metodoNombre = METODOS[metodoCodigo] || metodoCodigo;
      metodoPagoText = metodoNombre.toLowerCase();
      
      // También buscar en variantes comunes y código del método
      const variantes = {
        'E': 'efectivo cash dinero e',
        'DC': 'debito credito tarjeta card dc',
        'TP': 'transferencia pendiente transf por pagar tp',
        'TG': 'transferencia pagada transf paga confirmada tg pagado',
        'P': 'pagado pago p local',
        'PE': 'pagado local efectivo pe',
        'PC': 'pagado local tarjeta pc',
        'PX': 'pagado local mixto px'
      };
      metodoPagoText += ' ' + (variantes[metodoCodigo] || metodoCodigo.toLowerCase());
    }
    
    return nombre.includes(query) || 
           telefono.includes(query) || 
           direccion.includes(query) || 
           nota.includes(query) ||
           productosText.includes(query) ||
           fechaText.includes(query) ||
           metodoPagoText.includes(query);
  });
  
  render(resultados);
  updateResultCount(resultados.length, query);
}

// Función de filtro por fecha
// ========================================
// SISTEMA DE FILTROS DE FECHA FLEXIBLES
// ========================================

let filtroActual = 'hoy'; // Estado del filtro actual (cambio a hoy por defecto)
let textoTerminoBusqueda = ''; // Término de búsqueda actual (si existe)

// Función para obtener fecha formateada
function getFechaFormateada(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

// Función para obtener fecha de mañana
function getFechaManana() {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  
  return getFechaFormateada(manana);
}

// Función para obtener nombre del mes actual
function getNombreMesActual() {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const hoy = new Date();
  return meses[hoy.getMonth()];
}

// Función para verificar si una fecha está en el mes actual
function esMesActual(fechaPedido) {
  if (!fechaPedido) return false;
  
  const hoy = new Date();
  const fechaObj = new Date(fechaPedido);
  
  return fechaObj.getFullYear() === hoy.getFullYear() && 
         fechaObj.getMonth() === hoy.getMonth();
}

// Función para aplicar filtro de fecha
function aplicarFiltroFecha(tipoFiltro) {
  filtroActual = tipoFiltro;
  
  // Actualizar estado visual de los botones
  document.querySelectorAll('.filtro-fecha').forEach(btn => {
    btn.classList.remove('active');
  });
  
  let resultados = [];
  let descripcionFiltro = '';
  
  switch(tipoFiltro) {
    case 'hoy':
      const fechaHoy = getFechaFormateada(new Date());
      resultados = datosLocal.filter(pedido => pedido.fecha === fechaHoy);
      descripcionFiltro = `Hoy (${fechaHoy})`;
      document.getElementById('filterDate').value = fechaHoy;
      document.getElementById('btnHoy').classList.add('active');
      break;
      
    case 'manana':
      const fechaManana = getFechaManana();
      resultados = datosLocal.filter(pedido => pedido.fecha === fechaManana);
      descripcionFiltro = `Mañana (${fechaManana})`;
      document.getElementById('filterDate').value = fechaManana;
      document.getElementById('btnManana').classList.add('active');
      break;
      
    case 'mes':
      const mesActual = getNombreMesActual();
      resultados = datosLocal.filter(pedido => esMesActual(pedido.fecha));
      descripcionFiltro = `${mesActual} ${new Date().getFullYear()}`;
      document.getElementById('filterDate').value = '';
      document.getElementById('btnMes').classList.add('active');
      break;
      
    default:
      resultados = datosLocal.filter(pedido => esMesActual(pedido.fecha));
      descripcionFiltro = `${getNombreMesActual()} ${new Date().getFullYear()}`;
  }
  
  render(resultados);
  updateResultCount(resultados.length, descripcionFiltro);
  
  // Actualizar resumen de caja con el filtro seleccionado
  actualizarResumenCaja(datosLocal, tipoFiltro);
}

// Función para filtrar por fecha específica (cuando se usa el input date)
function filtrarPorFecha() {
  const fechaFiltro = document.getElementById('filterDate').value;
  
  if (!fechaFiltro) {
    aplicarFiltroFecha('mes');
    return;
  }
  
  // Desactivar todos los filtros predefinidos
  document.querySelectorAll('.filtro-fecha').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const resultados = datosLocal.filter(pedido => {
    return pedido.fecha === fechaFiltro;
  });
  
  render(resultados);
  updateResultCount(resultados.length, `fecha: ${fechaFiltro}`);
  
  filtroActual = fechaFiltro; // Guardar fecha específica
  actualizarResumenCaja(datosLocal, fechaFiltro);
}

// Función para filtrar pedidos de hoy (mantener compatibilidad)
function filtrarHoy() {
  aplicarFiltroFecha('hoy');
}

/**
 * Solicitar permisos de notificaciones del navegador
 * Solo se solicita si el navegador soporta notificaciones
 */
function solicitarPermisosNotificaciones() {
  if (!('Notification' in window)) {
    console.log('Este navegador no soporta notificaciones de escritorio');
    return;
  }
  
  // Si ya está permitido, no hacer nada
  if (Notification.permission === 'granted') {
    console.log('✅ Permisos de notificaciones ya otorgados');
    return;
  }
  
  // Si no está denegado, solicitar permiso
  if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        console.log('✅ Permisos de notificaciones otorgados');
        // Mostrar notificación de prueba
        new Notification('🔔 Notificaciones activadas', {
          body: 'Recibirás alertas cuando lleguen nuevos pedidos',
          icon: '📦'
        });
      } else {
        console.log('⚠️ Permisos de notificaciones denegados');
      }
    });
  }
}

// Función para inicializar completamente la aplicación
function inicializarAppCompleta() {
  // Solicitar permisos de notificaciones del navegador
  solicitarPermisosNotificaciones();
  
  // Botón de búsqueda
  const btnBuscar = document.getElementById('btnBuscar');
  if (btnBuscar) {
    btnBuscar.onclick = buscarPedidos;
  }
  
  // Campo de búsqueda con Enter
  const buscador = document.getElementById('buscador');
  if (buscador) {
    buscador.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        buscarPedidos();
      }
    });
    
    // Búsqueda en tiempo real (opcional)
    buscador.addEventListener('input', function() {
      // Comentado para evitar muchas consultas, descomenta si quieres búsqueda en tiempo real
      // clearTimeout(this.searchTimeout);
      // this.searchTimeout = setTimeout(buscarPedidos, 300);
    });
  }
  
  // Filtro por fecha
  const filterDate = document.getElementById('filterDate');
  if (filterDate) {
    filterDate.addEventListener('change', filtrarPorFecha);
  }
  
  // Botones de filtros flexibles
  const btnHoy = document.getElementById('btnHoy');
  if (btnHoy) {
    btnHoy.onclick = () => aplicarFiltroFecha('hoy');
  }
  
  const btnManana = document.getElementById('btnManana');
  if (btnManana) {
    btnManana.onclick = () => aplicarFiltroFecha('manana');
  }
  
  const btnMes = document.getElementById('btnMes');
  if (btnMes) {
    btnMes.onclick = () => aplicarFiltroFecha('mes');
  }
  
  // Botones del formulario modal
  const btnAgregar = document.getElementById('btnAgregar');
  if (btnAgregar) {
    btnAgregar.onclick = guardarPedido;
  }
  
  const btnAnadirItem = document.getElementById('btnAnadirItem');
  if (btnAnadirItem) {
    btnAnadirItem.onclick = anadirProducto;
  }
  
  const btnLimpiar = document.getElementById('btnLimpiar');
  if (btnLimpiar) {
    btnLimpiar.onclick = limpiarFormulario;
  }
  
  // Event listeners para descuentos
  const btnAplicarDescuento = document.getElementById('btnAplicarDescuento');
  if (btnAplicarDescuento) {
    btnAplicarDescuento.onclick = aplicarDescuentoPedido;
  }
  
  const btnQuitarDescuento = document.getElementById('btnQuitarDescuento');
  if (btnQuitarDescuento) {
    btnQuitarDescuento.onclick = quitarDescuentoPedido;
  }
  
  const tipoDescuento = document.getElementById('tipoDescuento');
  if (tipoDescuento) {
    tipoDescuento.onchange = cambiarTipoDescuento;
  }
  
  // Configurar búsqueda automática de historial
  configurarBusquedaHistorial();
  
  const btnOpenForm = document.getElementById('btnOpenForm');
  if (btnOpenForm) {
    btnOpenForm.onclick = abrirModalFormulario;
  }
  
  const btnCloseForm = document.getElementById('btnCloseForm');
  if (btnCloseForm) {
    btnCloseForm.onclick = closeFormModal;
  }
  
  const formModalBackdrop = document.getElementById('formModalBackdrop');
  if (formModalBackdrop) {
    formModalBackdrop.onclick = (ev) => {
      if (ev.target === ev.currentTarget) closeFormModal();
    };
  }
  
  // Validación de fecha de entrega
  const fechaEntrega = document.getElementById('fechaEntrega');
  if (fechaEntrega) {
    fechaEntrega.addEventListener('change', validarFechaEntrega);
  }
  
  // Botón cerrar sesión
  const btnCerrarSesion = document.getElementById('btnCerrarSesion');
  if (btnCerrarSesion) {
    btnCerrarSesion.onclick = async (e) => {
      e.preventDefault();
      await cerrarSesion();
    };
  }
  
  // Event listener para cerrar modal de historial
  const histClose = getElement('histClose');
  if (histClose) {
    histClose.onclick = () => {
      getElement('histModal').classList.remove('show');
    };
  }
  
  // Cerrar modal al hacer clic fuera de él
  const histModal = getElement('histModal');
  if (histModal) {
    histModal.onclick = (e) => {
      if (e.target === histModal) {
        histModal.classList.remove('show');
      }
    };
  }
  
  // Establecer fecha por defecto (hoy)
  setFechaHoyDefault();
  
  // ⚠️ NOTA: cargarPedidos() ya se llama en el primer DOMContentLoaded
  // No duplicar la carga aquí
}

// Event listeners para búsqueda y filtros
document.addEventListener('DOMContentLoaded', function() {
  // La autenticación ya está verificada en el HTML (route protection)
  // Si llegamos aquí, el usuario está autenticado
  console.log('🎯 Configurando event listeners de la interfaz...');
  
  // Inicializar la aplicación
  inicializarApp();
  inicializarAppCompleta();
});

// ========================================
// MÓDULO FINANCIERO - RESUMEN DE CAJA
// ========================================

// Función para calcular y actualizar resumen de caja
/**
 * LÓGICA DE RECAUDACIÓN COMPLETA CON PAGO MIXTO
 * Calcula el dinero que el repartidor debe rendir y las ventas totales del local
 * 
 * REGLAS DE NEGOCIO:
 * 
 * 1. DINERO A RENDIR (Repartidor): 
 *    - Todo lo que el chofer trae físicamente (Billetes o Vouchers de Débito)
 * 
 * 2. VENTA TOTAL (Local):
 *    - Suma de todo lo vendido
 * 
 * LÓGICA DE PAGO MIXTO:
 * 
 * Caso 1: 'PM' - Pago Mixto (Pendiente)
 *   - Escenario: Repartidor entregó, pero transferencia NO confirmada
 *   - Busca número en notas (ej: "15000 efectivo resto transf")
 *   - Dinero Repartidor: +15000 (solo efectivo)
 *   - Venta Local: +15000 (solo efectivo, transferencia pendiente)
 * 
 * Caso 2: 'PMP' - Pago Mixto (Pagado)
 *   - Escenario: Local confirmó que llegó la transferencia
 *   - Busca número en notas (ej: "15000 efectivo resto transf")
 *   - Dinero Repartidor: +15000 (solo efectivo físico)
 *   - Venta Local: +30000 (TOTAL COMPLETO, transferencia confirmada)
 * 
 * Pagos Simples:
 *   - 'E' (Efectivo): 100% al Dinero a Rendir y Total Local
 *   - 'DC' (Débito/Crédito): 100% al Dinero a Rendir y Total Local
 *   - 'TP' (Transferencia Pendiente): 100% al Total Local, 0 al Dinero a Rendir
 *   - 'TG' (Transferencia Pagada): 100% al Total Local, 0 al Dinero a Rendir
 * 
 * Fallback: Si no hay número en notas, asume 100% transferencia (protege al chofer)
 */
function actualizarResumenCaja(datos = datosLocal, filtro = 'hoy') {
  let totalEfectivo = 0;
  let totalTarjetas = 0;
  let totalTransferencias = 0;
  let totalPagados = 0; // Solo para mostrar, NO suma al total recaudado
  let cantidadEfectivo = 0;
  let cantidadTarjetas = 0;
  let cantidadTransferencias = 0;
  let cantidadPagados = 0;
  let totalVentaLocal = 0; // NUEVO: Suma de TODAS las ventas (incluye transferencias pagadas)
  
  // NUEVO: Contadores para Pagos Mixtos
  let totalMixtos = 0;
  let totalMixtosPendientes = 0;
  let totalMixtosPagados = 0;
  let cantidadMixtosPendientes = 0;
  let cantidadMixtosPagados = 0;
  let efectivoEnMixtos = 0; // Efectivo dentro de pagos mixtos
  let transferenciaEnMixtos = 0; // Transferencias dentro de pagos mixtos

  // Obtener rango de fechas según filtro
  const { desde, hasta } = obtenerRangoFechas(filtro);

  datos.forEach((pedido) => {
    // Solo contar pedidos entregados Y NO anulados
    if (pedido.entregado && pedido.estado !== 'ANULADO') {
      const metodo = pedido.metodo_pago || pedido.metodo || 'E';
      
      // ============================================================
      // LÓGICA DE FECHA DE CONTABILIZACIÓN
      // ============================================================
      // Las transferencias cuentan para el día que fueron CONFIRMADAS/PAGADAS,
      // NO para el día que se entregaron
      let fechaContabilizar;
      const esTransferencia = ['TP', 'TG', 'T'].includes(metodo) || metodo.includes('TRANSF');
      
      if (esTransferencia && pedido.boleteada && pedido.fecha_boleta) {
        // CASO 1: TP→TG (cambiado a pagada) → cuenta día de CONFIRMACIÓN
        fechaContabilizar = new Date(pedido.fecha_boleta);
        console.log(`💰 Transferencia CONFIRMADA: ${pedido.nombre} - $${pedido.total} cuenta para ${fechaContabilizar.toLocaleDateString('es-CL')}`);
      } else if (metodo === 'TG') {
        // CASO 2: TG (Transferencia Pagada) → cuenta día cuando se CONFIRMÓ el pago
        if (pedido.fecha_boleta) {
          // fecha_boleta puede venir como "YYYY-MM-DD" (parsear como local para evitar bug de UTC)
          const fb = pedido.fecha_boleta;
          fechaContabilizar = fb.length === 10
            ? new Date(fb + 'T00:00:00')
            : new Date(fb);
          console.log(`✅ Transferencia PAGADA con fecha_boleta: ${pedido.nombre} - $${pedido.total} cuenta para ${fechaContabilizar.toLocaleDateString('es-CL')}`);
        } else if (pedido.updated_at) {
          // Usar fecha de actualización (cuando se marcó como entregado/pagado)
          fechaContabilizar = new Date(pedido.updated_at);
          console.log(`✅ Transferencia PAGADA (updated_at): ${pedido.nombre} - $${pedido.total} cuenta para ${fechaContabilizar.toLocaleDateString('es-CL')}`);
        } else {
          // Fallback a fecha del pedido
          fechaContabilizar = new Date(pedido.fecha + 'T00:00:00');
          console.log(`✅ Transferencia PAGADA (fecha): ${pedido.nombre} - $${pedido.total} cuenta para ${fechaContabilizar.toLocaleDateString('es-CL')}`);
        }
      } else if (metodo === 'TP' || metodo === 'T') {
        // CASO 3: TP sin confirmar → SÍ aparece en resumen (sección Pendientes) pero NO suma al chofer
        fechaContabilizar = new Date(pedido.fecha + 'T00:00:00');
        console.log(`⏳ Transferencia PENDIENTE: ${pedido.nombre} - $${pedido.total} aparece en resumen pero no suma a rendir`);
      } else {
        // CASO 4: Otros métodos (E, DC) → cuenta día de ENTREGA
        fechaContabilizar = new Date(pedido.fecha + 'T00:00:00');
      }
      
      // Filtrar por rango de fechas
      if (fechaContabilizar < desde || fechaContabilizar >= hasta) return;
      
      // Compatibilidad: intentar obtener el total de diferentes campos
      let total = 0;
      if (pedido.total && typeof pedido.total === 'number') {
        total = pedido.total;
      } else if (pedido.total && typeof pedido.total === 'string') {
        total = parseInt(pedido.total) || 0;
      } else if (pedido.precio && typeof pedido.precio === 'number') {
        total = pedido.precio;
      } else if (pedido.precio && typeof pedido.precio === 'string') {
        total = parseInt(pedido.precio) || 0;
      }
      
      if (total > 0) {
        const notas = pedido.notas || '';
        
        // ============================================================
        // LÓGICA DE PAGO MIXTO REFINADA
        // ============================================================
        
        // CASO 1: PAGO MIXTO PENDIENTE (PM)
        // La transferencia NO está confirmada aún
        // - Dinero Repartidor: Solo el efectivo
        // - Venta Local: Solo el efectivo (la transferencia no cuenta hasta confirmarse)
        if (metodo === 'PM') {
          const patronNumero = /(\d+[\.,]?\d*)\s*(?:efectivo|efec|pesos|$)/i;
          const match = notas.match(patronNumero);
          
          if (match) {
            const montoEfectivo = parseInt(match[1].replace(/[,\.]/g, '')) || 0;
            const montoTransferencia = total - montoEfectivo;
            
            // NUEVO: Contabilizar como PAGO MIXTO (NO entra a efectivo ni transferencias)
            totalMixtosPendientes += total;
            cantidadMixtosPendientes++;
            efectivoEnMixtos += montoEfectivo;
            transferenciaEnMixtos += montoTransferencia;
            
            // Para Total a Rendir: suma el efectivo físico
            totalEfectivo += montoEfectivo;
            
            // Venta Local: +efectivo (NO suma transferencia porque está pendiente)
            totalVentaLocal += montoEfectivo;
            
            console.log(`📝 Pago Mixto PENDIENTE: $${montoEfectivo} efectivo + $${montoTransferencia} transf (pendiente) | Total: $${total}`);
          } else {
            // FALLBACK: Sin número en notas, asumir 100% transferencia pendiente
            console.warn(`⚠️ Pago Mixto Pendiente sin monto. Asumiendo todo transferencia. Notas: "${notas}"`);
            
            totalMixtosPendientes += total;
            cantidadMixtosPendientes++;
            transferenciaEnMixtos += total;
            // NO suma a Venta Local (pendiente de confirmar)
            
            if (!window.alertaPagoMixtoPendienteMostrada) {
              window.alertaPagoMixtoPendienteMostrada = true;
              setTimeout(() => {
                alert(`⚠️ ATENCIÓN: Pago Mixto Pendiente sin monto en notas.\n\nPor seguridad, se asumió como 100% transferencia.\n\nEscribe en notas: "15000 efectivo resto transf"`);
              }, 500);
            }
          }
        }
        
        // CASO 2: PAGO MIXTO PAGADO (PMP)
        // La transferencia YA está confirmada
        // - Dinero Repartidor: Solo el efectivo (sigue igual)
        // - Venta Local: TOTAL COMPLETO (efectivo + transferencia confirmada)
        else if (metodo === 'PMP') {
          const patronNumero = /(\d+[\.,]?\d*)\s*(?:efectivo|efec|pesos|$)/i;
          const match = notas.match(patronNumero);
          
          if (match) {
            const montoEfectivo = parseInt(match[1].replace(/[,\.]/g, '')) || 0;
            const montoTransferencia = total - montoEfectivo;
            
            // NUEVO: Contabilizar como PAGO MIXTO (NO entra a efectivo ni pagados)
            totalMixtosPagados += total;
            cantidadMixtosPagados++;
            efectivoEnMixtos += montoEfectivo;
            transferenciaEnMixtos += montoTransferencia;
            
            // Para Total a Rendir: suma el efectivo físico
            totalEfectivo += montoEfectivo;
            
            // Venta Local: +TOTAL COMPLETO (efectivo + transferencia confirmada)
            totalVentaLocal += total;
            
            console.log(`✅ Pago Mixto PAGADO: $${montoEfectivo} efectivo + $${montoTransferencia} transf (confirmada) | Total: $${total}`);
          } else {
            // FALLBACK: Sin número, asumir 100% transferencia pagada
            console.warn(`⚠️ Pago Mixto Pagado sin monto. Asumiendo todo transferencia. Notas: "${notas}"`);
            
            totalMixtosPagados += total;
            cantidadMixtosPagados++;
            transferenciaEnMixtos += total;
            totalVentaLocal += total; // Suma al Total Local (ya está confirmado)
            
            if (!window.alertaPagoMixtoPagadoMostrada) {
              window.alertaPagoMixtoPagadoMostrada = true;
              setTimeout(() => {
                alert(`⚠️ ATENCIÓN: Pago Mixto Pagado sin monto en notas.\n\nSe asumió como 100% transferencia.\n\nEscribe en notas: "15000 efectivo resto transf"`);
              }, 500);
            }
          }
        }
        
        // CASO 3: Detectar pago mixto antiguo (con emojis) - COMPATIBILIDAD
        else if (notas.includes('� PAGO MIXTO:') || notas.includes('PAGO MIXTO:')) {
          const efectivoMatch = notas.match(/💵 Efectivo: \$?([\d,.]+)/);
          const tarjetaMatch = notas.match(/💳 Tarjeta: \$?([\d,.]+)/);
          const transferenciaMatch = notas.match(/🔄 Transferencia: \$?([\d,.]+)/);
          const transferenciaPagadaMatch = notas.match(/✅ Transferencia PAGADA: \$?([\d,.]+)/);
          
          if (efectivoMatch) {
            const montoEfectivo = parseInt(efectivoMatch[1].replace(/[,\.]/g, '')) || 0;
            totalEfectivo += montoEfectivo;
            efectivoEnMixtos += montoEfectivo;
            // NO incrementar cantidadEfectivo: el pedido se cuenta en Pago Mixto
          }
          
          if (tarjetaMatch) {
            const montoTarjeta = parseInt(tarjetaMatch[1].replace(/[,\.]/g, '')) || 0;
            totalTarjetas += montoTarjeta;
            // NO incrementar cantidadTarjetas: el pedido se cuenta en Pago Mixto
          }
          
          // Si la transferencia está PAGADA, va a "Transf. Pagadas"
          if (transferenciaPagadaMatch) {
            const montoTransferencia = parseInt(transferenciaPagadaMatch[1].replace(/[,\.]/g, '')) || 0;
            totalPagados += montoTransferencia;
            transferenciaEnMixtos += montoTransferencia;
            // NO incrementar cantidadPagados
          } else if (transferenciaMatch) {
            // Si está pendiente, va a "Transf. Pendientes"
            const montoTransferencia = parseInt(transferenciaMatch[1].replace(/[,\.]/g, '')) || 0;
            totalTransferencias += montoTransferencia;
            transferenciaEnMixtos += montoTransferencia;
            // NO incrementar cantidadTransferencias
          }
          
          // Contar el pedido completo en Pago Mixto
          totalMixtosPendientes += total;
          cantidadMixtosPendientes++;
          
          totalVentaLocal += total;
        }
        
        // CASO 4: Pagos simples (Efectivo, Débito, Transferencia, etc.)
        else {
          switch(metodo) {
            case 'E':     // Efectivo
              totalEfectivo += total;
              cantidadEfectivo++;
              totalVentaLocal += total;
              break;
            case 'DC':    // Débito/Crédito
            case 'D':     // Débito (compatibilidad)
            case 'C':     // Crédito (compatibilidad) 
              totalTarjetas += total;
              cantidadTarjetas++;
              totalVentaLocal += total;
              break;
            case 'T':     // Transferencia (compatibilidad)
            case 'TP':    // Transferencia Pendiente
              totalTransferencias += total;
              cantidadTransferencias++;
              totalVentaLocal += total;
              break;
            case 'TG':    // Transferencia Pagada
              totalPagados += total;
              cantidadPagados++;
              totalVentaLocal += total;
              break;
            case 'P':     // Pagado genérico (legacy): suma al Total Local pero NO a efectivo (no es cobro físico)
            case 'PE':    // Pagado Local - Efectivo: el dinero ya está en el local
            case 'PC':    // Pagado Local - Tarjeta: el cargo ya fue procesado en el local
            case 'PX':    // Pagado Local - Mixto: combinación ef + tarjeta en el local
              totalVentaLocal += total;
              break;
            default:
              // Método desconocido: suma al Total Local pero no a ningún contador específico
              totalVentaLocal += total;
          }
        }
      }
    }
  });

  // Actualizar UI con totales recaudados
  const totalEfectivoEl = document.getElementById('totalEfectivo');
  const totalTarjetasEl = document.getElementById('totalTarjetas');
  const totalTransferenciasEl = document.getElementById('totalTransferencias');
  const totalPagadosEl = document.getElementById('totalPagados');
  
  const cantidadEfectivoEl = document.getElementById('cantidadEfectivo');
  const cantidadTarjetasEl = document.getElementById('cantidadTarjetas');
  const cantidadTransferenciasEl = document.getElementById('cantidadTransferencias');
  const cantidadPagadosEl = document.getElementById('cantidadPagados');
  
  if (totalEfectivoEl) {
    totalEfectivoEl.textContent = `$${totalEfectivo.toLocaleString('es-CL')}`;
  }
  if (cantidadEfectivoEl) {
    cantidadEfectivoEl.textContent = `${cantidadEfectivo} pedido${cantidadEfectivo !== 1 ? 's' : ''}`;
  }
  
  if (totalTarjetasEl) {
    totalTarjetasEl.textContent = `$${totalTarjetas.toLocaleString('es-CL')}`;
  }
  if (cantidadTarjetasEl) {
    cantidadTarjetasEl.textContent = `${cantidadTarjetas} pedido${cantidadTarjetas !== 1 ? 's' : ''}`;
  }
  
  if (totalTransferenciasEl) {
    totalTransferenciasEl.textContent = `$${totalTransferencias.toLocaleString('es-CL')}`;
  }
  if (cantidadTransferenciasEl) {
    cantidadTransferenciasEl.textContent = `${cantidadTransferencias} pedido${cantidadTransferencias !== 1 ? 's' : ''}`;
  }
  
  // Mostrar monto de pagados para CUADRE DE CAJA (pero NO suma al total recaudado)
  if (totalPagadosEl) {
    totalPagadosEl.textContent = `$${totalPagados.toLocaleString('es-CL')}`;
  }
  if (cantidadPagadosEl) {
    cantidadPagadosEl.textContent = `${cantidadPagados} pedido${cantidadPagados !== 1 ? 's' : ''}`;
  }
  
  // NUEVO: PAGOS MIXTOS (tarjeta separada)
  totalMixtos = totalMixtosPendientes + totalMixtosPagados;
  const cantidadMixtos = cantidadMixtosPendientes + cantidadMixtosPagados;
  
  const totalMixtosEl = document.getElementById('totalMixtos');
  const cantidadMixtosEl = document.getElementById('cantidadMixtos');
  const detalleEfectivoMixtosEl = document.getElementById('detalleEfectivoMixtos');
  const detalleTransferenciaMixtosEl = document.getElementById('detalleTransferenciaMixtos');
  
  if (totalMixtosEl) {
    totalMixtosEl.textContent = `$${totalMixtos.toLocaleString('es-CL')}`;
  }
  if (cantidadMixtosEl) {
    cantidadMixtosEl.textContent = `${cantidadMixtos} pedido${cantidadMixtos !== 1 ? 's' : ''}`;
  }
  if (detalleEfectivoMixtosEl) {
    detalleEfectivoMixtosEl.textContent = `💵 Efectivo: $${efectivoEnMixtos.toLocaleString('es-CL')}`;
  }
  if (detalleTransferenciaMixtosEl) {
    detalleTransferenciaMixtosEl.textContent = `🔄 Transf: $${transferenciaEnMixtos.toLocaleString('es-CL')} (${cantidadMixtosPendientes}⏳ ${cantidadMixtosPagados}✅)`;
  }
  
  // TOTAL A RENDIR = Solo efectivo + tarjetas (lo que el chofer trae físicamente)
  // EXCLUYE transferencias (van al banco) y pagados (ya están en el local)
  const totalARendir = totalEfectivo + totalTarjetas;
  const totalRendirEl = document.getElementById('totalRendir');
  if (totalRendirEl) {
    totalRendirEl.textContent = `$${totalARendir.toLocaleString('es-CL')}`;
  }
  
  // NUEVO: TOTAL LOCAL (VENTA TOTAL DEL NEGOCIO)
  // Incluye TODO: efectivo + tarjetas + transferencias + pagados
  const totalLocalEl = document.getElementById('totalLocal');
  if (totalLocalEl) {
    totalLocalEl.textContent = `$${totalVentaLocal.toLocaleString('es-CL')}`;
  }
  
  // Mantener compatibilidad con totalGeneral (por si se usa en otra parte)
  const totalGeneralEl = document.getElementById('totalGeneral');
  if (totalGeneralEl) {
    totalGeneralEl.textContent = `$${totalARendir.toLocaleString('es-CL')}`;
  }
  
  // NUEVO: Actualizar badge del período
  const badgePeriodo = document.getElementById('badgePeriodoResumen');
  if (badgePeriodo) {
    let textoPeriodo = 'HOY';
    let colorPeriodo = '#3b82f6'; // Azul por defecto
    
    switch(filtro) {
      case 'hoy':
        textoPeriodo = 'HOY';
        colorPeriodo = '#3b82f6'; // Azul
        break;
      case 'manana':
        textoPeriodo = 'MAÑANA';
        colorPeriodo = '#8b5cf6'; // Púrpura
        break;
      case 'mes':
        textoPeriodo = 'MES';
        colorPeriodo = '#10b981'; // Verde
        break;
      case 'todo':
        textoPeriodo = 'TODO';
        colorPeriodo = '#6b7280'; // Gris
        break;
      default:
        // Si es una fecha específica (YYYY-MM-DD)
        if (filtro && filtro.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const fecha = new Date(filtro + 'T00:00:00');
          const dia = String(fecha.getDate()).padStart(2, '0');
          const mes = String(fecha.getMonth() + 1).padStart(2, '0');
          textoPeriodo = `${dia}/${mes}`;
          colorPeriodo = '#f59e0b'; // Naranja
        } else {
          textoPeriodo = 'HOY';
          colorPeriodo = '#3b82f6';
        }
    }
    
    badgePeriodo.textContent = textoPeriodo;
    badgePeriodo.style.background = colorPeriodo;
  }
}

// Función para obtener el texto del precio según el método de pago
function obtenerTextoVenta(pedido) {
  // Si es transferencia pagada o método pagado
  if (pedido.metodo_pago === 'TG' || pedido.metodo_pago === 'P' || pedido.metodo_pago === 'PE' || pedido.metodo_pago === 'PC' || pedido.metodo_pago === 'PX') {
    const total = parseInt(pedido.total) || 0;
    
    if (pedido.metodo_pago === 'TG') {
      // Transferencia pagada: mostrar "PAGADO Transferencia"
      if (total > 0) {
        return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO Transferencia $${total.toLocaleString('es-CL')}</span>`;
      }
      return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO Transferencia</span>`;
    } else if (pedido.metodo_pago === 'PX') {
      // Pagado Local - Mixto
      if (total > 0) {
        return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO 🔀 Mixto $${total.toLocaleString('es-CL')}</span>`;
      }
      return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO 🔀 Mixto</span>`;
    } else {
      // Métodos P / PE / PC (Pagado en local): mostrar "PAGADO" con indicador de método
      const iconoMetodo = pedido.metodo_pago === 'PC' ? '💳' : '💵';
      if (total > 0) {
        return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO ${iconoMetodo} $${total.toLocaleString('es-CL')}</span>`;
      }
      return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO ${iconoMetodo}</span>`;
    }
  }
  
  const total = parseInt(pedido.total) || 0;
  if (total > 0) {
    // Obtener el método de pago para mostrar al repartidor
    const metodo = pedido.metodo_pago || 'E';
    const metodoTexto = METODOS[metodo] || metodo;
    
    // Agregar emoji según método de pago para fácil identificación
    let metodoConIcono = metodoTexto;
    switch(metodo) {
      case 'E':
        metodoConIcono = '💵 Efectivo';
        break;
      case 'DC':
      case 'D': // Compatibilidad
      case 'C': // Compatibilidad
        metodoConIcono = '💳 Débito/Crédito';
        break;
      case 'TP':
      case 'T': // Compatibilidad
        metodoConIcono = '⏳ Transf. Pendiente';
        break;
      default:
        metodoConIcono = `💰 ${metodoTexto}`;
    }
    
    return `$${total.toLocaleString('es-CL')} (${metodoConIcono})`;
  }
  
  // Si no hay total definido pero tampoco hay método, asumimos que está pagado
  if (!pedido.metodo_pago || pedido.metodo_pago === '' || pedido.metodo_pago === null) {
    return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO</span>`;
  }
  
  return '';
}

// ========================================
// HISTORIAL PREVIO PARA NUEVO PEDIDO
// ========================================

let historialTimeout = null;

// Función para buscar historial mientras se escribe el teléfono
async function buscarHistorialPrevio(telefono) {
  const previewEl = document.getElementById('historialPreview');
  const contentEl = document.getElementById('historialContent');
  const countEl = document.getElementById('historialCount');
  const direccionesUnicasEl = document.getElementById('direccionesUnicas');
  const listaDireccionesEl = document.getElementById('listaDirecciones');
  
  if (!telefono || telefono.length < 7) {
    previewEl.style.display = 'none';
    return;
  }
  
  // Mostrar estado de carga
  previewEl.style.display = 'block';
  contentEl.innerHTML = '<div class="historial-loading">🔍 Buscando historial...</div>';
  direccionesUnicasEl.style.display = 'none';
  
  try {
    // Buscar pedidos del cliente por teléfono
    const { data, error } = await supabase_client
      .from('pedidos')
      .select('*')
      .eq('telefono', telefono)
      .order('created_at', { ascending: false })
      .limit(10); // Últimos 10 pedidos para mejor análisis
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      contentEl.innerHTML = '<div class="historial-empty">📝 Cliente nuevo - sin historial previo</div>';
      countEl.textContent = '0 pedidos';
      return;
    }
    
    // Extraer direcciones únicas con contador de frecuencia
    const direccionesMap = new Map();
    const nombresSet = new Set();
    
    data.forEach(pedido => {
      // Recolectar direcciones
      if (pedido.direccion && pedido.direccion.trim()) {
        const dir = pedido.direccion.trim();
        if (direccionesMap.has(dir)) {
          direccionesMap.set(dir, direccionesMap.get(dir) + 1);
        } else {
          direccionesMap.set(dir, 1);
        }
      }
      
      // Recolectar nombres (para usar el más reciente)
      if (pedido.nombre && pedido.nombre.trim()) {
        nombresSet.add(pedido.nombre.trim());
      }
    });
    
    // Convertir a array y ordenar por frecuencia (más usadas primero)
    const direccionesArray = Array.from(direccionesMap.entries())
      .sort((a, b) => b[1] - a[1]);
    
    // Mostrar contador
    countEl.textContent = `${data.length} pedido${data.length !== 1 ? 's' : ''}`;
    
    // Mostrar direcciones únicas si hay más de una
    if (direccionesArray.length > 0) {
      direccionesUnicasEl.style.display = 'block';
      
      let direccionesHTML = '';
      direccionesArray.forEach(([direccion, frecuencia], index) => {
        const nombreMasReciente = nombresSet.values().next().value || 'Cliente';
        const esMasUsada = index === 0;
        
        direccionesHTML += `
          <button class="btn-direccion" onclick="seleccionarDireccion('${direccion.replace(/'/g, "\\'")}', '${nombreMasReciente.replace(/'/g, "\\'")}', ${frecuencia})" type="button">
            <span class="direccion-texto">
              <span>📍</span>
              <span style="flex: 1;">${direccion}</span>
            </span>
            <span class="direccion-badge">${frecuencia} ${frecuencia === 1 ? 'vez' : 'veces'}${esMasUsada ? ' ⭐' : ''}</span>
          </button>
        `;
      });
      
      listaDireccionesEl.innerHTML = direccionesHTML;
    }
    
    // Mostrar historial compacto de pedidos
    let historialHTML = '<div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 2px solid #e0f2fe;"><strong style="color: #1e40af; font-size: 0.85rem;">📋 Últimos Pedidos</strong></div>';
    
    data.slice(0, 5).forEach((pedido, index) => {
      const fecha = pedido.fecha ? new Date(pedido.fecha).toLocaleDateString('es-CL') : 'Sin fecha';
      const productos = Array.isArray(pedido.items) && pedido.items.length 
        ? pedido.items.map(item => `${item.cantidad}× ${item.nombre}`).join(', ')
        : 'Sin productos';
      const total = pedido.total ? `$${pedido.total.toLocaleString('es-CL')}` : '$0';
      const metodoTexto = METODOS[pedido.metodo_pago] || pedido.metodo_pago || 'Efectivo';
      const direccionPedido = pedido.direccion || 'Sin dirección';
      
      historialHTML += `
        <div class="historial-item">
          <div class="historial-item-header">
            <span>📅 ${fecha}</span>
            <span class="historial-item-total">${total}</span>
          </div>
          <div class="historial-item-products">
            📍 ${direccionPedido}<br>
            🛒 ${productos}<br>
            💳 ${metodoTexto} ${pedido.entregado ? '• ✅ Entregado' : '• ⏳ Pendiente'}
          </div>
        </div>
      `;
    });
    
    contentEl.innerHTML = historialHTML;
    
  } catch (error) {
    console.error('Error buscando historial:', error);
    contentEl.innerHTML = '<div class="historial-empty">❌ Error al cargar historial</div>';
    countEl.textContent = 'Error';
  }
}

/**
 * Seleccionar una dirección específica del historial
 * @param {string} direccion - Dirección seleccionada
 * @param {string} nombre - Nombre del cliente
 * @param {number} frecuencia - Veces que se usó esta dirección
 */
function seleccionarDireccion(direccion, nombre, frecuencia) {
  // Copiar nombre
  const nombreInput = document.getElementById('nombre');
  if (nombreInput && nombre) {
    nombreInput.value = nombre;
    resaltarCampoAutocompletado(nombreInput);
  }
  
  // Copiar dirección
  const direccionInput = document.getElementById('direccion');
  if (direccionInput && direccion) {
    direccionInput.value = direccion;
    resaltarCampoAutocompletado(direccionInput);
  }
  
  // Mostrar checkbox de confirmación
  mostrarCheckboxConfirmacion();
  
  // Desmarcar el checkbox para forzar confirmación
  const checkbox = document.getElementById('checkboxConfirmacionDireccion');
  if (checkbox) {
    checkbox.checked = false;
  }
  
  // Mostrar notificación de éxito
  const mensajeFrecuencia = frecuencia > 1 ? ` (usada ${frecuencia} veces)` : ' (dirección nueva)';
  ErrorHandler.mostrarExito(`✅ Dirección seleccionada${mensajeFrecuencia}\n⚠️ VERIFICA que sea correcta para este pedido`);
  
  // Enfocar el campo de fecha para continuar
  const fechaInput = document.getElementById('fechaEntrega');
  if (fechaInput) {
    setTimeout(() => fechaInput.focus(), 300);
  }
}

/**
 * Resaltar visualmente un campo que fue autocompletado
 * @param {HTMLElement} inputElement - Campo a resaltar
 */
function resaltarCampoAutocompletado(inputElement) {
  if (!inputElement) return;
  
  // Agregar clase de animación
  inputElement.classList.add('campo-autocompletado');
  
  // Remover la clase después de la animación (4.5 segundos = 3 ciclos de 1.5s)
  setTimeout(() => {
    inputElement.classList.remove('campo-autocompletado');
  }, 4500);
}

/**
 * Mostrar el checkbox de confirmación de dirección
 */
function mostrarCheckboxConfirmacion() {
  const container = document.getElementById('checkboxConfirmacionContainer');
  if (container) {
    container.style.display = 'block';
    
    // Animar la aparición
    container.style.opacity = '0';
    container.style.transform = 'translateY(-10px)';
    
    setTimeout(() => {
      container.style.transition = 'all 0.3s ease-out';
      container.style.opacity = '1';
      container.style.transform = 'translateY(0)';
    }, 50);
  }
}

/**
 * Ocultar el checkbox de confirmación de dirección
 */
function ocultarCheckboxConfirmacion() {
  const container = document.getElementById('checkboxConfirmacionContainer');
  const checkbox = document.getElementById('checkboxConfirmacionDireccion');
  
  if (container) {
    container.style.display = 'none';
  }
  
  if (checkbox) {
    checkbox.checked = false;
  }
}

// Event listener para el campo teléfono
function configurarBusquedaHistorial() {
  const telefonoInput = document.getElementById('telefono');
  const direccionInput = document.getElementById('direccion');
  
  if (!telefonoInput) return;
  
  telefonoInput.addEventListener('input', function() {
    const telefono = this.value.replace(/\D/g, ''); // Solo números
    
    // Cancelar búsqueda anterior
    if (historialTimeout) {
      clearTimeout(historialTimeout);
    }
    
    // Buscar con delay para evitar muchas consultas
    historialTimeout = setTimeout(() => {
      buscarHistorialPrevio(telefono);
    }, 500); // Esperar 500ms después de dejar de escribir
  });
  
  // Listener para detectar cuando el usuario modifica manualmente la dirección
  if (direccionInput) {
    direccionInput.addEventListener('input', function() {
      // Si el usuario escribe manualmente, ocultar el checkbox de confirmación
      // (solo si el campo tenía la clase de autocompletado)
      if (this.classList.contains('campo-autocompletado')) {
        this.classList.remove('campo-autocompletado');
        ocultarCheckboxConfirmacion();
      }
    });
  }
  
  // Limpiar historial cuando se limpia el teléfono
  telefonoInput.addEventListener('blur', function() {
    if (!this.value.trim()) {
      document.getElementById('historialPreview').style.display = 'none';
    }
  });
}

// ========================================
// MÓDULO DE RESUMEN DE CARGA (PICKING LIST)
// ========================================

/**
 * Extraer cantidades de productos del texto usando regex
 * Detecta patrones como: "2x Dog Chow", "3 Cat Chow", "1- Royal Canin"
 */
function extraerCantidadProducto(textoProducto) {
  // Limpiar y normalizar texto
  const texto = textoProducto.trim();
  
  // Patrones de cantidad: "2x", "3 ", "1-", etc.
  const patronCantidad = /^(\d+)\s*[x×\-\s]/i;
  const match = texto.match(patronCantidad);
  
  if (match) {
    const cantidad = parseInt(match[1]);
    // Remover la cantidad del nombre del producto
    const nombreProducto = texto.replace(patronCantidad, '').trim();
    return { cantidad, nombre: nombreProducto };
  }
  
  // Si no encuentra patrón, asumir cantidad 1
  return { cantidad: 1, nombre: texto };
}

/**
 * Normalizar nombre de producto para agrupar similares
 */
function normalizarNombreProducto(nombre) {
  return nombre
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_') // Reemplazar caracteres especiales por guión bajo
    .replace(/_+/g, '_') // Evitar múltiples guiones bajos consecutivos
    .replace(/^_|_$/g, ''); // Remover guiones bajos al inicio/final
}

// Normalizar ID de pedido para uso en HTML
function normalizarPedidoId(pedidoId) {
  if (!pedidoId) return 'sin_id';
  return String(pedidoId)
    .replace(/[^a-zA-Z0-9]/g, '_') // Reemplazar caracteres especiales
    .replace(/_+/g, '_') // Evitar múltiples guiones bajos
    .replace(/^_|_$/g, ''); // Limpiar inicio/final
}

function crearCheckboxIdLegacy(pedidoId, nombreProducto) {
  return `chk_${normalizarPedidoId(pedidoId)}_${normalizarNombreProducto(nombreProducto)}`;
}

function crearCheckboxIdCarga(pedidoId, item, itemIndex = 0) {
  const nombreProducto = item?.nombre || item?.nombre_producto || 'producto_sin_nombre';
  const productoId = item?.producto_id || item?.productoId || null;
  const productoToken = productoId ? `prod_${productoId}` : 'manual';
  return `chk_${normalizarPedidoId(pedidoId)}_${productoToken}_${itemIndex}_${normalizarNombreProducto(nombreProducto)}`;
}

function crearClaveCompatibilidadCarga(pedidoId, item = {}) {
  const pedidoToken = normalizarPedidoId(pedidoId);
  const cantidad = parseInt(item.cantidad) || 0;

  if (item.producto_id || item.productoId) {
    return `ped_${pedidoToken}_prod_${item.producto_id || item.productoId}_cant_${cantidad}`;
  }

  return `ped_${pedidoToken}_nom_${normalizarNombreProducto(item.nombre || item.nombre_producto || '')}_cant_${cantidad}`;
}

function obtenerCheckboxPersistido(item, itemsMarcados) {
  if (!item) return '';

  if (itemsMarcados.has(item.checkboxId)) {
    return item.checkboxId;
  }

  if (item.legacyCheckboxId && itemsMarcados.has(item.legacyCheckboxId)) {
    return item.legacyCheckboxId;
  }

  if (item.compatKey && itemsMarcadosDetalleCache.has(item.compatKey)) {
    return itemsMarcadosDetalleCache.get(item.compatKey) || '';
  }

  const pedidoId = item.pedidoId || item.pedido_id || '';
  const pedidoCacheKey = normalizarPedidoId(pedidoId);
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
    throw error;
  }

  return Array.isArray(data) ? (data[0] || null) : data;
}

document.addEventListener('DOMContentLoaded', function() {
  // Limpiar localStorage del zoom eliminado
  localStorage.removeItem('app_zoom');
  localStorage.removeItem('app_density'); // Limpieza de densidad removida
  
  // ========================================
  // MEJORA 3: CONTADOR DE PROGRESO
  // ========================================
  // Se actualiza automáticamente en actualizarContadorPedidos()
});



// ========================================
// MEJORA 4: PERSISTENCIA DE MANIFIESTO
// ========================================
// Cache en memoria para items marcados (sincronizado con Supabase)
let itemsMarcadosCache = new Set();
let itemsMarcadosDetalleCache = new Map();
let itemsMarcadosPorPedidoCache = new Map();
const CARGA_LOCAL_STATE_KEY = 'sabrofood_carga_estado';
const CARGA_MARCADOS_PAGE_SIZE = 1000;

function limpiarEstadoLocalCargaLegacy() {
  try {
    localStorage.removeItem(CARGA_LOCAL_STATE_KEY);
  } catch (error) {
    console.error('Error al limpiar estado local legado de carga:', error);
  }
}

/**
 * Cargar items marcados desde Supabase (TODOS LOS USUARIOS VEN LO MISMO)
 * @returns {Promise<Set>} Set con checkboxIds marcados
 */
async function cargarItemsMarcados() {
  try {
    limpiarEstadoLocalCargaLegacy();
    const data = [];
    let desde = 0;

    while (true) {
      const { data: lote, error } = await supabase_client
        .from('carga_marcados')
        .select('checkbox_id, pedido_id, producto_id, cantidad, nombre_producto')
        .eq('marcado', true)
        .order('updated_at', { ascending: false })
        .range(desde, desde + CARGA_MARCADOS_PAGE_SIZE - 1);

      if (error) {
        console.error('Error al cargar items marcados:', error);
        return itemsMarcadosCache;
      }

      data.push(...(lote || []));

      if (!lote || lote.length < CARGA_MARCADOS_PAGE_SIZE) {
        break;
      }

      desde += CARGA_MARCADOS_PAGE_SIZE;
    }
    
    itemsMarcadosCache = new Set(data.map(item => item.checkbox_id));
    itemsMarcadosDetalleCache = new Map();
    itemsMarcadosPorPedidoCache = new Map();
    data.forEach((item) => {
      if (item?.pedido_id) {
        const pedidoCacheKey = normalizarPedidoId(item.pedido_id);
        const listaPedido = itemsMarcadosPorPedidoCache.get(pedidoCacheKey) || [];
        listaPedido.push(item);
        itemsMarcadosPorPedidoCache.set(pedidoCacheKey, listaPedido);
      }

      const compatKey = crearClaveCompatibilidadCarga(item.pedido_id, item);
      itemsMarcadosDetalleCache.set(compatKey, item.checkbox_id);
    });
    return itemsMarcadosCache;
  } catch (e) {
    console.error('Error al cargar items marcados:', e);
    return itemsMarcadosCache;
  }
}

/**
 * Agregar un item a la lista de marcados en Supabase y descontar stock
 * @param {string} checkboxId - ID único del checkbox
 * @param {object} itemInfo - Información del item (pedidoId, productoId, nombre, cantidad)
 */
async function agregarItemMarcado(checkboxId, itemInfo = null) {
  try {
    limpiarEstadoLocalCargaLegacy();

    if (itemInfo) {
      const resultadoRpc = await procesarCambioCargaAtomico(checkboxId, itemInfo, true);
      if (resultadoRpc) {
        itemsMarcadosCache.add(checkboxId);
        const compatKey = crearClaveCompatibilidadCarga(itemInfo.pedidoId, {
          producto_id: itemInfo.productoId,
          cantidad: itemInfo.cantidad,
          nombre_producto: itemInfo.nombre
        });
        itemsMarcadosDetalleCache.set(compatKey, checkboxId);
        return;
      }
    }

    const { data: existente, error: errorExistente } = await supabase_client
      .from('carga_marcados')
      .select('checkbox_id, marcado, pedido_id, producto_id, cantidad, nombre_producto')
      .eq('checkbox_id', checkboxId)
      .maybeSingle();

    if (errorExistente) {
      console.error('Error al verificar item marcado existente:', errorExistente);
      throw errorExistente;
    }

    if (existente?.marcado) {
      itemsMarcadosCache.add(checkboxId);
      if (itemInfo) {
        const compatKey = crearClaveCompatibilidadCarga(itemInfo.pedidoId, {
          producto_id: itemInfo.productoId,
          cantidad: itemInfo.cantidad,
          nombre_producto: itemInfo.nombre
        });
        itemsMarcadosDetalleCache.set(compatKey, checkboxId);
      }
      console.log('ℹ️ Item ya estaba marcado en Supabase, no se vuelve a descontar stock');
      return;
    }

    itemsMarcadosCache.add(checkboxId);
    
    const insertData = { 
      checkbox_id: checkboxId, 
      marcado: true,
      updated_at: new Date().toISOString()
    };
    
    // Guardar info del pedido si está disponible
    if (itemInfo) {
      insertData.pedido_id = itemInfo.pedidoId;
      insertData.producto_id = itemInfo.productoId;
      insertData.cantidad = itemInfo.cantidad;
      insertData.nombre_producto = itemInfo.nombre;
    }
    
    let error = null;

    if (existente) {
      ({ error } = await supabase_client
        .from('carga_marcados')
        .update({
          marcado: true,
          updated_at: insertData.updated_at,
          pedido_id: insertData.pedido_id,
          producto_id: insertData.producto_id,
          cantidad: insertData.cantidad,
          nombre_producto: insertData.nombre_producto
        })
        .eq('checkbox_id', checkboxId));
    } else {
      ({ error } = await supabase_client
        .from('carga_marcados')
        .insert(insertData));
    }
    
    if (error) {
      console.error('Error al marcar item:', error);
      itemsMarcadosCache.delete(checkboxId);
      throw error;
    }
    
    console.log('✅ Item guardado en carga_marcados exitosamente');

    if (itemInfo) {
      const compatKey = crearClaveCompatibilidadCarga(itemInfo.pedidoId, {
        producto_id: itemInfo.productoId,
        cantidad: itemInfo.cantidad,
        nombre_producto: itemInfo.nombre
      });
      itemsMarcadosDetalleCache.set(compatKey, checkboxId);
    }
    
    // ⚡ DESCUENTO DE STOCK: Si hay producto_id, descontar stock (error no es crítico)
    if (itemInfo && itemInfo.productoId) {
      console.log('⏳ Intentando descontar stock...');
      try {
        await descontarStockItem(itemInfo);
      } catch (stockError) {
        console.warn('⚠️ No se pudo descontar stock, pero el item quedó marcado:', stockError);
        // NO bloqueamos el flujo - el checkbox ya está guardado
      }
    } else if (itemInfo) {
      console.warn('⚠️ Item sin producto_id - No se descuenta stock (producto manual o antiguo)');
    }
    
  } catch (e) {
    console.error('❌ Error CRÍTICO al guardar en carga_marcados:', e);
    itemsMarcadosCache.delete(checkboxId);
    throw e; // Re-lanzar para que handleCheckboxChange lo maneje
  }
}

/**
 * Descontar stock de UN SOLO producto al marcarlo en carga
 * @param {object} itemInfo - {productoId, cantidad, nombre, pedidoId}
 */
async function descontarStockItem(itemInfo) {
  try {
    console.log(`🔄 Intentando descontar stock de "${itemInfo.nombre}" (${itemInfo.cantidad} unid.)...`);
    
    // Validar que productoId existe
    if (!itemInfo.productoId || itemInfo.productoId <= 0) {
      console.warn(`⚠️ producto_id inválido (${itemInfo.productoId}), omitiendo descuento de stock`);
      return;
    }
    
    // Obtener stock actual
    const { data: producto, error: errorGet } = await supabase_client
      .from('productos')
      .select('stock, nombre')
      .eq('id', itemInfo.productoId)
      .maybeSingle(); // maybeSingle() no lanza error si no existe
    
    if (errorGet) {
      console.error(`❌ Error al consultar producto ${itemInfo.productoId}:`, errorGet);
      console.warn('⚠️ El checkbox se guardó pero no se pudo verificar el stock');
      console.warn('   Verifica las políticas RLS de la tabla "productos"');
      return;
    }
    
    if (!producto) {
      console.warn(`⚠️ Producto ID ${itemInfo.productoId} no existe en la tabla "productos"`);
      console.warn('   El checkbox se guardó correctamente, pero no hay stock que descontar');
      return;
    }
    
    const stockAnterior = Math.floor(producto.stock || 0);
    const nuevoStock = stockAnterior - itemInfo.cantidad;
    
    console.log(`   Stock: ${stockAnterior} → ${nuevoStock}`);
    
    // Advertencia si quedará negativo
    if (nuevoStock < 0) {
      console.warn(`⚠️ ADVERTENCIA: Stock quedará negativo (${nuevoStock}). Descontando igual...`);
    }
    
    // Actualizar stock
    const { error: errorUpdate } = await supabase_client
      .from('productos')
      .update({ stock: nuevoStock })
      .eq('id', itemInfo.productoId);
    
    if (errorUpdate) {
      console.error(`❌ Error actualizando stock:`, errorUpdate);
      console.error('   Detalles:', JSON.stringify(errorUpdate, null, 2));
      console.warn('⚠️ El checkbox se guardó pero el stock NO se descontó');
      return;
    }
    
    // Registrar movimiento (si falla, solo warning)
    const { error: errorMov } = await supabase_client
      .from('movimientos_stock')
      .insert([{
        producto_id: itemInfo.productoId,
        pedido_id: itemInfo.pedidoId,
        tipo: 'SALIDA',
        cantidad: itemInfo.cantidad,
        stock_anterior: stockAnterior,
        stock_nuevo: nuevoStock,
        usuario: 'sistema_carga',
        motivo: `Bulto cargado para reparto`
      }]);
    
    if (errorMov) {
      console.warn('⚠️ Stock descontado pero no se registró en historial:', errorMov);
    }
    
    console.log(`✅ Stock descontado exitosamente: ${itemInfo.nombre} (${stockAnterior} → ${nuevoStock})`);
    
  } catch (error) {
    console.error('❌ Excepción en descontarStockItem:', error);
    console.warn('⚠️ El checkbox se guardó pero hubo un problema con el stock');
    // No re-lanzamos el error para no bloquear el guardado del checkbox
  }
}

/**
 * Devolver stock cuando se desmarca un item de carga
 * @param {string} checkboxId - ID del checkbox
 */
async function devolverStockItem(itemOrigen) {
  try {
    const data = typeof itemOrigen === 'string'
      ? await (async () => {
          const { data: itemData, error } = await supabase_client
            .from('carga_marcados')
            .select('pedido_id, producto_id, cantidad, nombre_producto')
            .eq('checkbox_id', itemOrigen)
            .single();

          if (error) {
            throw error;
          }

          return itemData;
        })()
      : itemOrigen;

    if (!data || !data.producto_id) {
      console.log('⚠️ Item no tiene producto_id, no se devuelve stock');
      return;
    }
    
    console.log(`♻️ Devolviendo stock de "${data.nombre_producto}" (${data.cantidad} unid.)`);
    
    // Obtener stock actual
    const { data: producto, error: errorGet } = await supabase_client
      .from('productos')
      .select('stock, nombre')
      .eq('id', data.producto_id)
      .single();
    
    if (errorGet) {
      console.error(`❌ Error obteniendo producto:`, errorGet);
      console.warn('⚠️ El item fue desmarcado pero no se pudo devolver stock');
      return;
    }
    
    const stockAnterior = Math.floor(producto.stock || 0);
    const nuevoStock = stockAnterior + data.cantidad;
    
    // Actualizar stock
    const { error: errorUpdate } = await supabase_client
      .from('productos')
      .update({ stock: nuevoStock })
      .eq('id', data.producto_id);
    
    if (errorUpdate) {
      console.error(`❌ Error devolviendo stock:`, errorUpdate);
      console.warn('⚠️ Verifica permisos RLS en la tabla productos');
      return;
    }
    
    // 🗑️ ELIMINAR el movimiento de stock original (SALIDA) en vez de crear DEVOLUCION
    console.log(`🗑️ Eliminando movimiento de stock del historial...`);
    const { error: errorDelete } = await supabase_client
      .from('movimientos_stock')
      .delete()
      .eq('producto_id', data.producto_id)
      .eq('pedido_id', data.pedido_id)
      .eq('tipo', 'SALIDA')
      .eq('cantidad', data.cantidad);
    
    if (errorDelete) {
      console.warn('⚠️ No se pudo eliminar movimiento (no crítico):', errorDelete);
    }
    
    console.log(`✅ Stock devuelto: ${data.nombre_producto} (${stockAnterior} → ${nuevoStock})`);
    
  } catch (e) {
    console.error('❌ Error en devolverStockItem:', e);
    console.warn('⚠️ El item fue desmarcado pero hubo un problema con el stock');
  }
}

/**
 * Devolver stock de TODOS los items marcados de un pedido (al anular pedido)
 * @param {string} pedidoId - ID del pedido anulado
 * @param {object} pedido - Objeto completo del pedido (opcional, para mejor logging)
 */
async function devolverStockItemsMarcados(pedidoId, pedido = null) {
  try {
    console.log(`♻️ Verificando items marcados del pedido ${pedidoId} para devolver stock...`);
    
    // Devolver solo los items que siguen marcados al momento de eliminar el pedido
    const { data: itemsMarcados, error } = await supabase_client
      .from('carga_marcados')
      .select('checkbox_id, producto_id, cantidad, nombre_producto')
      .eq('pedido_id', pedidoId)
      .eq('marcado', true);
    
    if (error) {
      console.error('❌ Error consultando items marcados:', error);
      return;
    }
    
    if (!itemsMarcados || itemsMarcados.length === 0) {
      console.log('ℹ️ El pedido no tiene items marcados en carga - no hay stock para devolver');
      return;
    }
    
    console.log(`📦 Encontrados ${itemsMarcados.length} items marcados - Devolviendo stock...`);
    
    // Devolver stock de cada item marcado
    let itemsDevueltos = 0;
    for (const item of itemsMarcados) {
      if (!item.producto_id) {
        console.log(`⚠️ Item "${item.nombre_producto}" sin producto_id - omitiendo`);
        continue;
      }
      
      try {
        // Obtener stock actual
        const { data: producto, error: errorGet } = await supabase_client
          .from('productos')
          .select('stock, nombre')
          .eq('id', item.producto_id)
          .single();
        
        if (errorGet) {
          console.error(`❌ Error obteniendo producto ${item.producto_id}:`, errorGet);
          continue;
        }
        
        const stockAnterior = Math.floor(producto.stock || 0);
        const nuevoStock = stockAnterior + item.cantidad;
        
        // Actualizar stock
        const { error: errorUpdate } = await supabase_client
          .from('productos')
          .update({ stock: nuevoStock })
          .eq('id', item.producto_id);
        
        if (errorUpdate) {
          console.error(`❌ Error actualizando stock:`, errorUpdate);
          continue;
        }
        
        // 🗑️ ELIMINAR el movimiento de stock original (SALIDA) en vez de crear DEVOLUCION
        const { error: errorDeleteMov } = await supabase_client
          .from('movimientos_stock')
          .delete()
          .eq('producto_id', item.producto_id)
          .eq('pedido_id', pedidoId)
          .eq('tipo', 'SALIDA')
          .eq('cantidad', item.cantidad);
        
        if (errorDeleteMov) {
          console.error(`❌ Error eliminando movimiento:`, errorDeleteMov);
        }
        
        console.log(`  ✅ ${item.nombre_producto}: ${stockAnterior} → ${nuevoStock} (+${item.cantidad})`);
        itemsDevueltos++;
        
      } catch (itemError) {
        console.error(`❌ Error procesando item:`, itemError);
      }
    }
    
    // Eliminar TODOS los registros de carga_marcados de este pedido
    const { error: errorDelete } = await supabase_client
      .from('carga_marcados')
      .delete()
      .eq('pedido_id', pedidoId);
    
    if (errorDelete) {
      console.error('❌ Error eliminando items de carga_marcados:', errorDelete);
    }
    
    console.log(`✅ Stock devuelto exitosamente: ${itemsDevueltos} de ${itemsMarcados.length} items procesados`);
    
  } catch (error) {
    console.error('❌ Error en devolverStockItemsMarcados:', error);
  }
}

/**
 * Eliminar un item de la lista de marcados en Supabase y devolver stock
 * @param {string} checkboxId - ID único del checkbox
 */
async function eliminarItemMarcado(checkboxId) {
  try {
    limpiarEstadoLocalCargaLegacy();

    const { data: existenteRpc, error: errorExistenteRpc } = await supabase_client
      .from('carga_marcados')
      .select('checkbox_id, pedido_id, producto_id, cantidad, nombre_producto')
      .eq('checkbox_id', checkboxId)
      .maybeSingle();

    if (errorExistenteRpc) {
      console.error('❌ Error consultando item para RPC de carga:', errorExistenteRpc);
      throw errorExistenteRpc;
    }

    if (existenteRpc) {
      const resultadoRpc = await procesarCambioCargaAtomico(checkboxId, {
        pedidoId: existenteRpc.pedido_id,
        productoId: existenteRpc.producto_id,
        cantidad: existenteRpc.cantidad,
        nombre: existenteRpc.nombre_producto
      }, false);

      if (resultadoRpc) {
        itemsMarcadosCache.delete(checkboxId);
        if (existenteRpc?.pedido_id) {
          const compatKey = crearClaveCompatibilidadCarga(existenteRpc.pedido_id, existenteRpc);
          itemsMarcadosDetalleCache.delete(compatKey);
        }
        return;
      }
    }

    const { data: existente, error: errorExistente } = await supabase_client
      .from('carga_marcados')
      .select('checkbox_id, pedido_id, producto_id, cantidad, nombre_producto')
      .eq('checkbox_id', checkboxId)
      .maybeSingle();

    if (errorExistente) {
      console.error('❌ Error consultando item a desmarcar:', errorExistente);
      throw errorExistente;
    }

    if (!existente) {
      itemsMarcadosCache.delete(checkboxId);
      console.log('ℹ️ El item ya no existía en carga_marcados');
      return;
    }

    const { data: itemDesmarcado, error: errorUpdate } = await supabase_client
      .from('carga_marcados')
      .update({
        marcado: false,
        updated_at: new Date().toISOString()
      })
      .eq('checkbox_id', checkboxId)
      .eq('marcado', true)
      .select('checkbox_id, pedido_id, producto_id, cantidad, nombre_producto')
      .maybeSingle();

    if (errorUpdate) {
      console.error('❌ Error al actualizar estado de carga_marcados:', errorUpdate);
      throw errorUpdate;
    }

    if (!itemDesmarcado) {
      itemsMarcadosCache.delete(checkboxId);
      if (existente?.pedido_id) {
        const compatKey = crearClaveCompatibilidadCarga(existente.pedido_id, existente);
        itemsMarcadosDetalleCache.delete(compatKey);
      }
      console.log('ℹ️ El item ya había sido desmarcado en otra pestaña o dispositivo');
      return;
    }

    // Intentar devolver el stock (no es crítico si falla)
    try {
      await devolverStockItem(itemDesmarcado);
    } catch (stockError) {
      console.warn('⚠️ Error devolviendo stock, pero continuando con desmarcado:', stockError);
    }
    
    itemsMarcadosCache.delete(checkboxId);
    if (itemDesmarcado?.pedido_id) {
      const compatKey = crearClaveCompatibilidadCarga(itemDesmarcado.pedido_id, itemDesmarcado);
      itemsMarcadosDetalleCache.delete(compatKey);
    }

    console.log('✅ Item desmarcado exitosamente');
    
  } catch (e) {
    console.error('❌ Error CRÍTICO al desmarcar item:', e);
    itemsMarcadosCache.add(checkboxId);
    throw e;
  }
}

/**
 * Limpiar todos los items marcados (útil para nuevo día)
 */
async function limpiarItemsMarcados() {
  try {
    itemsMarcadosCache.clear();
    itemsMarcadosDetalleCache.clear();
    limpiarEstadoLocalCargaLegacy();
    const { error } = await supabase_client
      .from('carga_marcados')
      .delete()
      .neq('checkbox_id', '');
    
    if (error) {
      console.error('Error al limpiar items:', error);
    } else {
      console.log('✅ Items de carga limpiados');
    }
  } catch (e) {
    console.error('Error al limpiar items:', e);
  }
}

// ========================================
// MEJORA 1: MENÚ COMPACTO DE ACCIONES
// ========================================

/**
 * Toggle del menú de acciones (mostrar/ocultar)
 */
function toggleMenuAcciones(menuElement, buttonElement) {
  if (!menuElement) return;
  
  // Cerrar otros menús abiertos
  document.querySelectorAll('.menu-acciones-dropdown').forEach(menu => {
    if (menu !== menuElement) {
      menu.style.display = 'none';
    }
  });
  
  // Toggle del menú actual
  const isVisible = menuElement.style.display === 'block';
  
  if (isVisible) {
    menuElement.style.display = 'none';
  } else {
    // SOLUCIÓN: Mover el menú al body para evitar conflictos de z-index
    if (!menuElement.parentElement || menuElement.parentElement.tagName !== 'BODY') {
      document.body.appendChild(menuElement);
    }
    
    // Calcular posición del botón - MENÚ HACIA LA IZQUIERDA Y ARRIBA
    const button = buttonElement || menuElement.previousElementSibling;
    if (button) {
      const rect = button.getBoundingClientRect();
      // Posicionar a la izquierda del botón y alineado al fondo (bottom)
      const menuHeight = 180; // Altura aproximada del menú
      menuElement.style.top = `${rect.bottom - menuHeight}px`;
      menuElement.style.left = `${rect.left - 190}px`; // 180px de ancho + 10px de margen
    }
    menuElement.style.display = 'block';
  }
}

/**
 * Cerrar menús al hacer clic fuera
 */
document.addEventListener('click', function(e) {
  if (!e.target.closest('.btn-menu-acciones') && !e.target.closest('.menu-acciones-dropdown')) {
    document.querySelectorAll('.menu-acciones-dropdown').forEach(menu => {
      menu.style.display = 'none';
    });
  }
});

// ========================================
// MEJORA 2: BADGE DE PEDIDO NUEVO
// ========================================

/**
 * Verificar si un pedido tiene menos de 1 hora de creado
 * @param {string} created_at - Timestamp de creación
 * @returns {boolean}
 */
function esPedidoNuevo(created_at) {
  if (!created_at) return false;
  
  const ahora = new Date().getTime();
  const fechaCreacion = new Date(created_at).getTime();
  const diferencia = ahora - fechaCreacion;
  const unaHoraMedia = 90 * 60 * 1000; // 1 hora y 30 minutos en milisegundos
  
  // Debug: mostrar en consola para verificar
  console.log(`[DEBUG] Pedido creado: ${new Date(created_at).toLocaleString()}, Hace: ${Math.round(diferencia / 60000)} minutos`);
  
  return diferencia < unaHoraMedia;
}

// ========================================
// MEJORA 3: REPETIR PEDIDO (CLONAR)
// ========================================

/**
 * Clonar un pedido antiguo en el formulario
 * @param {Object} pedidoOriginal - Datos del pedido a repetir
 */
function repetirPedido(pedidoOriginal) {
  // Cerrar modal de historial
  getElement('histModal').classList.remove('show');
  
  // Abrir modal del formulario
  abrirModalFormulario();
  
  // Esperar un momento para que el formulario se renderice
  setTimeout(() => {
    // Rellenar datos del cliente
    const telInput = document.getElementById('telefono');
    const nombreInput = document.getElementById('nombre');
    const direccionInput = document.getElementById('direccion');
    const fechaInput = document.getElementById('fechaEntrega');
    const metodoPagoSelect = document.getElementById('metodoPago');
    const prioridadSelect = document.getElementById('prioridadRuta');
    
    if (telInput) telInput.value = pedidoOriginal.telefono || '';
    if (nombreInput) nombreInput.value = pedidoOriginal.nombre || '';
    if (direccionInput) direccionInput.value = pedidoOriginal.direccion || '';
    
    // Establecer fecha como HOY
    if (fechaInput) {
      const hoy = new Date().toISOString().split('T')[0];
      fechaInput.value = hoy;
    }
    
    // Establecer método de pago y prioridad si existen
    if (metodoPagoSelect && pedidoOriginal.metodo_pago) {
      metodoPagoSelect.value = pedidoOriginal.metodo_pago;
    }
    
    if (prioridadSelect && pedidoOriginal.prioridad) {
      prioridadSelect.value = pedidoOriginal.prioridad;
    }
    
    // Rellenar productos
    if (pedidoOriginal.items && Array.isArray(pedidoOriginal.items)) {
      // Limpiar productos actuales
      productosTemp = [];
      
      // Agregar productos del pedido original
      pedidoOriginal.items.forEach(item => {
        productosTemp.push({
          nombre: item.nombre,
          cantidad: item.cantidad,
          precio: item.precio || 0
        });
      });
      
      // Actualizar visualización de productos
      actualizarListaProductos();
      calcularTotalPedido();
    }
    
    // Mostrar mensaje de confirmación
    ErrorHandler.mostrarExito('✅ Pedido cargado. Revisa los datos y guarda cuando estés listo.');
  }, 100);
}

// ========================================
// MÓDULO DE HISTORIAL COMPLETO
// ========================================

let todosLosPedidos = [];
let pedidosFiltrados = [];
let modoVIP = false;
let historialFiltroTimeout = null;
const HISTORIAL_PAGE_SIZE = 1000;

function escaparHtmlHistorial(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizarTextoHistorial(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function obtenerGrupoMetodoHistorial(pedido) {
  const metodo = String(pedido?.metodo_pago || pedido?.metodo || 'E').trim().toUpperCase();
  const notas = String(pedido?.notas || '');

  if (metodo === 'PM' || metodo === 'PMP' || notas.includes('PAGO MIXTO:')) {
    return 'mixto';
  }

  if (metodo === 'E' || metodo.includes('EFECTIVO')) return 'efectivo';
  if (['DC', 'D', 'C'].includes(metodo) || metodo.includes('TARJETA')) return 'tarjeta';
  if (['TP', 'T'].includes(metodo)) return 'transferencia_pendiente';
  if (metodo === 'TG') return 'transferencia_pagada';
  if (['PE', 'PC', 'PX', 'P'].includes(metodo)) return 'pagado_local';

  return 'otros';
}

function obtenerEstadoHistorial(pedido) {
  if (pedido?.estado === 'ANULADO') return 'anulados';
  if (pedido?.entregado) return 'entregados';
  return 'pendientes';
}

function actualizarResumenHistorialResultados() {
  const textoEl = document.getElementById('historialResultadosTexto');
  const periodoEl = document.getElementById('historialPeriodoTexto');
  const fechaDesde = document.getElementById('fechaDesde')?.value;
  const fechaHasta = document.getElementById('fechaHasta')?.value;

  if (textoEl) {
    textoEl.textContent = `Mostrando ${pedidosFiltrados.length.toLocaleString('es-CL')} pedido(s) de ${todosLosPedidos.length.toLocaleString('es-CL')} cargado(s)`;
  }

  if (periodoEl) {
    if (fechaDesde || fechaHasta) {
      const desdeTexto = fechaDesde || 'inicio';
      const hastaTexto = fechaHasta || 'hoy';
      periodoEl.textContent = `Período: ${desdeTexto} a ${hastaTexto}`;
    } else {
      periodoEl.textContent = 'Período: Todo el historial';
    }
  }
}

function mostrarCargandoHistorial(mensaje = 'Cargando historial...') {
  const contenedor = document.getElementById('modalHistorialCompletoBody');
  if (contenedor) {
    contenedor.innerHTML = `
      <div style="text-align:center;padding:48px 20px;color:#64748b;">
        <div style="font-size:2rem;margin-bottom:12px;">⏳</div>
        <div style="font-size:1rem;font-weight:700;margin-bottom:6px;">${escaparHtmlHistorial(mensaje)}</div>
        <div style="font-size:0.9rem;">Cargando pedidos en bloques para mostrar todo el historial.</div>
      </div>
    `;
  }
}

async function obtenerTodosLosPedidosHistorial(fechaDesde, fechaHasta) {
  let desde = 0;
  let pedidos = [];

  while (true) {
    let query = supabase_client
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false })
      .range(desde, desde + HISTORIAL_PAGE_SIZE - 1);

    if (fechaDesde) {
      query = query.gte('created_at', `${fechaDesde}T00:00:00`);
    }

    if (fechaHasta) {
      query = query.lte('created_at', `${fechaHasta}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const bloque = data || [];
    pedidos = pedidos.concat(bloque);

    if (bloque.length < HISTORIAL_PAGE_SIZE) {
      break;
    }

    desde += HISTORIAL_PAGE_SIZE;
  }

  return pedidos;
}

function exportarHistorialCompletoCSV() {
  if (!pedidosFiltrados.length) {
    ErrorHandler.mostrarWarning('No hay pedidos filtrados para exportar');
    return;
  }

  const encabezados = [
    'Fecha', 'Cliente', 'Telefono', 'Total', 'Metodo', 'Estado', 'Direccion', 'Productos', 'Notas'
  ];

  const filas = pedidosFiltrados.map((pedido) => {
    const fecha = pedido.created_at
      ? new Date(pedido.created_at).toLocaleString('es-CL')
      : '';
    const productos = Array.isArray(pedido.items)
      ? pedido.items.map((item) => `${item.cantidad || 1}x ${item.nombre || ''}`).join(' | ')
      : '';

    return [
      fecha,
      pedido.nombre || '',
      pedido.telefono || '',
      pedido.total || 0,
      pedido.metodo_pago || pedido.metodo || '',
      pedido.estado === 'ANULADO' ? 'ANULADO' : (pedido.entregado ? 'ENTREGADO' : 'PENDIENTE'),
      pedido.direccion || '',
      productos,
      pedido.notas || ''
    ];
  });

  const csv = [encabezados, ...filas]
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

/**
 * Abrir modal de historial completo
 */
async function abrirHistorialCompleto() {
  const modal = document.getElementById('modalHistorialCompleto');
  modal.style.display = 'flex';

  document.getElementById('buscarHistorial').value = '';
  document.getElementById('fechaHasta').value = '';
  document.getElementById('fechaDesde').value = '';
  document.getElementById('filtroMetodoHistorial').value = 'todos';
  document.getElementById('filtroEstadoHistorial').value = 'todos';
  modoVIP = false;
  const btn = document.getElementById('btnToggleVIP');
  if (btn) {
    btn.textContent = '💎 Ranking VIP';
    btn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
  }
  
  // Cargar datos
  await cargarHistorialCompleto();
}

/**
 * Cerrar modal de historial completo
 */
function cerrarHistorialCompleto() {
  const modal = document.getElementById('modalHistorialCompleto');
  modal.style.display = 'none';
  
  // Resetear filtros
  document.getElementById('buscarHistorial').value = '';
  document.getElementById('fechaHasta').value = '';
  document.getElementById('fechaDesde').value = '';
  document.getElementById('filtroMetodoHistorial').value = 'todos';
  document.getElementById('filtroEstadoHistorial').value = 'todos';
  modoVIP = false;
}

/**
 * Cargar todos los pedidos de Supabase
 */
async function cargarHistorialCompleto() {
  try {
    const fechaDesde = document.getElementById('fechaDesde').value;
    const fechaHasta = document.getElementById('fechaHasta').value;
    mostrarCargandoHistorial(fechaDesde || fechaHasta ? 'Cargando historial filtrado por fechas...' : 'Cargando todo el historial...');

    todosLosPedidos = await obtenerTodosLosPedidosHistorial(fechaDesde, fechaHasta);
    aplicarFiltrosHistorial();
    
  } catch (error) {
    console.error('Error inesperado:', error);
    ErrorHandler.mostrarError('Error inesperado al cargar historial');
  }
}

/**
 * Actualizar estadísticas del panel
 */
function actualizarEstadisticas() {
  const totalPedidos = pedidosFiltrados.length;
  const totalRecaudado = pedidosFiltrados.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
  
  // Contar clientes únicos por teléfono
  const telefonosUnicos = new Set(pedidosFiltrados.map(p => p.telefono).filter(t => t));
  const clientesUnicos = telefonosUnicos.size;
  
  const ticketPromedio = totalPedidos > 0 ? Math.round(totalRecaudado / totalPedidos) : 0;
  
  document.getElementById('statTotalPedidos').textContent = totalPedidos.toLocaleString();
  document.getElementById('statTotalRecaudado').textContent = '$' + totalRecaudado.toLocaleString();
  document.getElementById('statClientesUnicos').textContent = clientesUnicos.toLocaleString();
  document.getElementById('statTicketPromedio').textContent = '$' + ticketPromedio.toLocaleString();
}

/**
 * Analizar y mostrar top 5 productos más vendidos
 */
function mostrarTopProductos() {
  const conteoProductos = {};
  
  // Contar productos
  pedidosFiltrados.forEach(pedido => {
    if (pedido.items && Array.isArray(pedido.items)) {
      pedido.items.forEach(item => {
        const nombreVisible = item.nombre || item.nombre_producto || item.producto || 'Producto sin nombre';
        const nombreProducto = nombreVisible.toLowerCase().trim();
        const esGranel = nombreVisible && (
          nombreVisible.toLowerCase().includes('(granel)') || 
          nombreVisible.toLowerCase().includes('granel')
        );
        
        if (!conteoProductos[nombreProducto]) {
          conteoProductos[nombreProducto] = {
            nombre: nombreVisible,
            cantidad: 0,
            ventas: 0,
            esGranel: esGranel
          };
        }
        
        // Productos a granel: cantidad = 1 pedido, ventas = precio (está en item.cantidad)
        // Productos normales: cantidad = item.cantidad, ventas = cantidad * precio
        if (esGranel) {
          conteoProductos[nombreProducto].cantidad += 1; // Contar como 1 pedido
          conteoProductos[nombreProducto].ventas += item.cantidad || 0; // El precio está en cantidad
        } else {
          conteoProductos[nombreProducto].cantidad += item.cantidad || 1;
          conteoProductos[nombreProducto].ventas += (item.cantidad || 1) * (item.precio || 0);
        }
      });
    }
  });
  
  // Ordenar por ventas totales (más representativo para productos a granel)
  const productosOrdenados = Object.values(conteoProductos)
    .sort((a, b) => b.ventas - a.ventas)
    .slice(0, 5);
  
  // Renderizar top 5
  const contenedor = document.getElementById('listaTopProductos');
  
  if (productosOrdenados.length === 0) {
    contenedor.innerHTML = '<div style="color:#6b7280;text-align:center;padding:20px;">No hay productos en el período seleccionado</div>';
    return;
  }
  
  const medallas = ['🥇', '🥈', '🥉'];
  const colores = ['#f59e0b', '#9ca3af', '#cd7f32'];
  
  contenedor.innerHTML = productosOrdenados.map((producto, index) => {
    const etiquetaCantidad = producto.esGranel ? 'Pedidos' : 'Unidades';
    
    return `
    <div style="background:white;padding:16px;border-radius:12px;border:3px solid ${colores[index]};box-shadow:0 4px 6px rgba(0,0,0,0.1);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:2rem;">${medallas[index]}</span>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:1.05rem;color:#1f2937;">${producto.nombre}</div>
          <div style="font-size:0.85rem;color:#6b7280;">Posición #${index + 1}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:2px solid #e5e7eb;">
        <div>
          <div style="font-size:0.8rem;color:#6b7280;">${etiquetaCantidad}</div>
          <div style="font-size:1.3rem;font-weight:700;color:#4b6cb7;">${producto.cantidad}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.8rem;color:#6b7280;">Ventas</div>
          <div style="font-size:1.3rem;font-weight:700;color:#10b981;">$${producto.ventas.toLocaleString()}</div>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

/**
 * Renderizar historial en modo cronológico
 */
function renderizarHistorialCronologico() {
  const contenedor = document.getElementById('modalHistorialCompletoBody');
  
  if (pedidosFiltrados.length === 0) {
    contenedor.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">No se encontraron pedidos</div>';
    return;
  }
  
  const html = `
    <table style="width:100%;border-collapse:collapse;font-size:0.9rem;table-layout:fixed;">
      <thead style="background:#f3f4f6;position:sticky;top:0;z-index:10;">
        <tr>
          <th style="padding:12px;text-align:left;border-bottom:2px solid #d1d5db;font-weight:700;width:140px;">📅 Fecha</th>
          <th style="padding:12px;text-align:left;border-bottom:2px solid #d1d5db;font-weight:700;">👤 Cliente</th>
          // Devolver solo los items que siguen marcados al momento de eliminar el pedido
          <th style="padding:12px;text-align:left;border-bottom:2px solid #d1d5db;font-weight:700;">🛒 Productos</th>
          <th style="padding:12px;text-align:right;border-bottom:2px solid #d1d5db;font-weight:700;width:110px;">💰 Total</th>
          <th style="padding:12px;text-align:center;border-bottom:2px solid #d1d5db;font-weight:700;width:170px;">💳 Pago</th>
            .eq('pedido_id', pedidoId)
            .eq('marcado', true);
        </tr>
      </thead>
      <tbody>
        ${pedidosFiltrados.map(pedido => {
          const fecha = pedido.created_at
            ? new Date(pedido.created_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '-';
          const productos = pedido.items ? pedido.items.map(i => {
            const esGranel = i.nombre && i.nombre.toLowerCase().includes('(granel)');
            return esGranel ? `${i.nombre} ($${i.cantidad.toLocaleString('es-CL')})` : `${i.nombre} (${i.cantidad}x)`;
          }).join(', ') : 'Sin productos';
          const metodoPago = obtenerEmojiMetodoPago(pedido.metodo_pago);
          const estado = pedido.estado === 'ANULADO' ? '🚫 Anulado' : (pedido.entregado ? '✅ Entregado' : '⏳ Pendiente');
          const colorEstado = pedido.estado === 'ANULADO' ? '#ef4444' : (pedido.entregado ? '#10b981' : '#f59e0b');
          const nombreCliente = escaparHtmlHistorial(pedido.nombre || 'Sin nombre');
          const telefono = escaparHtmlHistorial(pedido.telefono || '-');
          const productosSeguro = escaparHtmlHistorial(productos);
          const direccion = pedido.direccion ? `<div style="font-size:0.75rem;color:#64748b;margin-top:4px;">📍 ${escaparHtmlHistorial(pedido.direccion)}</div>` : '';
          const notas = pedido.notas ? `<div style="font-size:0.75rem;color:#7c3aed;margin-top:4px;">📝 ${escaparHtmlHistorial(pedido.notas)}</div>` : '';
          
          return `
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:12px;">${fecha}</td>
              <td style="padding:12px;">${telefono}</td>
              <td style="padding:12px;white-space:normal;line-height:1.45;" title="${productosSeguro}">${productosSeguro}</td>
              <td style="padding:12px;text-align:right;font-weight:700;color:#10b981;">$${(pedido.total || 0).toLocaleString()}</td>
              <td style="padding:12px;text-align:center;">${metodoPago}</td>
              <td style="padding:12px;text-align:center;color:${colorEstado};font-weight:600;">${estado}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  
  contenedor.innerHTML = html;
}

/**
 * Renderizar ranking VIP (clientes agrupados por teléfono)
 */
function renderizarRankingVIP() {
  const contenedor = document.getElementById('modalHistorialCompletoBody');
  
  // Agrupar por teléfono
  const clientesAgrupados = {};
  
  pedidosFiltrados.forEach(pedido => {
    const telefono = pedido.telefono || 'sin-telefono';
    
    if (!clientesAgrupados[telefono]) {
      clientesAgrupados[telefono] = {
        nombre: pedido.nombre || 'Sin nombre',
        telefono: pedido.telefono || '-',
        totalCompras: 0,
        cantidadPedidos: 0,
        ultimoPedido: pedido.created_at
      };
    }
    
    clientesAgrupados[telefono].totalCompras += pedido.total || 0;
    clientesAgrupados[telefono].cantidadPedidos++;
    
    // Actualizar último pedido si es más reciente
    if (new Date(pedido.created_at) > new Date(clientesAgrupados[telefono].ultimoPedido)) {
      clientesAgrupados[telefono].ultimoPedido = pedido.created_at;
      clientesAgrupados[telefono].nombre = pedido.nombre || clientesAgrupados[telefono].nombre;
    }
  });
  
  // Convertir a array y ordenar por total de compras
  const clientesOrdenados = Object.values(clientesAgrupados)
    .sort((a, b) => b.totalCompras - a.totalCompras);
  
  if (clientesOrdenados.length === 0) {
    contenedor.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">No se encontraron clientes</div>';
    return;
  }
  
  const html = `
    <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
      <thead style="background:#f3f4f6;position:sticky;top:0;z-index:10;">
        <tr>
          <th style="padding:12px;text-align:center;border-bottom:2px solid #d1d5db;font-weight:700;">🏅 Rank</th>
          <th style="padding:12px;text-align:left;border-bottom:2px solid #d1d5db;font-weight:700;">👤 Cliente</th>
          <th style="padding:12px;text-align:left;border-bottom:2px solid #d1d5db;font-weight:700;">📞 Teléfono</th>
          <th style="padding:12px;text-align:center;border-bottom:2px solid #d1d5db;font-weight:700;">📦 Pedidos</th>
          <th style="padding:12px;text-align:right;border-bottom:2px solid #d1d5db;font-weight:700;">💰 Total Compras</th>
          <th style="padding:12px;text-align:right;border-bottom:2px solid #d1d5db;font-weight:700;">📊 Ticket Prom.</th>
          <th style="padding:12px;text-align:center;border-bottom:2px solid #d1d5db;font-weight:700;">📅 Último Pedido</th>
        </tr>
      </thead>
      <tbody>
        ${clientesOrdenados.map((cliente, index) => {
          const medalla = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : (index + 1);
          const ticketPromedio = Math.round(cliente.totalCompras / cliente.cantidadPedidos);
          const ultimaFecha = new Date(cliente.ultimoPedido).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const bgColor = index < 3 ? 'background:#fef3c7;' : '';
          
          return `
            <tr style="border-bottom:1px solid #e5e7eb;${bgColor}">
              <td style="padding:12px;text-align:center;font-size:1.2rem;font-weight:700;">${medalla}</td>
              <td style="padding:12px;font-weight:600;">${escaparHtmlHistorial(cliente.nombre)}</td>
              <td style="padding:12px;">${escaparHtmlHistorial(cliente.telefono)}</td>
              <td style="padding:12px;text-align:center;font-weight:600;color:#4b6cb7;">${cliente.cantidadPedidos}</td>
              <td style="padding:12px;text-align:right;font-weight:700;font-size:1.1rem;color:#10b981;">$${cliente.totalCompras.toLocaleString()}</td>
              <td style="padding:12px;text-align:right;color:#6b7280;">$${ticketPromedio.toLocaleString()}</td>
              <td style="padding:12px;text-align:center;font-size:0.85rem;color:#6b7280;">${ultimaFecha}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  
  contenedor.innerHTML = html;
}

/**
 * Obtener emoji del método de pago
 */
function obtenerEmojiMetodoPago(metodo) {
  const metodos = {
    'E': '💵 Efectivo',
    'DC': '💳 Tarjeta',
    'D': '💳 Débito',
    'C': '💳 Crédito',
    'TP': '⏳ Transf. Pend.',
    'T': '⏳ Transferencia',
    'TG': '✅ Transf. Pagada',
    'P': '💰 Pagado',
    'PE': '💵 Pagado Local - Efectivo',
    'PC': '💳 Pagado Local - Tarjeta',
    'PX': '🔀 Pagado Local - Mixto',
    'PM': '💰 Mixto - Pendiente',
    'PMP': '✅ Mixto - Pagado'
  };
  return metodos[metodo] || '❓ ' + metodo;
}

/**
 * Filtrar historial por búsqueda
 */
function filtrarHistorial() {
  aplicarFiltrosHistorial();
}

function aplicarFiltrosHistorial() {
  const busqueda = normalizarTextoHistorial(document.getElementById('buscarHistorial').value);
  const filtroMetodo = document.getElementById('filtroMetodoHistorial').value;
  const filtroEstado = document.getElementById('filtroEstadoHistorial').value;

  pedidosFiltrados = todosLosPedidos.filter((pedido) => {
    const grupoMetodo = obtenerGrupoMetodoHistorial(pedido);
    const estado = obtenerEstadoHistorial(pedido);

    if (filtroMetodo !== 'todos' && grupoMetodo !== filtroMetodo) {
      return false;
    }

    if (filtroEstado !== 'todos' && estado !== filtroEstado) {
      return false;
    }

    if (!busqueda) {
      return true;
    }

    const fechaTexto = pedido.created_at
      ? new Date(pedido.created_at).toLocaleString('es-CL')
      : '';
    const productosTexto = Array.isArray(pedido.items)
      ? pedido.items.map((item) => `${item.nombre || ''} ${item.cantidad || ''}`).join(' ')
      : '';
    const textoCompleto = normalizarTextoHistorial([
      pedido.nombre,
      pedido.telefono,
      pedido.direccion,
      pedido.notas,
      pedido.metodo_pago,
      pedido.estado,
      fechaTexto,
      productosTexto
    ].join(' '));

    return textoCompleto.includes(busqueda);
  });

  actualizarResumenHistorialResultados();
  actualizarEstadisticas();
  mostrarTopProductos();
  
  if (modoVIP) {
    renderizarRankingVIP();
  } else {
    renderizarHistorialCronologico();
  }
}

/**
 * Toggle entre modo cronológico y VIP
 */
function toggleModoVIP() {
  modoVIP = !modoVIP;
  
  const btn = document.getElementById('btnToggleVIP');
  if (modoVIP) {
    btn.textContent = '📅 Vista Cronológica';
    btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    renderizarRankingVIP();
  } else {
    btn.textContent = '💎 Ranking VIP';
    btn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
    renderizarHistorialCronologico();
  }
}

/**
 * Limpiar todos los filtros
 */
function limpiarFiltrosHistorial() {
  document.getElementById('fechaHasta').value = '';
  document.getElementById('fechaDesde').value = '';
  document.getElementById('buscarHistorial').value = '';
  document.getElementById('filtroMetodoHistorial').value = 'todos';
  document.getElementById('filtroEstadoHistorial').value = 'todos';
  
  cargarHistorialCompleto();
}

// ========================================
// MODAL: DETALLES DE MÉTODO DE PAGO
// ========================================

// Variables globales para el modal
let modalMetodoPagoTipo = 'efectivo';
let modalMetodoPagoFiltro = 'hoy';

/**
 * Filtrar pedidos del modal por período de tiempo
 * @param {string} filtro - 'hoy', 'semana', 'mes', 'todo'
 */
function filtrarPedidosModal(filtro) {
  modalMetodoPagoFiltro = filtro;
  
  // Actualizar botones activos
  document.querySelectorAll('.btn-filtro-modal').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-filtro') === filtro) {
      btn.classList.add('active');
    }
  });
  
  // Recargar pedidos con nuevo filtro
  mostrarPedidosPorMetodo(modalMetodoPagoTipo);
}

/**
 * Obtener rango de fechas según filtro
 * @param {string} filtro - 'hoy', 'manana', 'semana', 'mes', 'todo', 'custom', o fecha específica 'YYYY-MM-DD'
 * @returns {Object} {desde, hasta}
 */
function obtenerRangoFechas(filtro) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);
  
  switch(filtro) {
    case 'hoy':
      return { desde: hoy, hasta: manana };
    
    case 'manana':
      const pasadoManana = new Date(manana);
      pasadoManana.setDate(manana.getDate() + 1);
      return { desde: manana, hasta: pasadoManana };
      
    case 'semana':
      const inicioSemana = new Date(hoy);
      inicioSemana.setDate(hoy.getDate() - hoy.getDay()); // Domingo
      const finSemana = new Date(inicioSemana);
      finSemana.setDate(inicioSemana.getDate() + 7);
      return { desde: inicioSemana, hasta: finSemana };
      
    case 'mes':
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
      return { desde: inicioMes, hasta: finMes };
      
    case 'todo':
      return { desde: new Date(0), hasta: new Date('2099-12-31') };
    
    case 'custom':
    default:
      // Si es una fecha específica en formato YYYY-MM-DD
      if (filtro && filtro.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const fechaEspecifica = new Date(filtro + 'T00:00:00');
        const siguienteDia = new Date(fechaEspecifica);
        siguienteDia.setDate(fechaEspecifica.getDate() + 1);
        return { desde: fechaEspecifica, hasta: siguienteDia };
      }
      // Por defecto, retornar todo
      return { desde: new Date(0), hasta: new Date('2099-12-31') };
  }
}

/**
 * Mostrar modal con pedidos filtrados por método de pago
 * @param {string} tipo - 'efectivo', 'tarjetas', 'pendientes', 'pagadas'
 */
function mostrarPedidosPorMetodo(tipo) {
  modalMetodoPagoTipo = tipo; // Guardar tipo actual
  
  // NUEVO: Sincronizar filtro del modal con el filtro actual de la vista principal
  modalMetodoPagoFiltro = filtroActual;
  
  const modal = document.getElementById('modalMetodoPago');
  const icono = document.getElementById('modalMetodoPagoIcono');
  const nombre = document.getElementById('modalMetodoPagoNombre');
  const totalEl = document.getElementById('modalMetodoPagoTotal');
  const cantidadEl = document.getElementById('modalMetodoPagoCantidad');
  const lista = document.getElementById('modalMetodoPagoLista');
  
  // Configurar título y estilo según tipo
  const config = {
    efectivo: {
      icono: '💵',
      nombre: 'Efectivo',
      metodos: ['E']
    },
    tarjetas: {
      icono: '💳',
      nombre: 'Tarjetas (Débito/Crédito)',
      metodos: ['DC', 'D', 'C']
    },
    mixtos: {
      icono: '💰',
      nombre: 'Pagos Mixtos (Efectivo + Transferencia)',
      metodos: ['PM', 'PMP']
    },
    pendientes: {
      icono: '⏳',
      nombre: 'Transferencias Pendientes',
      metodos: ['TP', 'T']
    },
    pagadas: {
      icono: '✅',
      nombre: 'Transferencias Pagadas',
      metodos: ['TG']
    }
  };
  
  const cfg = config[tipo];
  if (!cfg) return;
  
  icono.textContent = cfg.icono;
  nombre.textContent = cfg.nombre;
  
  // NUEVO: Actualizar estado visual de los botones de filtro del modal
  const botonesFiltroModal = document.querySelectorAll('.btn-filtro-modal');
  botonesFiltroModal.forEach(btn => {
    btn.classList.remove('active');
    const filtroBtn = btn.getAttribute('data-filtro');
    
    // Mapear filtroActual a los filtros del modal
    let filtroModalEquivalente = modalMetodoPagoFiltro;
    
    // Si filtroActual es 'manana' o una fecha específica, marcar 'hoy' por ahora
    // (el modal no tiene botón para mañana o fecha específica, solo usa el filtro heredado)
    if (modalMetodoPagoFiltro === 'manana' || modalMetodoPagoFiltro.match(/^\d{4}-\d{2}-\d{2}$/)) {
      filtroModalEquivalente = 'hoy'; // Los botones solo muestran hoy/semana/mes/todo
    }
    
    if (filtroBtn === filtroModalEquivalente) {
      btn.classList.add('active');
    }
  });
  
  // Obtener rango de fechas según filtro
  const { desde, hasta } = obtenerRangoFechas(modalMetodoPagoFiltro);
  
  // Filtrar pedidos entregados, no anulados y con el método de pago correcto
  const pedidosFiltrados = datosLocal.filter(pedido => {
    if (!pedido.entregado || pedido.estado === 'ANULADO') return false;
    
    // IMPORTANTE: Filtrar por FECHA DE ENTREGA (no created_at)
    // La recaudación se cuenta cuando el pedido se entrega
    const fechaPedido = new Date(pedido.fecha + 'T00:00:00');
    if (fechaPedido < desde || fechaPedido >= hasta) return false;
    
    const metodo = pedido.metodo_pago || 'E';
    const notas = pedido.notas || '';

    // Detectar si es pago mixto (por código PM/PMP o por notas)
    const esMixto = metodo === 'PM' || metodo === 'PMP' ||
      (typeof notas === 'string' && (notas.includes('💰 PAGO MIXTO:') || notas.includes('PAGO MIXTO:')));

    // Todo pago mixto va SOLO a la tarjeta Pago Mixto, nunca a efectivo/tarjetas/transferencias
    if (esMixto) return tipo === 'mixtos';

    // Pagos simples: el modal solo muestra métodos exactos del config
    return cfg.metodos.includes(metodo);
  });
  
  // Calcular totales
  let totalMonto = 0;
  pedidosFiltrados.forEach(pedido => {
    const total = parseInt(pedido.total) || 0;
    // Todos los pedidos ya están filtrados correctamente — sumar total completo
    totalMonto += total;
  });
  
  // Actualizar stats
  totalEl.textContent = `$${totalMonto.toLocaleString('es-CL')}`;
  cantidadEl.textContent = `${pedidosFiltrados.length} pedido${pedidosFiltrados.length !== 1 ? 's' : ''}`;
  
  // Generar lista HTML
  if (pedidosFiltrados.length === 0) {
    lista.innerHTML = '<div style="text-align:center;padding:32px;color:#9ca3af;font-size:0.875rem;">No hay pedidos con este método de pago</div>';
  } else {
    let listaHTML = '';
    
    pedidosFiltrados.forEach(pedido => {
      const total = parseInt(pedido.total) || 0;
      const metodo = pedido.metodo_pago || 'E';
      const notas = pedido.notas || '';
      const nombre = pedido.nombre || 'Sin nombre';
      const telefono = pedido.telefono || '';
      const direccion = pedido.direccion || 'Sin dirección';
      
      // Calcular monto específico para este método
      let montoMostrar = total;
      let etiquetaExtra = '';
      
      // Para pagos mixtos: mostrar desglose en el listado
      if (metodo === 'PM' || metodo === 'PMP') {
        // Formato moderno (monto en notas con patrón numérico)
        const patronNumero = /(\d+[\.,]?\d*)\s*(?:efectivo|efec|pesos|$)/i;
        const match = notas.match(patronNumero);
        if (match) {
          const montoEfectivo = parseInt(match[1].replace(/[,\.]/g, '')) || 0;
          const montoTransferencia = total - montoEfectivo;
          etiquetaExtra = ` <span style="font-size:0.75rem;color:#6b7280;"><br>💵 Efectivo: $${montoEfectivo.toLocaleString('es-CL')}<br>🔄 Transf: $${montoTransferencia.toLocaleString('es-CL')} ${metodo === 'PM' ? '⏳' : '✅'}</span>`;
        }
      } else if (typeof notas === 'string' && (notas.includes('💰 PAGO MIXTO:') || notas.includes('PAGO MIXTO:'))) {
        // Formato antiguo (montos en notas con emojis)
        const efMatch = notas.match(/💵 Efectivo: \$?([\d,.]+)/);
        const tarjMatch = notas.match(/💳 Tarjeta: \$?([\d,.]+)/);
        const transfMatch = notas.match(/🔄 Transferencia: \$?([\d,.]+)/);
        const transfPagMatch = notas.match(/✅ Transferencia PAGADA: \$?([\d,.]+)/);
        const partes = [];
        if (efMatch) partes.push(`💵 Efectivo: $${parseInt(efMatch[1].replace(/[,.]/g,'')).toLocaleString('es-CL')}`);
        if (tarjMatch) partes.push(`💳 Tarjeta: $${parseInt(tarjMatch[1].replace(/[,.]/g,'')).toLocaleString('es-CL')}`);
        if (transfPagMatch) partes.push(`✅ Transf: $${parseInt(transfPagMatch[1].replace(/[,.]/g,'')).toLocaleString('es-CL')}`);
        else if (transfMatch) partes.push(`🔄 Transf: $${parseInt(transfMatch[1].replace(/[,.]/g,'')).toLocaleString('es-CL')} ⏳`);
        if (partes.length) etiquetaExtra = ` <span style="font-size:0.75rem;color:#6b7280;"><br>${partes.join('<br>')}</span>`;
      }
      
      // Productos resumidos
      const productos = Array.isArray(pedido.items) && pedido.items.length > 0
        ? pedido.items.map(item => `${item.cantidad}× ${item.nombre}`).join(', ')
        : 'Sin productos';
      
      const productosCorto = productos.length > 60 ? productos.substring(0, 60) + '...' : productos;
      
      // Fecha de entrega (la que cuenta para recaudación)
      let fechaEntregaTexto = '';
      if (pedido.fecha) {
        const fechaEntrega = new Date(pedido.fecha + 'T00:00:00');
        const fechaFormato = fechaEntrega.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
        fechaEntregaTexto = `📅 Entregado: ${fechaFormato}`;
        
        // Si existe created_at, mostrar también la hora de creación
        if (pedido.created_at) {
          const fechaCreacion = new Date(pedido.created_at);
          const horaFormato = fechaCreacion.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
          fechaEntregaTexto += ` (🕐 ${horaFormato})`;
        }
      }
      
      listaHTML += `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px;transition:all 0.2s;" onmouseover="this.style.boxShadow='0 4px 6px -1px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow='none'">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">
            <div style="flex:1;">
              <div style="font-weight:600;font-size:0.9375rem;color:#111827;margin-bottom:2px;">${nombre}</div>
              ${telefono ? `<div style="font-size:0.8125rem;color:#2563eb;display:flex;align-items:center;gap:4px;"><span>📞</span>${telefono}</div>` : ''}
              ${fechaEntregaTexto ? `<div style="font-size:0.75rem;color:#9ca3af;margin-top:2px;">${fechaEntregaTexto}</div>` : ''}
            </div>
            <div style="text-align:right;">
              <div style="font-size:1.125rem;font-weight:700;color:#059669;">$${montoMostrar.toLocaleString('es-CL')}${etiquetaExtra}</div>
            </div>
          </div>
          <div style="font-size:0.8125rem;color:#374151;background:#fef3c7;padding:4px 6px;border-radius:4px;border-left:2px solid #f59e0b;margin-bottom:4px;">
            📍 ${direccion}
          </div>
          <div style="font-size:0.8125rem;color:#059669;background:#ecfdf5;padding:4px 6px;border-radius:4px;">
            🛒 ${productosCorto}
          </div>
        </div>
      `;
    });
    
    lista.innerHTML = listaHTML;
  }
  
  // Mostrar modal
  modal.style.display = 'flex';
}

/**
 * Cerrar modal de método de pago
 */
function cerrarModalMetodoPago() {
  const modal = document.getElementById('modalMetodoPago');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Event Listeners para Historial Completo
document.addEventListener('DOMContentLoaded', () => {
  // Botón abrir historial
  const btnHistorial = document.getElementById('btnHistorialCompleto');
  if (btnHistorial) {
    btnHistorial.addEventListener('click', abrirHistorialCompleto);
  }
  
  // Botón cerrar historial
  const btnCerrar = document.getElementById('btnCerrarHistorialCompleto');
  if (btnCerrar) {
    btnCerrar.addEventListener('click', cerrarHistorialCompleto);
  }
  
  // Toggle VIP
  const btnToggle = document.getElementById('btnToggleVIP');
  if (btnToggle) {
    btnToggle.addEventListener('click', toggleModoVIP);
  }
  
  // Búsqueda en tiempo real
  const inputBuscar = document.getElementById('buscarHistorial');
  if (inputBuscar) {
    inputBuscar.addEventListener('input', () => {
      clearTimeout(historialFiltroTimeout);
      historialFiltroTimeout = setTimeout(() => {
        filtrarHistorial();
      }, 180);
    });
  }

  const filtroMetodo = document.getElementById('filtroMetodoHistorial');
  if (filtroMetodo) {
    filtroMetodo.addEventListener('change', aplicarFiltrosHistorial);
  }

  const filtroEstado = document.getElementById('filtroEstadoHistorial');
  if (filtroEstado) {
    filtroEstado.addEventListener('change', aplicarFiltrosHistorial);
  }
  
  // Botón filtrar por fecha
  const btnFiltrar = document.getElementById('btnAplicarFiltroFecha');
  if (btnFiltrar) {
    btnFiltrar.addEventListener('click', cargarHistorialCompleto);
  }
  
  // Botón limpiar filtros
  const btnLimpiar = document.getElementById('btnLimpiarFiltros');
  if (btnLimpiar) {
    btnLimpiar.addEventListener('click', limpiarFiltrosHistorial);
  }

  const btnExportar = document.getElementById('btnExportarHistorialCompleto');
  if (btnExportar) {
    btnExportar.addEventListener('click', exportarHistorialCompletoCSV);
  }
  
  // Cerrar modal al hacer clic fuera
  const modal = document.getElementById('modalHistorialCompleto');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cerrarHistorialCompleto();
      }
    });
  }
  
  // Event Listeners para Tarjetas de Métodos de Pago
  // Efectivo
  const cardEfectivo = document.querySelector('.resumen-mini.efectivo');
  if (cardEfectivo) {
    cardEfectivo.style.cursor = 'pointer';
    cardEfectivo.addEventListener('click', () => mostrarPedidosPorMetodo('efectivo'));
  }
  
  // Tarjetas
  const cardTarjetas = document.querySelector('.resumen-mini.tarjetas');
  if (cardTarjetas) {
    cardTarjetas.style.cursor = 'pointer';
    cardTarjetas.addEventListener('click', () => mostrarPedidosPorMetodo('tarjetas'));
  }
  
  // Transferencias Pendientes
  const cardTransferencias = document.querySelector('.resumen-mini.transferencias');
  if (cardTransferencias) {
    cardTransferencias.style.cursor = 'pointer';
    cardTransferencias.addEventListener('click', () => mostrarPedidosPorMetodo('pendientes'));
  }
  
  // Transferencias Pagadas
  const cardPagados = document.querySelector('.resumen-mini.pagados');
  if (cardPagados) {
    cardPagados.style.cursor = 'pointer';
    cardPagados.addEventListener('click', () => mostrarPedidosPorMetodo('pagadas'));
  }
  
  // Cerrar modal de método de pago al hacer clic fuera
  const modalMetodoPago = document.getElementById('modalMetodoPago');
  if (modalMetodoPago) {
    modalMetodoPago.addEventListener('click', (e) => {
      if (e.target === modalMetodoPago) {
        cerrarModalMetodoPago();
      }
    });
  }
});
// === CONFIGURACIÓN ===
// SUPABASE_CONFIG viene de shared/supabase-config.js
// SUPABASE_CONFIG está en shared/supabase-config.js

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
    
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente de Supabase no disponible para queue');
      return;
    }
    
    switch(tipo) {
      case 'ENTREGAR':
        await client.from('pedidos').update({ entregado: true }).eq('id', datos.id);
        break;
        
      case 'DESMARCAR':
        await client.from('pedidos').update({ entregado: false }).eq('id', datos.id);
        break;
        
      case 'ELIMINAR':
        await client.from('pedidos').delete().eq('id', datos.id);
        break;
        
      case 'ANULAR':
        await client.from('pedidos').update({ entregado: true, estado: 'ANULADO' }).eq('id', datos.id);
        break;
        
      case 'REACTIVAR':
        await client.from('pedidos').update({ entregado: false, estado: null }).eq('id', datos.id);
        break;
        
      case 'REAGENDAR':
        await client.from('pedidos').update({ fecha: datos.fecha }).eq('id', datos.id);
        break;
        
      case 'CAMBIAR_PRIORIDAD':
        await client.from('pedidos').update({ prioridad: datos.prioridad }).eq('id', datos.id);
        break;
        
      case 'ACTUALIZAR_ORDEN':
        await client.from('pedidos').update({ orden_ruta: datos.orden }).eq('id', datos.id);
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
    const indicador = document.getElementById('connectionStatus');
    const statusIcon = indicador?.querySelector('.status-icon');
    const statusText = indicador?.querySelector('.status-text');
    
    if (indicador && statusIcon && statusText) {
      if (this.estaOnline()) {
        indicador.className = 'connection-status online';
        statusIcon.textContent = '🟢';
        statusText.textContent = 'Online';
        indicador.title = 'Conectado a internet';
      } else {
        indicador.className = 'connection-status offline';
        statusIcon.textContent = '🔴';
        statusText.textContent = 'Offline';
        indicador.title = 'Sin conexión a internet';
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
 * Verificar que el usuario tenga permisos para acceder al panel de repartidor
 * Admin y repartidor pueden acceder
 */
async function verificarPermisoRepartidor() {
  try {
    const { data: { user } } = await supabase_client.auth.getUser();
    
    if (!user) {
      window.location.href = '../index.html';
      return false;
    }
    
    // Admin y repartidor pueden acceder
    if (!ROLES_CONFIG.puedeAccederPanelRepartidor(user.email)) {
      // Usando alert() aquí porque es una verificación de seguridad crítica
      // que requiere atención inmediata antes de la redirección.
      // ErrorHandler podría no estar disponible en este punto temprano del ciclo de vida.
      alert('❌ No tienes permisos para acceder al panel de repartidor');
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
  // Inicializar Supabase client desde shared config
  supabase_client = inicializarSupabase();
  
  if (supabase_client) {
    console.log('✅ Cliente Supabase inicializado en REPARTIDOR');
  } else {
    console.error('❌ Error: No se pudo inicializar Supabase');
  }
  
  // Verificar permisos antes de continuar (ya incluye manejo de errores interno)
  const tienePermiso = await verificarPermisoRepartidor();
  if (!tienePermiso) return;
  
  OfflineManager.actualizarEstadoConexion();
  OfflineManager.actualizarContadorCola();
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
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible');
      ErrorHandler.mostrarError('Error: No se pudo conectar');
      return;
    }
    
    // Intentar actualizar en Supabase
    const { error } = await client
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
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible');
      ErrorHandler.mostrarError('Error: No se pudo conectar');
      return;
    }
    
    // Intentar actualizar en Supabase
    try {
      const { error } = await client
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
    
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible');
      return;
    }
    
    // Intentar actualizar en Supabase
    try {
      await client
        .from('pedidos')
        .update({ orden_ruta: ordenDestino })
        .eq('id', docId);
        
      await client
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
// Esperamos a que se cargue el cliente compartido
let supabase_client = null;

// Función para obtener el cliente de Supabase
function getSupabaseClient() {
  if (!supabase_client) {
    supabase_client = inicializarSupabase();
  }
  return supabase_client;
}

let datosLocal = [];
let todosPedidosDelChofer = []; // Todos los pedidos del chofer (incluyendo entregados) para calcular resumen
let datosFiltrados = []; // Pedidos actualmente visibles después de aplicar filtros
const METODOS = { 
  'E': 'Efectivo', 
  'DC': 'Débito/Crédito', 
  'TP': 'Transf. Pendiente', 
  'TG': 'Transf. Pagada',
  'P': 'Pagado',
  'PE': 'Pagado Local - Efectivo',
  'PC': 'Pagado Local - Tarjeta',
  'PX': 'Pagado Local - Mixto',
  'PM': 'Pago Mixto (Pendiente)',
  'PMP': 'Pago Mixto (Pagado)'
};

function normalizarMetodoPago(metodo) {
  if (!metodo) return '';

  const valor = String(metodo).trim();
  if (METODOS[valor]) return valor;

  const valorNormalizado = valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const equivalencias = {
    'D': 'DC',
    'C': 'DC',
    'T': 'TP',
    'EFECTIVO': 'E',
    'DEBITO/CREDITO': 'DC',
    'DEBITO / CREDITO': 'DC',
    'TARJETA': 'DC',
    'TRANSF. PENDIENTE': 'TP',
    'TRANSFERENCIA PENDIENTE': 'TP',
    'TRANSF. PAGADA': 'TG',
    'TRANSFERENCIA PAGADA': 'TG',
    'PAGADO': 'P',
    'PAGADO LOCAL - EFECTIVO': 'PE',
    'PAGADO LOCAL EFECTIVO': 'PE',
    'PAGADO LOCAL - TARJETA': 'PC',
    'PAGADO LOCAL TARJETA': 'PC',
    'PAGADO LOCAL - MIXTO': 'PX',
    'PAGADO LOCAL MIXTO': 'PX',
    'PAGO MIXTO PENDIENTE': 'PM',
    'PAGO MIXTO PAGADO': 'PMP'
  };

  return equivalencias[valorNormalizado] || valor;
}

function obtenerPresentacionCobroRepartidor(pedido) {
  const metodo = normalizarMetodoPago(pedido?.metodo_pago || pedido?.metodo) || 'E';
  const notas = typeof pedido?.notas === 'string' ? pedido.notas.toUpperCase() : '';

  const esPagadoLocal = ['P', 'PE', 'PC', 'PX'].includes(metodo) || notas.includes('PAGADO LOCAL');
  const esTransferenciaConfirmada = metodo === 'TG';
  const esMixtoConfirmado = metodo === 'PMP' || (notas.includes('PAGO MIXTO') && notas.includes('TRANSFERENCIA PAGADA'));
  const esMixtoPendiente = metodo === 'PM' || (notas.includes('PAGO MIXTO') && notas.includes('TRANSFERENCIA') && !notas.includes('TRANSFERENCIA PAGADA'));

  if (esPagadoLocal) {
    return {
      estado: 'PAGADO',
      detalle: 'Registrado en local',
      icono: '✅',
      esPagado: true,
      estadoBg: '#dcfce7',
      estadoColor: '#166534',
      detalleBg: '#f3f4f6',
      detalleColor: '#4b5563'
    };
  }

  if (esTransferenciaConfirmada) {
    return {
      estado: 'PAGADO',
      detalle: 'Transferencia confirmada',
      icono: '✅',
      esPagado: true,
      estadoBg: '#dcfce7',
      estadoColor: '#166534',
      detalleBg: '#ecfeff',
      detalleColor: '#155e75'
    };
  }

  if (esMixtoConfirmado) {
    return {
      estado: 'PAGADO',
      detalle: 'Mixto confirmado',
      icono: '✅',
      esPagado: true,
      estadoBg: '#dcfce7',
      estadoColor: '#166534',
      detalleBg: '#f5f3ff',
      detalleColor: '#6d28d9'
    };
  }

  if (esMixtoPendiente) {
    return {
      estado: 'COBRAR',
      detalle: 'Mixto pendiente',
      icono: '🔀',
      esPagado: false,
      estadoBg: '#fef3c7',
      estadoColor: '#92400e',
      detalleBg: '#f5f3ff',
      detalleColor: '#6d28d9'
    };
  }

  switch (metodo) {
    case 'E':
      return {
        estado: 'COBRAR',
        detalle: 'Efectivo',
        icono: '💵',
        esPagado: false,
        estadoBg: '#fef3c7',
        estadoColor: '#92400e',
        detalleBg: '#ecfdf5',
        detalleColor: '#166534'
      };
    case 'DC':
      return {
        estado: 'COBRAR',
        detalle: 'Tarjeta',
        icono: '💳',
        esPagado: false,
        estadoBg: '#fef3c7',
        estadoColor: '#92400e',
        detalleBg: '#eff6ff',
        detalleColor: '#1d4ed8'
      };
    case 'TP':
      return {
        estado: 'COBRAR',
        detalle: 'Transferencia pendiente',
        icono: '⏳',
        esPagado: false,
        estadoBg: '#fef3c7',
        estadoColor: '#92400e',
        detalleBg: '#fff7ed',
        detalleColor: '#c2410c'
      };
    default:
      return {
        estado: 'COBRAR',
        detalle: METODOS[metodo] || 'Revisar medio',
        icono: '💰',
        esPagado: false,
        estadoBg: '#fef3c7',
        estadoColor: '#92400e',
        detalleBg: '#f3f4f6',
        detalleColor: '#4b5563'
      };
  }
}
let lineasPedido = [];

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
  const client = getSupabaseClient();
  if (!client) {
    console.error('❌ Cliente no disponible para realtime');
    return;
  }
  
  // Crear canal de Supabase con un nombre único
  const channel = client
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
  const client = getSupabaseClient();
  if (!client) {
    console.error('❌ Cliente no disponible para realtime carga');
    return;
  }
  
  const channelCarga = client
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
        
        // Actualizar UI si el modal está abierto
        const modal = document.getElementById('modalCarga');
        if (modal && modal.style.display === 'flex') {
          const itemCarga = buscarItemCargaPorPersistencia(checkboxId);
          const checkbox = itemCarga?.querySelector('.checkbox-carga');
          
          if (checkbox && itemCarga) {
            const checkboxActualId = itemCarga.dataset.checkboxId;
            const legacyCheckboxId = itemCarga.dataset.legacyCheckboxId;
            const compatKey = itemCarga.dataset.compatKey;
            const persistedCheckboxId = itemsMarcadosCache.has(checkboxActualId)
              ? checkboxActualId
              : (legacyCheckboxId && itemsMarcadosCache.has(legacyCheckboxId)
                ? legacyCheckboxId
                : (compatKey && itemsMarcadosDetalleCache.has(compatKey)
                  ? itemsMarcadosDetalleCache.get(compatKey)
                  : ''));
            const estaMarcado = Boolean(persistedCheckboxId);
            checkbox.checked = estaMarcado;
            itemCarga.classList.toggle('checked', estaMarcado);
            itemCarga.dataset.persistedCheckboxId = persistedCheckboxId;
            console.log(`✅ Checkbox ${checkboxId} actualizado en UI: ${estaMarcado}`);
          }
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
  
  // FILTRO DE CHOFER: Obtener el chofer seleccionado PRIMERO (antes de cualquier conexión)
  const selectorChofer = document.getElementById('selectorChofer');
  const choferSeleccionado = selectorChofer ? selectorChofer.value : '';
  
  // Si no hay chofer seleccionado, mostrar mensaje SIN intentar conectar
  if (!choferSeleccionado) {
    statusEl.innerText = 'Estado: Selecciona tu nombre arriba';
    resultadosEl.innerHTML = '<div class="item" style="text-align:center;padding:40px 20px;color:#6b7280;"><h3 style="font-size:24px;margin-bottom:12px;">👋 Bienvenido</h3><p>Por favor, selecciona tu nombre en el menú desplegable de arriba para ver tus pedidos asignados del día.</p></div>';
    return;
  }
  
  statusEl.innerText = 'Estado: Conectando...';
  
  try {
    // 🔥 PRIORIDAD #1: SIEMPRE INTENTAR SUPABASE PRIMERO
    console.log('🔥 BAJANDO DATOS FRESCOS DE SUPABASE...');
    
    // Obtener cliente de Supabase
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente de Supabase no disponible');
      statusEl.innerText = 'Error: No se pudo conectar';
      return;
    }
    
    const { data, error} = await client.from('pedidos').select('*').order('created_at', { ascending: false });
    
    if(error) {
      console.error('❌ Error de Supabase:', error);
      console.warn('⚠️ SUPABASE FALLÓ - Intentando con caché de emergencia...');
      
      // RESPALDO DE EMERGENCIA: Solo usar cache si FALLA Supabase
      const cachedData = OfflineManager.cargarCache();
      if (cachedData && cachedData.length > 0) {
        statusEl.innerText = '⚠️ Error de conexión - Usando cache de emergencia';
        datosLocal = cachedData;
        
        // FILTRAR POR CHOFER en los datos del cache
        datosLocal = datosLocal.filter(p => p.asignado_a === choferSeleccionado && !p.entregado);
        
        if (datosLocal.length === 0) {
          resultadosEl.innerHTML = '<div class="item" style="text-align:center;padding:40px 20px;color:#6b7280;"><h3 style="font-size:20px;margin-bottom:12px;">📦 Sin ruta asignada</h3><p>No tienes pedidos asignados hoy.</p></div>';
          return;
        }
        
        render(datosLocal);
        updateResultCount(datosLocal.length || 0, '');
        actualizarResumenCaja(datosLocal);
        ErrorHandler.mostrarWarning('⚠️ Supabase no responde. Mostrando últimos datos guardados.');
        return;
      }
      
      statusEl.innerText = 'Estado: ERROR de Conexión';
      resultadosEl.innerHTML = '<div class="item">Error al conectar con la base de datos. Verifica tu conexión y permisos en Supabase.</div>';
      return;
    }
    
    // ✅ DATOS FRESCOS DE SUPABASE
    console.log('✅ DATOS FRESCOS RECIBIDOS DE SUPABASE');
    statusEl.innerText = 'Estado: Conectado a Supabase';
    datosLocal = data || [];
    
    console.log('='.repeat(60));
    console.log('✅ CONECTADO A SUPABASE EXITOSAMENTE');
    console.log('📊 Total de pedidos obtenidos:', datosLocal.length);
    console.log('🚚 Filtrando por chofer:', choferSeleccionado);
    console.log('='.repeat(60));
    
    // FILTRAR POR CHOFER: Obtener TODOS los pedidos del día del chofer (entregados y no entregados)
    todosPedidosDelChofer = datosLocal.filter(pedido => {
      const asignadoA = pedido.asignado_a || null;
      return asignadoA === choferSeleccionado;
    });
    
    // Separar pedidos pendientes y entregados
    const pedidosPendientes = todosPedidosDelChofer.filter(p => !p.entregado);
    const pedidosEntregados = todosPedidosDelChofer.filter(p => p.entregado);
    
    console.log(`✅ Total pedidos del chofer: ${todosPedidosDelChofer.length} (${pedidosPendientes.length} pendientes, ${pedidosEntregados.length} entregados)`);
    
    // Actualizar datosLocal con solo los pendientes para mostrar
    datosLocal = pedidosPendientes;
    
    // Mostrar mensaje si no hay pedidos asignados
    if (datosLocal.length === 0 && pedidosEntregados.length === 0) {
      resultadosEl.innerHTML = '<div class="item" style="text-align:center;padding:40px 20px;color:#6b7280;"><h3 style="font-size:20px;margin-bottom:12px;">📦 Sin ruta asignada</h3><p>No tienes pedidos asignados para hoy.</p></div>';
      updateResultCount(0, '');
      
      // Ocultar sección de entregados
      const seccionEntregados = document.getElementById('seccionEntregados');
      if (seccionEntregados) seccionEntregados.style.display = 'none';
      
      // Filtrar pedidos para resumen según filtro activo
      let pedidosParaResumen = todosPedidosDelChofer;
      if (filtroActual === 'hoy') {
        const fechaHoy = getFechaFormateada(new Date());
        pedidosParaResumen = todosPedidosDelChofer.filter(p => p.fecha === fechaHoy);
      } else if (filtroActual === 'manana') {
        const fechaManana = getFechaManana();
        pedidosParaResumen = todosPedidosDelChofer.filter(p => p.fecha === fechaManana);
      } else if (filtroActual === 'mes') {
        pedidosParaResumen = todosPedidosDelChofer.filter(p => esMesActual(p.fecha));
      }
      
      actualizarResumenCaja(pedidosParaResumen);
      return;
    }
    
    // Guardar en cache para uso offline (guardar todos del chofer para el resumen)
    OfflineManager.guardarCache(todosPedidosDelChofer);
  
    // Cargar prioridades y órdenes desde localStorage (temporal)
    const prioridadesLocal = JSON.parse(localStorage.getItem('pedidos_prioridades') || '{}');
    const ordenesLocal = JSON.parse(localStorage.getItem('pedidos_ordenes') || '{}');
    
    // Aplicar datos de localStorage a los pedidos pendientes
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
      
      // Renderizar pedidos entregados en su sección (filtrados por el filtro actual)
      let pedidosEntregadosParaMostrar = pedidosEntregados;
      if (filtroActual === 'hoy') {
        const fechaHoy = getFechaFormateada(new Date());
        pedidosEntregadosParaMostrar = pedidosEntregados.filter(p => p.fecha === fechaHoy);
      } else if (filtroActual === 'manana') {
        const fechaManana = getFechaManana();
        pedidosEntregadosParaMostrar = pedidosEntregados.filter(p => p.fecha === fechaManana);
      } else if (filtroActual === 'mes') {
        pedidosEntregadosParaMostrar = pedidosEntregados.filter(p => esMesActual(p.fecha));
      }
      renderizarPedidosEntregados(pedidosEntregadosParaMostrar);
      
      // Filtrar pedidos para resumen según filtro activo
      let pedidosParaResumen = todosPedidosDelChofer;
      if (filtroActual === 'hoy') {
        const fechaHoy = getFechaFormateada(new Date());
        pedidosParaResumen = todosPedidosDelChofer.filter(p => p.fecha === fechaHoy);
      } else if (filtroActual === 'manana') {
        const fechaManana = getFechaManana();
        pedidosParaResumen = todosPedidosDelChofer.filter(p => p.fecha === fechaManana);
      } else if (filtroActual === 'mes') {
        pedidosParaResumen = todosPedidosDelChofer.filter(p => esMesActual(p.fecha));
      }
      
      actualizarResumenCaja(pedidosParaResumen);
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
      actualizarResumenCaja(datosLocal);
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
    const [nombreEl, direccionEl, telefonoEl, fechaEl, metodoEl, notasEl, rutaEl] = 
      getElements('nombre', 'direccion', 'telefono', 'fechaEntrega', 'metodoPago', 'notas', 'rutaSelect');
    
    // Validar todos los campos
    const validaciones = {
      nombre: Validator.validarNombre(nombreEl.value),
      direccion: Validator.validarDireccion(direccionEl.value),
      telefono: Validator.validarTelefono(telefonoEl.value),
      fecha: Validator.validarFecha(fechaEl.value),
      nota: Validator.validarNota(notasEl.value)
    };

    // Verificar si hay productos
    if (lineasPedido.length === 0) {
      ErrorHandler.mostrarError('Debe agregar al menos un producto al pedido');
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
    const pedido = {
      id: generarId(),
      nombre: validaciones.nombre.valor,
      direccion: validaciones.direccion.valor,
      telefono: validaciones.telefono.valor,
      fecha: validaciones.fecha.valor,
      metodo_pago: metodoEl.value || 'E',
      notas: validaciones.nota.valor,
      total: lineasPedido.reduce((acc, p) => acc + (p.cantidad * p.precio), 0),
      entregado: false,
      prioridad: rutaEl.value || 'C', // Prioridad desde selector de ruta (por defecto C)
      orden_ruta: Math.floor(Date.now() / 1000), // Timestamp en segundos (más pequeño)
      created_at: new Date().toISOString(),
      items: lineasPedido.map(item => ({
        nombre: Validator.sanitizeHTML(item.nombre),
        cantidad: parseInt(item.cantidad),
        precio: parseInt(item.precio)
      }))
    };

    // Mostrar indicador de carga
    const btnAgregar = getElement('btnAgregar');
    const textoOriginal = btnAgregar.textContent;
    btnAgregar.textContent = 'Guardando...';
    btnAgregar.disabled = true;

    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible');
      ErrorHandler.mostrarError('Error: No se pudo conectar');
      btnAgregar.textContent = textoOriginal;
      btnAgregar.disabled = false;
      return;
    }

    const { data, error } = await client.from('pedidos').insert([pedido]);
    
    if (error) {
      console.error('Error de Supabase detallado:', error);
      console.error('Pedido que se intentó guardar:', pedido);
      ErrorHandler.mostrarError(`Error al guardar el pedido: ${error.message}`);
    } else {
      ErrorHandler.mostrarExito('Pedido guardado exitosamente');
      clearForm('formAgregar');
      lineasPedido = [];
      renderLineasPedido();
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
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible');
      ErrorHandler.mostrarError('Error: No se pudo conectar');
      return;
    }
    
    // Paso 2: Llamada a Supabase
    const { error } = await client.from('pedidos').delete().eq('id', docId);
    
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
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible');
      ErrorHandler.mostrarError('Error: No se pudo conectar');
      return;
    }

    const { data: pedido, error: errorGet } = await client
      .from('pedidos')
      .select('*')
      .eq('id', docId)
      .single();

    if (errorGet) {
      throw new Error(errorGet.message);
    }

    await devolverStockItemsMarcados(docId, pedido);

    const yaEstregado = pedido.entregado === true && pedido.estado !== 'ANULADO';
    
    // Actualizar pedido en Supabase
    const { error } = await client
      .from('pedidos')
      .update({ 
        entregado: true,
        estado: 'ANULADO'
      })
      .eq('id', docId);
    
    if (error) {
      throw new Error(error.message);
    }
    
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
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible');
      ErrorHandler.mostrarError('Error: No se pudo conectar');
      return;
    }
    
    // Actualizar pedido en Supabase - volver a estado pendiente
    const { error } = await client
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
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible');
      ErrorHandler.mostrarError('Error: No se pudo conectar');
      return;
    }
    
    if (estadoActual) {
      // Si ya está entregado, desmarcar directamente sin confirmación
      // Paso 2: Llamada a Supabase
      const { error } = await client.from('pedidos').update({ entregado: false }).eq('id', docId);
      
      // Paso 3: Manejo de error
      if (error) {
        throw new Error(error.message);
      }
      
      // Éxito
      ErrorHandler.mostrarExito('📦 Pedido marcado como pendiente');
      cargarPedidos();
      
    } else {
      // Verificar si el pedido ya está pagado antes de abrir modal
      const { data: pedido, error } = await client
        .from('pedidos')
        .select('metodo_pago, nombre, notas')
        .eq('id', docId)
        .single();
      
      if (error) {
        throw new Error(error.message);
      }
      
      const metodoPago = pedido.metodo_pago || 'E';
      
      // OPCIÓN 1: Si ya está pagado, confirmar una sola vez de forma simple
      if (['TG', 'P', 'PE', 'PC', 'PX', 'PMP'].includes(metodoPago)) {
        console.log('✅ Pedido ya pagado, solicitando confirmación simple');
        
        // Restaurar botón primero
        if (btnElement) {
          btnElement.disabled = false;
          btnElement.classList.remove('btn-loading');
          btnElement.innerHTML = textoOriginal;
          btnElement.style.opacity = '1';
        }
        
        // Confirmación simple
        const presentacionCobro = obtenerPresentacionCobroRepartidor({ metodo_pago: metodoPago, notas: pedido.notas || '' });
        const confirmacion = confirm(
          `Este pedido ya figura como ${presentacionCobro.estado}\n` +
          `Detalle: ${presentacionCobro.detalle}\n\n` +
          `Cliente: ${pedido.nombre || '(sin nombre)'}\n\n` +
          `¿Confirmas la entrega?`
        );
        
        if (!confirmacion) {
          console.log('❌ Entrega cancelada');
          return;
        }
        
        // Marcar como entregado
        const { error: updateError } = await client
          .from('pedidos')
          .update({ entregado: true })
          .eq('id', docId);
        
        if (updateError) {
          throw new Error(updateError.message);
        }
        
        // Notificación de éxito
        ErrorHandler.mostrarExito(`✅ Pedido entregado (${presentacionCobro.detalle})`);
        cargarPedidos();
        return;
      }
      
      // Para otros métodos de pago (E, DC, TP), abrir modal de confirmación
      // Restaurar botón y abrir modal
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.classList.remove('btn-loading');
        btnElement.innerHTML = textoOriginal;
        btnElement.style.opacity = '1';
      }
      // Abrir modal de confirmación de pago
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
  const client = getSupabaseClient();
  if (!client) {
    console.error('❌ Cliente no disponible');
    alert('Error: No se pudo conectar a la base de datos');
    return;
  }
  
  // Obtener datos del pedido
  const { data: pedido, error } = await client
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
  
  // Cerrar modal
  document.getElementById('cerrarModalPago').onclick = () => modal.remove();
  document.getElementById('cancelarModalPago').onclick = () => modal.remove();
  
  // Cambio de método de pago
  radioButtons.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'mixto') {
        pagoMixtoDetalle.style.display = 'block';
        actualizarTotalMixto();
      } else {
        pagoMixtoDetalle.style.display = 'none';
      }
    });
  });
  
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
      case 'pagado':
        metodoPagoFinal = 'P'; // Pagado en local - Monto $0, NO suma a caja
        break;
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
  
  const client = getSupabaseClient();
  if (!client) {
    alert('Error: No se pudo conectar a la base de datos');
    return;
  }
  
  // Actualizar en la base de datos
  const { error } = await client.from('pedidos').update(updateData).eq('id', docId);
  
  if (error) {
    alert('Error al confirmar entrega: ' + error.message);
  } else {
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
    'PM': '💰 Pago Mixto (Pendiente)',
    'PMP': '✅ Pago Mixto (Pagado)',
    'efectivo': '💵 Efectivo',
    'tarjeta': '💳 Tarjeta',
    'transferencia': '🔄 Transferencia',
    'mixto': '💰 Pago Mixto',
    'MIXTO': '💰 Pago Mixto'
  };
  const codigoNormalizado = normalizarMetodoPago(codigo);
  return metodos[codigoNormalizado] || metodos[codigo] || 'Desconocido';
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
  // DOBLE CONFIRMACIÓN: Primera confirmación
  const nuevaFecha = nextBusinessDayISO(fechaActual);
  const primeraConfirmacion = confirm(
    `⚠️ ¿Estás seguro que quieres REAGENDAR este pedido?\n\n` +
    `📅 Fecha actual: ${fechaActual}\n` +
    `📅 Nueva fecha: ${nuevaFecha}\n\n` +
    `Esta acción moverá el pedido al día siguiente.`
  );
  
  if (!primeraConfirmacion) {
    console.log('❌ Reagendamiento cancelado en primera confirmación');
    return;
  }
  
  // DOBLE CONFIRMACIÓN: Segunda confirmación
  const segundaConfirmacion = confirm(
    `🔔 ÚLTIMA CONFIRMACIÓN\n\n` +
    `¿CONFIRMAS que quieres reagendar para el ${nuevaFecha}?\n\n` +
    `Esta es tu última oportunidad para cancelar.`
  );
  
  if (!segundaConfirmacion) {
    console.log('❌ Reagendamiento cancelado en segunda confirmación');
    ErrorHandler.mostrarInfo('ℹ️ Reagendamiento cancelado');
    return;
  }
  
  // MODO OFFLINE: Verificar conectividad primero
  if (!OfflineManager.estaOnline()) {
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
  
  const client = getSupabaseClient();
  if (!client) {
    alert('⚠️ Error: No se pudo conectar a la base de datos');
    return;
  }
  
  const { error } = await client.from('pedidos').update({ fecha: nuevaFecha }).eq('id', docId);
  if(error) {
    alert('⚠️ Error de conexión. No se pudo reagendar el pedido. Intenta de nuevo.\n\nDetalle: ' + error.message);
  } else { 
    ErrorHandler.mostrarExito('✅ Pedido reagendado exitosamente para: ' + nuevaFecha);
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
    const client = getSupabaseClient();
    if (!client) {
      alert('Error: No se pudo conectar a la base de datos');
      return;
    }
    
    // Obtener datos del pedido para verificar que no esté entregado
    const { data: pedido, error: errorFetch } = await client
      .from('pedidos')
      .select('entregado, nombre, telefono')
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
    
    // Eliminar pedido de Supabase
    const { error } = await client.from('pedidos').delete().eq('id', docId);
    
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
    const client = getSupabaseClient();
    if (!client) {
      alert('Error: No se pudo conectar a la base de datos');
      return;
    }
    
    const { error } = await client
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
 * Marca un pedido como pagado y permite cambiar el método de pago
 * @param {string} docId - ID del pedido
 * @param {string} metodoActual - Método de pago actual
 */
async function marcarComoPagado(docId, metodoActual) {
  const client = getSupabaseClient();
  if (!client) {
    alert('Error: No se pudo conectar a la base de datos');
    return;
  }
  
  // Obtener datos del pedido primero
  const { data: pedido, error: errorFetch } = await client
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
    const { error } = await client.from('pedidos').update(updateData).eq('id', docId);
    
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
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible');
      ErrorHandler.mostrarError('Error: No se pudo conectar');
      return;
    }
    
    // Obtener datos del pedido actual
    const { data: pedido, error } = await client
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
    document.getElementById('nombre').value = pedido.nombre || '';
    document.getElementById('direccion').value = pedido.direccion || '';
    document.getElementById('telefono').value = pedido.telefono || '';
    document.getElementById('metodoPago').value = pedido.metodo_pago || 'E';
    document.getElementById('fechaEntrega').value = pedido.fecha || '';
    document.getElementById('notas').value = pedido.notas || '';
    
    // Cargar productos
    lineasPedido = Array.isArray(pedido.items) ? [...pedido.items] : [];
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
    
    if (!direccion) {
      alert('La dirección es obligatoria');
      return;
    }
    
    if (!telefono) {
      alert('El teléfono es obligatorio');
      return;
    }
    
    if (lineasPedido.length === 0) {
      alert('Debe agregar al menos un producto');
      return;
    }
    
    // Calcular total
    const total = lineasPedido.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);
    
    // Preparar datos actualizados
    const pedidoActualizado = {
      nombre: document.getElementById('nombre').value.trim() || null,
      direccion: direccion,
      telefono: telefono,
      metodo_pago: document.getElementById('metodoPago').value,
      fecha: document.getElementById('fechaEntrega').value,
      items: lineasPedido,
      total: total,
      notas: document.getElementById('notas').value.trim() || null,
      updated_at: new Date().toISOString()
    };
    
    // Actualizar en Supabase
    const btnActualizar = document.getElementById('btnAgregar');
    btnActualizar.textContent = 'Actualizando...';
    btnActualizar.disabled = true;
    
    const { error } = await client
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
  
  const client = getSupabaseClient();
  if (!client) {
    alert('Error: No se pudo conectar a la base de datos');
    return;
  }
  
  // Buscar todos los pedidos del mismo teléfono
  const { data, error } = await client
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
    const subtotal = p.cantidad * p.precio;
    total += subtotal;
    const div = document.createElement('div');
    div.className = 'flex-between flex-gap-8';
    div.style.padding = '4px 0';
    div.innerHTML = `
      <span class="item-name">${p.nombre}</span>
      <span class="item-quantity">x${p.cantidad}</span>
      <span class="item-price">$${p.precio.toLocaleString('es-CL')}</span>
      <span class="item-subtotal">Subtotal: $${subtotal.toLocaleString('es-CL')}</span>
      <button type="button" class="remove-item-btn" data-idx="${idx}">✕</button>
    `;
    div.querySelector('button').onclick = () => {
      lineasPedido.splice(idx, 1);
      renderLineasPedido();
    };
    cont.appendChild(div);
  });
  const totalDiv = document.getElementById('pedidoTotalDisplay');
  if (totalDiv) totalDiv.textContent = 'Total: $' + total.toLocaleString('es-CL');
}

// Añadir producto al carrito con validación
function anadirProducto() {
  const [productoEl, cantidadEl, precioEl] = getElements('itemProducto', 'itemCantidad', 'itemPrecio');
  
  const validation = Validator.validarProducto(
    productoEl.value, 
    cantidadEl.value, 
    precioEl.value
  );
  
  if (!validation.valido) {
    ErrorHandler.mostrarError('Errores en el producto:\n• ' + validation.errores.join('\n• '));
    return;
  }
  
  // Verificar duplicados
  const productoExistente = lineasPedido.find(p => 
    p.nombre.toLowerCase() === validation.valor.nombre.toLowerCase()
  );
  
  if (productoExistente) {
    // Actualizar cantidad del producto existente
    productoExistente.cantidad += validation.valor.cantidad;
    ErrorHandler.mostrarExito(`Cantidad actualizada para ${validation.valor.nombre}`);
  } else {
    // Agregar nuevo producto
    lineasPedido.push(validation.valor);
    ErrorHandler.mostrarExito(`${validation.valor.nombre} agregado al pedido`);
  }
  
  // Limpiar campos
  productoEl.value = '';
  cantidadEl.value = 1;
  precioEl.value = '';
  renderLineasPedido();
  
  // Enfocar el campo de producto para agregar más rápidamente
  productoEl.focus();
}

// Limpiar formulario y productos
function limpiarFormulario() {
  clearForm('formAgregar');
  lineasPedido = [];
  renderLineasPedido();
  setFechaHoyDefault();
  
  // Limpiar preview de historial
  const previewEl = document.getElementById('historialPreview');
  if (previewEl) {
    previewEl.style.display = 'none';
  }
  
  // Restaurar al modo agregar
  restaurarModoAgregar();
}

// Función para renderizar pedidos entregados en su sección
function renderizarPedidosEntregados(pedidosEntregados) {
  const seccionEntregados = document.getElementById('seccionEntregados');
  const contadorEntregados = document.getElementById('contadorEntregadosHoy');
  const resultadosEntregados = document.getElementById('resultadosEntregados');
  
  if (!seccionEntregados || !contadorEntregados || !resultadosEntregados) {
    console.warn('⚠️ Elementos de sección entregados no encontrados');
    return;
  }
  
  // Si no hay pedidos entregados, ocultar la sección
  if (!pedidosEntregados || pedidosEntregados.length === 0) {
    seccionEntregados.style.display = 'none';
    return;
  }
  
  // Mostrar la sección y actualizar contador
  seccionEntregados.style.display = 'block';
  contadorEntregados.textContent = pedidosEntregados.length;
  
  // Limpiar contenedor
  resultadosEntregados.innerHTML = '';
  
  // Ordenar por fecha de entrega (más recientes primero)
  const pedidosOrdenados = [...pedidosEntregados].sort((a, b) => {
    const fechaA = new Date(a.updated_at || a.created_at);
    const fechaB = new Date(b.updated_at || b.created_at);
    return fechaB - fechaA;
  });
  
  // Renderizar cada pedido entregado usando la misma lógica de render
  pedidosOrdenados.forEach(d => {
    const div = document.createElement('div');
    let claseEstado = d.estado === 'ANULADO' ? ' anulado' : ' delivered';
    div.className = 'card-order' + claseEstado;
    div.dataset.clienteId = d.id;

    const resumenTexto = (Array.isArray(d.items) && d.items.length)
          ? d.items.map(it => `${it.nombre} (${it.cantidad}x)`).join(', ')
          : 'Sin productos';
    
    const cobrarLabel = obtenerTextoVenta(d);
    const montoMatch = cobrarLabel.match(/\$[\d.,]+/);
    const montoTexto = montoMatch ? montoMatch[0] : '$0';
    
    const presentacionCobro = obtenerPresentacionCobroRepartidor(d);
    
    div.innerHTML = `
      <div class="card-content-horizontal" style="display:grid;grid-template-columns:1fr;gap:12px;">
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:24px;font-weight:700;color:#6b7280;">${montoTexto}</span>
            <span style="font-size:13px;font-weight:800;color:${presentacionCobro.estadoColor};background:${presentacionCobro.estadoBg};padding:4px 10px;border-radius:999px;letter-spacing:0.02em;">${presentacionCobro.estado}</span>
            <span style="font-size:13px;font-weight:600;color:${presentacionCobro.detalleColor};background:${presentacionCobro.detalleBg};padding:4px 10px;border-radius:999px;">${presentacionCobro.icono} ${presentacionCobro.detalle}</span>
          </div>
          
          <div style="font-size:15px;font-weight:600;color:#6b7280;">
            👤 ${d.nombre || '(sin nombre)'}
          </div>
          
          <div style="font-size:14px;color:#6b7280;">
            📞 ${d.telefono || '(sin teléfono)'}
          </div>
          
          <div style="background:#f3f4f6;padding:6px 10px;border-radius:6px;font-size:14px;color:#6b7280;">
            📍 ${d.direccion || '(sin dirección)'}
          </div>
          
          <div style="font-size:13px;color:#6b7280;background:#f9fafb;padding:6px 10px;border-radius:6px;">
            🛒 ${resumenTexto}
          </div>
        </div>
      </div>
    `;
    
    resultadosEntregados.appendChild(div);
  });
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
          ? d.items.map(it => `${it.nombre} (${it.cantidad}x)`).join(', ')
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
    const presentacionCobro = obtenerPresentacionCobroRepartidor(d);
    div.classList.add(presentacionCobro.esPagado ? 'cobrar-pagado' : 'cobrar-pendiente');
    
    // Badge de NUEVO
    const esNuevo = esPedidoNuevo(d.created_at);
    const badgeNuevoHTML = esNuevo ? '<div class="badge-nuevo-barra">🆕 NUEVO</div>' : '';
    
    // Extraer monto del cobrarLabel
    const montoMatch = cobrarLabel.match(/\$[\d.,]+/);
    const montoTexto = montoMatch ? montoMatch[0] : '$0';
    
    // Estado de pago para mostrar
    div.innerHTML = `
      ${badgeNuevoHTML}
      <div class="card-content-horizontal" style="display:grid;grid-template-columns:1fr auto;gap:16px;align-items:start;">
        
        <!-- COLUMNA IZQUIERDA: Info principal -->
        <div style="display:flex;flex-direction:column;gap:8px;">
          <!-- Monto grande con método de pago -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:32px;font-weight:700;color:#059669;">${montoTexto}</span>
            <span style="font-size:13px;font-weight:800;color:${presentacionCobro.estadoColor};background:${presentacionCobro.estadoBg};padding:5px 10px;border-radius:999px;letter-spacing:0.02em;">${presentacionCobro.estado}</span>
            <span style="font-size:13px;font-weight:600;color:${presentacionCobro.detalleColor};background:${presentacionCobro.detalleBg};padding:5px 10px;border-radius:999px;">${presentacionCobro.icono} ${presentacionCobro.detalle}</span>
          </div>
          
          <!-- Nombre cliente -->
          <div style="font-size:16px;font-weight:600;color:#1f2937;">
            👤 ${d.nombre || '(sin nombre)'}
          </div>
          
          <!-- Teléfono clickeable con WhatsApp -->
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="fila-telefono" data-telefono="${d.telefono || ''}" data-action="call" style="font-size:16px;color:#3b82f6;cursor:pointer;">
              📞 ${d.telefono || '(sin teléfono)'}
            </span>
            ${d.telefono ? `
              <a href="https://wa.me/56${d.telefono.replace(/\D/g, '')}?text=Hola%20👋,%20somos%20Sabrofood%20🐶🐱%0AQueremos%20avisarte%20que%20tu%20pedido%20ya%20está%20listo%20y%20estamos%20próximos%20a%20realizar%20la%20entrega%20🚚%0A¿Te%20encuentras%20disponible%20para%20recibirlo?%0A¡Quedamos%20atentos!" 
                 target="_blank" 
                 style="display:inline-flex;align-items:center;justify-content:center;background:#25d366;color:white;padding:6px;border-radius:50%;text-decoration:none;width:36px;height:36px;"
                 title="Enviar WhatsApp">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </a>
            ` : ''}
          </div>
          
          <!-- Dirección con fondo amarillo -->
          <div class="fila-direccion" data-direccion="${d.direccion || ''}" data-action="navigation" style="background:#fef3c7;padding:8px 12px;border-radius:6px;font-size:15px;color:#92400e;cursor:pointer;border-left:4px solid #f59e0b;">
            📍 ${d.direccion || '(sin dirección)'}
          </div>
          
          <!-- Productos -->
          <div style="font-size:14px;color:#6b7280;background:#f9fafb;padding:6px 10px;border-radius:6px;">
            🛒 ${resumenTexto}
          </div>
          
          ${notasRegulares ? `<div style="font-size:13px;color:#dc2626;background:#fee2e2;padding:6px 10px;border-radius:6px;border-left:3px solid #dc2626;">⚠️ ${notasRegulares}</div>` : ''}
        </div>
        
        <!-- COLUMNA DERECHA: Ruta y Orden -->
        <div style="display:flex;flex-direction:column;gap:12px;min-width:120px;">
          <!-- Ruta (Prioridad) -->
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:13px;font-weight:600;color:#6b7280;">🚗 RUTA:</label>
            <select class="prioridad-select" data-doc="${d.id}" style="
              background:${prioridadInfo.bgColor};
              color:${prioridadInfo.color};
              border:2px solid ${prioridadInfo.color};
              border-radius:6px;
              padding:6px 10px;
              font-weight:700;
              font-size:14px;
              cursor:pointer;
            ">
              <option value="A" ${prioridad === 'A' ? 'selected' : ''}>🔴 Alto</option>
              <option value="B" ${prioridad === 'B' ? 'selected' : ''}>🟡 Medio</option>
              <option value="C" ${prioridad === 'C' ? 'selected' : ''}>🟢 Bajo</option>
            </select>
          </div>
          
          <!-- Orden numérico -->
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:13px;font-weight:600;color:#6b7280;">📊 ORDEN:</label>
            <input 
              type="number" 
              id="orden-${d.id}"
              class="input-orden-entrega"
              data-doc="${d.id}"
              value="${(d.orden_ruta && d.orden_ruta <= 99) ? d.orden_ruta : ''}"
              min="1"
              max="99"
              placeholder="#"
              style="
                width:100%;
                height:40px;
                padding:8px;
                border:2px solid #e5e7eb;
                border-radius:6px;
                font-size:18px;
                font-weight:600;
                text-align:center;
                background:#fff;
              "
            >
          </div>
        </div>
      </div>
      
      <!-- ACCIONES PRINCIPALES DEL REPARTIDOR (VISIBLES) -->
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
      </div>
      
      <!-- MEJORA 1: MENÚ COMPACTO DE ACCIONES -->
      <div class="btn-action" style="align-items:flex-end;position:relative;">
        ${d.metodo_pago === 'TP' ? `
          <button class="btn-transferencia-pagada" type="button" aria-label="Marcar transferencia como pagada" data-doc="${d.id}" style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;">💰 Transf. Pagada</button>
        ` : ''}
        
        <!-- Botón de menú compacto - DESHABILITADO PARA REPARTIDORES -->
        <!-- Los repartidores no necesitan editar, anular o eliminar pedidos -->
        
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
    
    // Menú de acciones removido - Los repartidores no necesitan estas opciones
    
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
    
    // Event listeners del menú de acciones removidos - No se necesitan en repartidor
    
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
  // Filtrar por fecha según el filtro activo
  let pedidosParaResumen = [];
  
  if (filtroActual === 'hoy') {
    const fechaHoy = getFechaFormateada(new Date());
    pedidosParaResumen = todosPedidosDelChofer.filter(p => p.fecha === fechaHoy);
  } else if (filtroActual === 'manana') {
    const fechaManana = getFechaManana();
    pedidosParaResumen = todosPedidosDelChofer.filter(p => p.fecha === fechaManana);
  } else if (filtroActual === 'mes') {
    pedidosParaResumen = todosPedidosDelChofer.filter(p => esMesActual(p.fecha));
  } else {
    // Si no hay filtro activo, usar los datos que se están renderizando
    pedidosParaResumen = datosParaRenderizar;
  }
  
  actualizarResumenCaja(pedidosParaResumen);
}

// Contador de resultados
function updateResultCount(n, q, pedidosConEntregados = []){
  const el = getElement('resultCount');
  if(!el) return;
  // Ocultar contador de resultados
  el.textContent = '';
  
  // Actualizar contador de pedidos en el badge
  actualizarContadorPedidos(n, pedidosConEntregados);
}

/**
 * MEJORA 3: CONTADOR DE PROGRESO
 * Muestra "✅ [Entregados] / 🚫 [Anulados] / 📦 [Total]"
 * Solo cuenta los pedidos que se están mostrando según el filtro actual
 */
function actualizarContadorPedidos(cantidad, pedidosConEntregados = []) {
  // Si se proporcionan pedidos con entregados, usarlos (incluye entregados del día filtrado)
  // Si no, usar los datos filtrados o locales (solo pendientes)
  let datosActuales;
  
  if (pedidosConEntregados.length > 0) {
    // Usar los pedidos filtrados por fecha que incluyen entregados
    datosActuales = pedidosConEntregados;
  } else {
    // Fallback: usar datos filtrados o locales
    datosActuales = datosFiltrados.length > 0 ? datosFiltrados : datosLocal;
  }
  
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
function abrirModalFormulario() {
  const [backdropEl, modalEl] = getElements('formModalBackdrop', 'formModal');
  backdropEl.style.display = 'flex';
  setTimeout(() => { modalEl.classList.add('show'); }, 10);
}

function closeFormModal(){
  const modal = document.getElementById('formModal');
  modal.classList.remove('show');
  modal.classList.add('hide');
  setTimeout(() => { 
    document.getElementById('formModalBackdrop').style.display = 'none'; 
    modal.classList.remove('hide');
  }, 300);
  
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
        'P': 'pagado pago p transferencia'
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
  
  // Filtrar TODOS los pedidos del chofer (incluyendo entregados) por la fecha del filtro
  let pedidosParaResumen = [];
  let pedidosEntregadosFiltrados = [];
  
  switch(tipoFiltro) {
    case 'hoy':
      const fechaHoy = getFechaFormateada(new Date());
      pedidosParaResumen = todosPedidosDelChofer.filter(p => p.fecha === fechaHoy);
      // Mostrar solo entregados de HOY
      pedidosEntregadosFiltrados = todosPedidosDelChofer.filter(p => p.entregado && p.fecha === fechaHoy);
      break;
      
    case 'manana':
      const fechaManana = getFechaManana();
      pedidosParaResumen = todosPedidosDelChofer.filter(p => p.fecha === fechaManana);
      // Mostrar solo entregados de MAÑANA
      pedidosEntregadosFiltrados = todosPedidosDelChofer.filter(p => p.entregado && p.fecha === fechaManana);
      break;
      
    case 'mes':
      pedidosParaResumen = todosPedidosDelChofer.filter(p => esMesActual(p.fecha));
      // Mostrar solo entregados de ESTE MES
      pedidosEntregadosFiltrados = todosPedidosDelChofer.filter(p => p.entregado && esMesActual(p.fecha));
      break;
      
    default:
      pedidosParaResumen = todosPedidosDelChofer.filter(p => esMesActual(p.fecha));
      pedidosEntregadosFiltrados = todosPedidosDelChofer.filter(p => p.entregado && esMesActual(p.fecha));
  }
  
  // Renderizar pedidos entregados en su sección (filtrados por fecha)
  renderizarPedidosEntregados(pedidosEntregadosFiltrados);
  
  // Actualizar contador con pedidos filtrados (incluyendo entregados)
  updateResultCount(resultados.length, descripcionFiltro, pedidosParaResumen);
  
  // Actualizar resumen de caja con los pedidos filtrados por fecha
  actualizarResumenCaja(pedidosParaResumen);
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
  
  // Filtrar TODOS los pedidos del chofer por la fecha específica (incluyendo entregados)
  const pedidosParaResumen = todosPedidosDelChofer.filter(p => p.fecha === fechaFiltro);
  
  // Mostrar solo entregados de la fecha específica
  const pedidosEntregadosFiltrados = todosPedidosDelChofer.filter(p => p.entregado && p.fecha === fechaFiltro);
  renderizarPedidosEntregados(pedidosEntregadosFiltrados);
  
  // Actualizar contador con pedidos filtrados (incluyendo entregados)
  updateResultCount(resultados.length, `fecha: ${fechaFiltro}`, pedidosParaResumen);
  
  actualizarResumenCaja(pedidosParaResumen);
  
  filtroActual = 'custom';
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
  
  // Aplicar filtro de HOY por defecto al iniciar
  setTimeout(() => {
    if (btnHoy) {
      btnHoy.classList.add('active');
    }
  }, 100);
  
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
  
  // Cargar pedidos iniciales
  cargarPedidos();
  
  // Activar tiempo real después de cargar pedidos
  activarTiempoReal();
  activarTiempoRealCarga(); // Sincronizar checkboxes de carga entre usuarios
}

// Event listeners para búsqueda y filtros
document.addEventListener('DOMContentLoaded', function() {
  // La autenticación ya está verificada en el HTML (route protection)
  // Si llegamos aquí, el usuario está autenticado
  console.log('✅ Usuario autenticado - Inicializando aplicación...');
  
  // Inicializar la aplicación
  inicializarApp();
  inicializarAppCompleta();
});

// ========================================
// MÓDULO FINANCIERO - RESUMEN DE CAJA
// ========================================

// Función para calcular y actualizar resumen de caja
/**
 * MEJORA 6: LÓGICA DE RECAUDACIÓN REAL
 * Calcula el dinero que el repartidor debe cobrar en la calle
 * EXCLUYE pedidos con método ya pagado (TG, P, PE, PC, PX) del total recaudado
 */
function actualizarResumenCaja(datos = []) {
  let totalEfectivo = 0;
  let totalTarjetas = 0;
  let totalTransferencias = 0;
  let totalPagados = 0; // Solo para mostrar, NO suma al total recaudado
  let cantidadEfectivo = 0;
  let cantidadTarjetas = 0;
  let cantidadTransferencias = 0;
  let cantidadPagados = 0;

  datos.forEach((pedido) => {
    // Solo contar pedidos entregados Y NO anulados
    if (pedido.entregado && pedido.estado !== 'ANULADO') {
      const metodo = normalizarMetodoPago(pedido.metodo_pago || pedido.metodo) || 'E';
      
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
        // Detectar si es pago mixto buscando en las notas
        const notas = pedido.notas || '';
        const esPagoLocalMixto = metodo === 'PX' || notas.includes('PAGADO LOCAL MIXTO');
        const esPagoMixto = !esPagoLocalMixto && (metodo === 'PM' || metodo === 'PMP' || notas.includes('PAGO MIXTO:'));

        if (esPagoLocalMixto) {
          totalPagados += total;
          cantidadPagados++;
        }
        
        else if (esPagoMixto) {
          // Extraer montos de cada método del pago mixto
          const efectivoMatch = notas.match(/💵 Efectivo: \$?([\d,.]+)/);
          const tarjetaMatch = notas.match(/💳 Tarjeta: \$?([\d,.]+)/);
          const transferenciaMatch = notas.match(/(?:🔄 Transferencia|✅ Transferencia PAGADA): \$?([\d,.]+)/);
          
          if (efectivoMatch) {
            const montoEfectivo = parseInt(efectivoMatch[1].replace(/[,\.]/g, '')) || 0;
            totalEfectivo += montoEfectivo;
          }
          
          if (tarjetaMatch) {
            const montoTarjeta = parseInt(tarjetaMatch[1].replace(/[,\.]/g, '')) || 0;
            totalTarjetas += montoTarjeta;
          }
          
          if (transferenciaMatch) {
            const montoTransferencia = parseInt(transferenciaMatch[1].replace(/[,\.]/g, '')) || 0;
            totalTransferencias += montoTransferencia;
          }
          // Pago mixto cuenta como 1 en cada método usado
          if (efectivoMatch) cantidadEfectivo++;
          if (tarjetaMatch) cantidadTarjetas++;
          if (transferenciaMatch) cantidadTransferencias++;
        } else {
          // Pago simple (no mixto)
          switch(metodo) {
            case 'E':     // Efectivo
              totalEfectivo += total;
              cantidadEfectivo++;
              break;
            case 'DC':    // Débito/Crédito
            case 'D':     // Débito (compatibilidad)
            case 'C':     // Crédito (compatibilidad) 
              totalTarjetas += total;
              cantidadTarjetas++;
              break;
            case 'T':     // Transferencia (compatibilidad)
            case 'TP':    // Transferencia Pendiente
              totalTransferencias += total;
              cantidadTransferencias++;
              break;
            case 'TG':    // Transferencia Pagada
            case 'P':     // Pagado (compatibilidad)
            case 'PE':    // Pagado Local - Efectivo
            case 'PC':    // Pagado Local - Tarjeta
            case 'PX':    // Pagado Local - Mixto
              totalPagados += total; // Mostrar para cuadre, pero NO suma a Total Recaudado
              cantidadPagados++;
              break;
            default:
              // Si no reconoce el método, asumir efectivo
              totalEfectivo += total;
              cantidadEfectivo++;
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
  
  // TOTAL A RENDIR = Solo efectivo + tarjetas (lo que el chofer trae físicamente)
  // EXCLUYE transferencias (van al banco) y pagados (ya están en el local)
  const totalARendir = totalEfectivo + totalTarjetas;
  const totalRendirEl = document.getElementById('totalRendir');
  if (totalRendirEl) {
    totalRendirEl.textContent = `$${totalARendir.toLocaleString('es-CL')}`;
  }
  
  // Mantener compatibilidad con totalGeneral (por si se usa en otra parte)
  const totalGeneralEl = document.getElementById('totalGeneral');
  if (totalGeneralEl) {
    totalGeneralEl.textContent = `$${totalARendir.toLocaleString('es-CL')}`;
  }
}

// Función para obtener el texto del precio según el método de pago
function obtenerTextoVenta(pedido) {
  // Si es transferencia pagada o método pagado
  const metodoPago = normalizarMetodoPago(pedido.metodo_pago);

  if (metodoPago === 'TG' || metodoPago === 'P' || metodoPago === 'PE' || metodoPago === 'PC' || metodoPago === 'PX') {
    const total = parseInt(pedido.total) || 0;
    
    if (metodoPago === 'TG') {
      // Transferencia pagada: mostrar "PAGADO Transferencia"
      if (total > 0) {
        return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO Transferencia $${total.toLocaleString('es-CL')}</span>`;
      }
      return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO Transferencia</span>`;
    } else if (metodoPago === 'PX') {
      if (total > 0) {
        return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO 🔀 Mixto $${total.toLocaleString('es-CL')}</span>`;
      }
      return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO 🔀 Mixto</span>`;
    } else {
      const iconoMetodo = metodoPago === 'PC' ? '💳' : '💵';
      if (total > 0) {
        return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO ${iconoMetodo} $${total.toLocaleString('es-CL')}</span>`;
      }
      return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO ${iconoMetodo}</span>`;
    }
  }
  
  const total = parseInt(pedido.total) || 0;
  
  // Si no hay método de pago definido pero hay total, mostrar PAGADO
  if (total > 0 && (!pedido.metodo_pago || pedido.metodo_pago === '' || pedido.metodo_pago === null)) {
    return `<span style="color: #10b981; font-weight: 800; background: #d1fae5; padding: 6px 12px; border-radius: 6px; border-left: 4px solid #10b981;">✅ PAGADO $${total.toLocaleString('es-CL')}</span>`;
  }
  
  if (total > 0) {
    // Obtener el método de pago para mostrar al repartidor
    const metodo = metodoPago || pedido.metodo_pago;
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
      case 'PE':
        metodoConIcono = '💵 Pagado Local - Efectivo';
        break;
      case 'PC':
        metodoConIcono = '💳 Pagado Local - Tarjeta';
        break;
      case 'PX':
        metodoConIcono = '🔀 Pagado Local - Mixto';
        break;
      default:
        metodoConIcono = `💰 ${metodoTexto}`;
    }
    
    return `$${total.toLocaleString('es-CL')} (${metodoConIcono})`;
  }
  
  // Si no hay total ni método, mostrar PAGADO
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
  
  if (!telefono || telefono.length < 7) {
    previewEl.style.display = 'none';
    return;
  }
  
  // Mostrar estado de carga
  previewEl.style.display = 'block';
  contentEl.innerHTML = '<div class="historial-loading">🔍 Buscando historial...</div>';
  
  try {
    const client = getSupabaseClient();
    if (!client) {
      contentEl.innerHTML = '<div class="historial-error">❌ Error de conexión</div>';
      return;
    }
    
    // Buscar pedidos del cliente por teléfono
    const { data, error } = await client
      .from('pedidos')
      .select('*')
      .eq('telefono', telefono)
      .order('created_at', { ascending: false })
      .limit(5); // Solo últimos 5 pedidos para preview
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      contentEl.innerHTML = '<div class="historial-empty">📝 Cliente nuevo - sin historial previo</div>';
      countEl.textContent = 'Nuevo cliente';
      return;
    }
    
    // Mostrar historial compacto
    countEl.textContent = `${data.length} pedidos${data.length >= 5 ? '+' : ''}`;
    
    let historialHTML = '';
    data.forEach((pedido, index) => {
      const fecha = pedido.fecha ? new Date(pedido.fecha).toLocaleDateString('es-CL') : 'Sin fecha';
      const productos = Array.isArray(pedido.items) && pedido.items.length 
        ? pedido.items.map(item => `${item.cantidad}× ${item.nombre}`).join(', ')
        : 'Sin productos';
      const total = pedido.total ? `$${pedido.total.toLocaleString('es-CL')}` : '$0';
      const metodoCodigo = normalizarMetodoPago(pedido.metodo_pago);
      const metodoTexto = METODOS[metodoCodigo] || pedido.metodo_pago || 'Efectivo';
      
      historialHTML += `
        <div class="historial-item">
          <div class="historial-item-header">
            <span>📅 ${fecha}</span>
            <span class="historial-item-total">${total}</span>
          </div>
          <div class="historial-item-products">
            🛒 ${productos}<br>
            💳 ${metodoTexto} ${pedido.entregado ? '• ✅ Entregado' : '• ⏳ Pendiente'}
          </div>
          <button class="btn-copiar-datos-historial" onclick="copiarDatosHistorial('${pedido.nombre?.replace(/'/g, "\\'")}', '${pedido.direccion?.replace(/'/g, "\\'")}', '${pedido.metodo_pago || 'E'}')" title="Copiar nombre y dirección al formulario">
            📋 Copiar Datos
          </button>
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
 * Copiar datos de un pedido del historial al formulario actual
 * @param {string} nombre - Nombre del cliente
 * @param {string} direccion - Dirección del cliente
 * @param {string} metodoPago - Método de pago del pedido anterior
 */
function copiarDatosHistorial(nombre, direccion, metodoPago) {
  // Copiar nombre
  const nombreInput = document.getElementById('nombre');
  if (nombreInput && nombre) {
    nombreInput.value = nombre;
  }
  
  // Copiar dirección
  const direccionInput = document.getElementById('direccion');
  if (direccionInput && direccion) {
    direccionInput.value = direccion;
  }
  
  // Copiar método de pago (opcional, por si el cliente siempre paga igual)
  const metodoPagoSelect = document.getElementById('metodoPago');
  if (metodoPagoSelect && metodoPago) {
    metodoPagoSelect.value = metodoPago;
  }
  
  // Mostrar notificación de éxito
  ErrorHandler.mostrarExito('✅ Datos copiados: Nombre y Dirección');
  
  // Ocultar el historial después de copiar (opcional)
  const historialPreview = document.getElementById('historialPreview');
  if (historialPreview) {
    historialPreview.style.display = 'none';
  }
}

// Event listener para el campo teléfono
function configurarBusquedaHistorial() {
  const telefonoInput = document.getElementById('telefono');
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

function actualizarStockLocal(productoId, cantidadCambio) {
  console.log(`🔄 Actualización local de stock omitida en repartidor (${productoId}: ${cantidadCambio})`);
}

async function descontarStockPedido(pedidoId, pedido) {
  try {
    const items = pedido.items || [];
    const productosConId = items.filter(item => item.producto_id);

    if (productosConId.length === 0) {
      console.log('📦 Pedido sin productos del catálogo, no se descuenta stock');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible para descontar stock');
      return;
    }

    console.log(`📦 Procesando ${productosConId.length} productos para descuento de stock...`);

    for (const item of productosConId) {
      try {
        const { data: producto, error: errorGet } = await client
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

        const { error: errorUpdate } = await client
          .from('productos')
          .update({ stock: nuevoStock })
          .eq('id', item.producto_id);

        if (errorUpdate) {
          console.error(`❌ Error actualizando stock de ${item.nombre}:`, errorUpdate);
          continue;
        }

        const { error: errorMovimiento } = await client
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
          console.error('⚠️ Error registrando movimiento:', errorMovimiento);
        }
      } catch (error) {
        console.error(`❌ Error procesando producto ${item.nombre}:`, error);
      }
    }
  } catch (error) {
    console.error('❌ Error en descontarStockPedido:', error);
  }
}

async function devolverStockPedido(pedidoId, pedido) {
  try {
    const items = pedido.items || [];
    const productosConId = items.filter(item => item.producto_id);

    if (productosConId.length === 0) {
      console.log('📦 Pedido sin productos del catálogo, no se devuelve stock');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible para devolver stock');
      return;
    }

    console.log(`♻️ Devolviendo stock de ${productosConId.length} productos...`);

    for (const item of productosConId) {
      try {
        const { data: producto, error: errorGet } = await client
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

        const { error: errorUpdate } = await client
          .from('productos')
          .update({ stock: nuevoStock })
          .eq('id', item.producto_id);

        if (errorUpdate) {
          console.error(`Error actualizando stock de ${item.nombre}:`, errorUpdate);
          continue;
        }

        await client
          .from('movimientos_stock')
          .insert([{
            producto_id: item.producto_id,
            pedido_id: pedidoId,
            tipo: 'DEVOLUCION',
            cantidad: item.cantidad,
            stock_anterior: stockAnterior,
            stock_nuevo: nuevoStock,
            usuario: 'sistema_reparto',
            motivo: 'Pedido anulado - Devolución de stock'
          }]);
      } catch (error) {
        console.error(`Error procesando producto ${item.nombre}:`, error);
      }
    }

    await client
      .from('alertas_sistema')
      .insert([{
        tipo: 'PEDIDO_ANULADO',
        titulo: '⚠️ Pedido anulado - Stock restaurado',
        mensaje: `El pedido #${pedidoId} fue anulado. Se restauraron ${productosConId.length} productos al inventario.`,
        pedido_id: pedidoId,
        leido: false
      }]);
  } catch (error) {
    console.error('❌ Error en devolverStockPedido:', error);
  }
}

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
  const nombreProducto = item?.nombre || 'producto_sin_nombre';
  const productoToken = item?.producto_id ? `prod_${item.producto_id}` : 'manual';
  return `chk_${normalizarPedidoId(pedidoId)}_${productoToken}_${itemIndex}_${normalizarNombreProducto(nombreProducto)}`;
}

function buscarItemCargaPorPersistencia(checkboxId) {
  if (!checkboxId) return null;

  return document.querySelector(
    `.item-carga[data-checkbox-id="${checkboxId}"], ` +
    `.item-carga[data-legacy-checkbox-id="${checkboxId}"], ` +
    `.item-carga[data-persisted-checkbox-id="${checkboxId}"]`
  );
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

  return '';
}

/**
 * Generar resumen de carga desde los pedidos visibles
 * AGRUPADO POR PRIORIDAD (Ruta A, B, C)
 */
function generarResumenCarga() {
  // Usar los datos actualmente filtrados/visibles en pantalla
  const datosActuales = datosFiltrados.length > 0 ? datosFiltrados : datosLocal;
  
  // Obtener solo pedidos pendientes y con items (filtrado eficiente)
  const pedidosPendientes = datosActuales.filter(p => !p.entregado && p.items?.length > 0);
  
  if (pedidosPendientes.length === 0) {
    return { itemsPorPrioridad: {}, totalBultos: 0 };
  }
  
  // Arrays separados por prioridad - SIN agrupar (cada producto es independiente)
  const arraysPrioridad = {
    A: [],
    B: [],
    C: []
  };
  
  // Procesar todos los pedidos - CREAR UNA LÍNEA POR CADA PRODUCTO DE CADA PEDIDO
  for (const pedido of pedidosPendientes) {
    const prioridad = pedido.prioridad || 'C';
    const nombreCliente = pedido.nombre || 'Cliente sin nombre';
    const pedidoId = pedido.id;
    
    // Procesar items del pedido - CADA UNO GENERA UNA LÍNEA INDEPENDIENTE
    for (const [itemIndex, item] of pedido.items.entries()) {
      const nombreProducto = item.nombre || 'Producto sin nombre';
      const cantidad = parseInt(item.cantidad) || 1;
      const productoId = item.producto_id || null;
      
      // CLAVE: NO agrupar, crear entrada independiente por pedido
      arraysPrioridad[prioridad].push({
        nombre: nombreProducto,
        cantidad: cantidad,
        cliente: nombreCliente,
        pedidoId: pedidoId,
        productoId: productoId,
        checkboxId: crearCheckboxIdCarga(pedidoId, item, itemIndex),
        legacyCheckboxId: crearCheckboxIdLegacy(pedidoId, nombreProducto),
        compatKey: crearClaveCompatibilidadCarga(pedidoId, item)
      });
    }
  }
  
  // Ordenar cada array alfabéticamente por nombre de producto
  // Así, productos iguales de distintos pedidos aparecen juntos visualmente
  const procesarArray = (array) => {
    const itemsOrdenados = array.sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    // CORRECCIÓN: Productos a granel cuentan como 1 bulto, no el precio
    const bultos = itemsOrdenados.reduce((sum, item) => {
      const esGranel = item.nombre && (
        item.nombre.toLowerCase().includes('(granel)') || 
        item.nombre.toLowerCase().includes('granel')
      );
      
      // Si es granel → 1 bulto (el precio está en "cantidad" pero es 1 bulto físico)
      // Si NO es granel → usar cantidad normal
      return sum + (esGranel ? 1 : item.cantidad);
    }, 0);
    
    return { items: itemsOrdenados, bultos };
  };
  
  const resultadoA = procesarArray(arraysPrioridad.A);
  const resultadoB = procesarArray(arraysPrioridad.B);
  const resultadoC = procesarArray(arraysPrioridad.C);
  
  return { 
    itemsPorPrioridad: {
      A: resultadoA,
      B: resultadoB,
      C: resultadoC
    },
    totalBultos: resultadoA.bultos + resultadoB.bultos + resultadoC.bultos
  };
}

/**
 * Mostrar modal de resumen de carga AGRUPADO POR PRIORIDAD
 */
async function mostrarModalCarga() {
  const modal = document.getElementById('modalCarga');
  const modalBody = document.getElementById('modalCargaBody');
  const totalBultosEl = document.getElementById('totalBultos');
  
  if (!modal || !modalBody || !totalBultosEl) {
    alert('Error: No se pudo abrir el modal de carga');
    return;
  }
  
  // Mostrar modal inmediatamente con loading
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  modalBody.innerHTML = '<div style="text-align: center; padding: 40px; color: #667eea;">⏳ Cargando desde Supabase...</div>';
  
  // Cargar items marcados desde Supabase ANTES de renderizar
  const itemsMarcados = await cargarItemsMarcados();
  console.log('🔍 ITEMS MARCADOS CARGADOS:', itemsMarcados.size, 'items');
  console.log('🔍 IDs cargados:', Array.from(itemsMarcados));
  
  // Generar contenido en el siguiente frame para no bloquear
  requestAnimationFrame(() => {
    const { itemsPorPrioridad, totalBultos } = generarResumenCarga();
  
  console.log('Items por prioridad:', itemsPorPrioridad);
  console.log('Total bultos:', totalBultos);
  
  // Verificar si hay productos para cargar
  const hayProductos = (itemsPorPrioridad.A?.items.length || 0) + 
                       (itemsPorPrioridad.B?.items.length || 0) + 
                       (itemsPorPrioridad.C?.items.length || 0) > 0;
  
  if (!hayProductos) {
    const datosActuales = datosFiltrados.length > 0 ? datosFiltrados : datosLocal;
    const totalPendientes = datosActuales.filter(p => !p.entregado).length;
    
    modalBody.innerHTML = `
      <div class="mensaje-vacio-carga">
        📦 No hay productos para cargar
        <br><br>
        <small style="color: #6b7280;">
          ${totalPendientes === 0 
            ? '✅ ¡Todos los pedidos visibles ya fueron entregados!' 
            : '⚠️ Los pedidos no tienen productos registrados'}
          <br><br>
          <strong>Datos actuales:</strong><br>
          • Pedidos visibles: ${datosActuales.length}<br>
          • Pendientes: ${totalPendientes}<br>
          • Entregados: ${datosActuales.filter(p => p.entregado).length}
        </small>
      </div>
    `;
    totalBultosEl.textContent = '0';
  } else {
    // Construir HTML simple y eficiente
    let html = '';
    let idx = 0;
    
    // Items marcados ya cargados desde Supabase (variable externa: itemsMarcados)
    
    // Helper optimizado con persistencia - NUEVO FORMATO (producto + cliente)
    const genSeccion = (d, i, t, c) => {
      if (!d?.items.length) return '';
      let items = '';
      for (const item of d.items) {
        // Usar el checkboxId único generado en generarResumenCarga
        const checkboxId = item.checkboxId || `check-${idx}`;
        const legacyCheckboxId = item.legacyCheckboxId || '';
        const compatKey = item.compatKey || '';
        const persistedCheckboxId = obtenerCheckboxPersistido(item, itemsMarcados);
        const estaMarcado = Boolean(persistedCheckboxId);
        const checked = estaMarcado ? 'checked' : '';
        const checkedClass = estaMarcado ? ' checked' : '';
        
        console.log(`🔍 Renderizando: ${checkboxId} | Marcado: ${estaMarcado} | Producto: ${item.nombre}`);
        
        // Mostrar producto grande y cliente pequeño debajo
        // Para productos granel, mostrar cantidad como monto ($20000)
        const esGranel = item.nombre.toLowerCase().includes('(granel)');
        const cantidadMostrar = esGranel ? `$${item.cantidad.toLocaleString('es-CL')}` : item.cantidad;
        
        items += `
          <div class="item-carga${checkedClass}"
            data-checkbox-id="${checkboxId}"
            data-legacy-checkbox-id="${legacyCheckboxId}"
            data-persisted-checkbox-id="${persistedCheckboxId}"
               data-compat-key="${compatKey}"
            data-producto-id="${item.productoId || ''}"
            data-cantidad="${item.cantidad}"
            data-nombre="${item.nombre}"
            data-pedido-id="${item.pedidoId}">
            <input type="checkbox" class="checkbox-carga" id="${checkboxId}" ${checked} onchange="toggleItemCargaCheckbox(this)">
            <label for="${checkboxId}" class="item-texto">
              <div class="item-producto-nombre">${item.nombre}</div>
              <div class="item-cliente-nombre">Para: ${item.cliente}</div>
            </label>
            <span class="item-cantidad">${cantidadMostrar}</span>
          </div>`;
        idx++;
      }
      return `<div class="seccion-prioridad ${c}"><div class="seccion-header"><span class="seccion-icono">${i}</span><span class="seccion-titulo">${t}</span><span class="seccion-badge">${d.bultos} bultos</span></div><div class="seccion-items">${items}</div></div>`;
    };
    
    // Construir todo en una sola asignación
    html = genSeccion(itemsPorPrioridad.A, '🔴', 'RUTA A - ALTA PRIORIDAD', 'seccion-prioridad-a') +
           genSeccion(itemsPorPrioridad.B, '🟠', 'RUTA B - MEDIA PRIORIDAD', 'seccion-prioridad-b') +
           genSeccion(itemsPorPrioridad.C, '🟢', 'RUTA C - BAJA PRIORIDAD', 'seccion-prioridad-c');
    
    // Single DOM write
    modalBody.innerHTML = html;
    totalBultosEl.textContent = totalBultos;
  }
  });
}

/**
 * MEJORA 4: Toggle item con onchange directo en el checkbox
 * Guarda/elimina items marcados en Supabase usando ID único (pedido + producto)
 * @param {HTMLInputElement} checkbox - El checkbox que cambió
 */
async function toggleItemCargaCheckbox(checkbox) {
  const itemCarga = checkbox.closest('.item-carga');
  if (!itemCarga) return;
  
  const checkboxId = itemCarga.dataset.checkboxId;
  const persistedCheckboxId = itemCarga.dataset.persistedCheckboxId || checkboxId;
  const checked = checkbox.checked;
  
  console.log(`🔄 Toggle checkbox: ${checkboxId} -> ${checked ? 'MARCADO' : 'DESMARCADO'}`);
  
  // Actualizar UI
  itemCarga.classList.toggle('checked', checked);
  
  checkbox.disabled = true;

  try {
    const itemInfo = {
      productoId: itemCarga.dataset.productoId ? parseInt(itemCarga.dataset.productoId) : null,
      cantidad: parseInt(itemCarga.dataset.cantidad) || 0,
      nombre: itemCarga.dataset.nombre || '',
      pedidoId: itemCarga.dataset.pedidoId || ''
    };

    if (checked) {
      await agregarItemMarcado(checkboxId, itemInfo);
      itemCarga.dataset.persistedCheckboxId = checkboxId;
    } else {
      await eliminarItemMarcado(persistedCheckboxId);
      itemCarga.dataset.persistedCheckboxId = '';
    }
  } catch (error) {
    console.error('❌ Error al persistir checkbox de carga:', error);
    checkbox.checked = !checked;
    itemCarga.classList.toggle('checked', !checked);
  } finally {
    checkbox.disabled = false;
  }
}

/**
 * DEPRECATED: Antigua función toggleItemCarga (mantener por compatibilidad)
 */
function toggleItemCarga(itemCarga, event) {
  console.warn('⚠️ toggleItemCarga está deprecated, usa toggleItemCargaCheckbox');
}

/**
 * Cerrar modal de resumen de carga
 */
function cerrarModalCarga() {
  const modal = document.getElementById('modalCarga');
  
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

// Event listeners para el modal de carga
document.addEventListener('DOMContentLoaded', function() {
  // Limpiar localStorage del zoom eliminado
  localStorage.removeItem('app_zoom');
  
  // ========================================
  // CONTROL DE DENSIDAD
  // ========================================
  const densitySlider = document.getElementById('densitySlider');
  const densityValue = document.getElementById('densityValue');
  
  if (densitySlider && densityValue) {
    // Cargar densidad guardada
    const savedDensity = localStorage.getItem('app_density') || '1';
    densitySlider.value = savedDensity;
    aplicarDensidad(savedDensity);
    
    // Listener para cambios en el slider
    densitySlider.addEventListener('input', function(e) {
      const factor = parseFloat(e.target.value);
      aplicarDensidad(factor);
      localStorage.setItem('app_density', factor);
    });
  }
  
  function aplicarDensidad(factor) {
    const f = parseFloat(factor);
    const root = document.documentElement.style;
    
    // Actualizar TODAS las variables CSS dinámicamente
    root.setProperty('--t-fuente', `${16 * f}px`);
    root.setProperty('--t-fuente-title', `${18 * f}px`);
    root.setProperty('--t-fuente-small', `${14 * f}px`);
    root.setProperty('--t-fuente-tiny', `${12 * f}px`);
    root.setProperty('--t-padding', `${20 * f}px`);
    root.setProperty('--t-padding-btn', `${14 * f}px`);
    root.setProperty('--t-gap', `${12 * f}px`);
    root.setProperty('--t-gap-small', `${8 * f}px`);
    root.setProperty('--t-border-radius', `${16 * f}px`);
    root.setProperty('--t-btn-height', `${45 * f}px`);
    root.setProperty('--t-line-height', `${1.5 * f}`);
    
    // Actualizar display del porcentaje
    const densityValue = document.getElementById('densityValue');
    if (densityValue) {
      densityValue.textContent = Math.round(f * 100) + '%';
    }
    
    console.log(`📐 Densidad aplicada: ${Math.round(f * 100)}%`);
  }
  
  const btnVerCarga = document.getElementById('btnVerCarga');
  const btnCerrarCarga = document.getElementById('btnCerrarCarga');
  const modalBackdrop = document.getElementById('modalCarga');
  
  if (btnVerCarga) {
    btnVerCarga.addEventListener('click', mostrarModalCarga);
  }
  
  if (btnCerrarCarga) {
    btnCerrarCarga.addEventListener('click', cerrarModalCarga);
  }
  
  // Cerrar al hacer clic fuera del modal
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', function(e) {
      if (e.target === modalBackdrop) {
        cerrarModalCarga();
      }
    });
  }
  
  // Cerrar con tecla ESC
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const modal = document.getElementById('modalCarga');
      if (modal && modal.style.display === 'flex') {
        cerrarModalCarga();
      }
    }
  });
  
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
const CARGA_LOCAL_STATE_KEY = 'sabrofood_carga_estado';

function cargarEstadoLocalCarga() {
  try {
    return JSON.parse(localStorage.getItem(CARGA_LOCAL_STATE_KEY) || '{}');
  } catch (error) {
    console.error('Error al cargar estado local de carga:', error);
    return {};
  }
}

function guardarEstadoLocalCarga(estado) {
  try {
    localStorage.setItem(CARGA_LOCAL_STATE_KEY, JSON.stringify(estado));
  } catch (error) {
    console.error('Error al guardar estado local de carga:', error);
  }
}

function aplicarOverridesLocalesCarga(itemsMarcados) {
  const estadoLocal = cargarEstadoLocalCarga();

  Object.entries(estadoLocal).forEach(([checkboxId, marcado]) => {
    if (marcado) {
      itemsMarcados.add(checkboxId);
    } else {
      itemsMarcados.delete(checkboxId);
    }
  });

  return itemsMarcados;
}

/**
 * Cargar items marcados desde Supabase (TODOS LOS USUARIOS VEN LO MISMO)
 * @returns {Promise<Set>} Set con checkboxIds marcados
 */
async function cargarItemsMarcados() {
  try {
    console.log('📥 Cargando items marcados desde Supabase...');
    const cacheLocal = aplicarOverridesLocalesCarga(new Set());
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente Supabase no disponible para cargar items');
      itemsMarcadosCache = cacheLocal;
      return itemsMarcadosCache;
    }
    
    const { data, error } = await client
      .from('carga_marcados')
      .select('checkbox_id, marcado, updated_at, pedido_id, producto_id, cantidad, nombre_producto')
      .eq('marcado', true);
    
    if (error) {
      console.error('❌ Error al cargar items marcados:', error);
      console.error('Detalles del error:', JSON.stringify(error, null, 2));
      itemsMarcadosCache = cacheLocal;
      return itemsMarcadosCache;
    }
    
    itemsMarcadosCache = aplicarOverridesLocalesCarga(new Set(data.map(item => item.checkbox_id)));
    itemsMarcadosDetalleCache = new Map();
    data.forEach((item) => {
      const compatKey = crearClaveCompatibilidadCarga(item.pedido_id, item);
      itemsMarcadosDetalleCache.set(compatKey, item.checkbox_id);
    });
    console.log(`✅ Cargados ${itemsMarcadosCache.size} items marcados:`, Array.from(itemsMarcadosCache));
    return itemsMarcadosCache;
  } catch (e) {
    console.error('❌ Excepción al cargar items marcados:', e);
    return itemsMarcadosCache;
  }
}

/**
 * Agregar un item a la lista de marcados en Supabase
 * @param {string} checkboxId - ID único del checkbox
 */
async function agregarItemMarcado(checkboxId, itemInfo = null) {
  try {
    itemsMarcadosCache.add(checkboxId);
    const estadoLocal = cargarEstadoLocalCarga();
    estadoLocal[checkboxId] = true;
    guardarEstadoLocalCarga(estadoLocal);

    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente Supabase no disponible');
      return;
    }

    const insertData = {
      checkbox_id: checkboxId,
      marcado: true,
      updated_at: new Date().toISOString()
    };

    if (itemInfo) {
      insertData.pedido_id = itemInfo.pedidoId;
      insertData.producto_id = itemInfo.productoId;
      insertData.cantidad = itemInfo.cantidad;
      insertData.nombre_producto = itemInfo.nombre;
      const compatKey = crearClaveCompatibilidadCarga(itemInfo.pedidoId, itemInfo);
      itemsMarcadosDetalleCache.set(compatKey, checkboxId);
    }

    const { error } = await client
      .from('carga_marcados')
      .upsert(insertData, {
        onConflict: 'checkbox_id'
      });

    if (error) {
      console.error('Error al marcar item:', error);
      console.warn('⚠️ El item quedó guardado solo en este dispositivo');
      return;
    }

    console.log('✅ Item guardado en carga_marcados exitosamente');

    if (itemInfo && itemInfo.productoId) {
      console.log('⏳ Intentando descontar stock...');
      try {
        await descontarStockItem(itemInfo);
      } catch (stockError) {
        console.warn('⚠️ No se pudo descontar stock, pero el item quedó marcado:', stockError);
      }
    } else if (itemInfo) {
      console.warn('⚠️ Item sin producto_id - No se descuenta stock (producto manual o antiguo)');
    }
  } catch (e) {
    console.error('❌ Error CRÍTICO al guardar en carga_marcados:', e);
    itemsMarcadosCache.delete(checkboxId);
    throw e;
  }
}

async function descontarStockItem(itemInfo) {
  try {
    console.log(`🔄 Intentando descontar stock de "${itemInfo.nombre}" (${itemInfo.cantidad} unid.)...`);

    if (!itemInfo.productoId || itemInfo.productoId <= 0) {
      console.warn(`⚠️ producto_id inválido (${itemInfo.productoId}), omitiendo descuento de stock`);
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible para descontar stock item');
      return;
    }

    const { data: producto, error: errorGet } = await client
      .from('productos')
      .select('stock, nombre')
      .eq('id', itemInfo.productoId)
      .maybeSingle();

    if (errorGet) {
      console.error(`❌ Error al consultar producto ${itemInfo.productoId}:`, errorGet);
      console.warn('⚠️ El checkbox se guardó pero no se pudo verificar el stock');
      return;
    }

    if (!producto) {
      console.warn(`⚠️ Producto ID ${itemInfo.productoId} no existe en la tabla "productos"`);
      return;
    }

    const stockAnterior = Math.floor(producto.stock || 0);
    const nuevoStock = stockAnterior - itemInfo.cantidad;

    const { error: errorUpdate } = await client
      .from('productos')
      .update({ stock: nuevoStock })
      .eq('id', itemInfo.productoId);

    if (errorUpdate) {
      console.error('❌ Error actualizando stock:', errorUpdate);
      return;
    }

    const { error: errorMov } = await client
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

    if (errorMov) {
      console.warn('⚠️ Stock descontado pero no se registró en historial:', errorMov);
    }
  } catch (error) {
    console.error('❌ Excepción en descontarStockItem:', error);
  }
}

async function devolverStockItem(checkboxId) {
  try {
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible para devolver stock item');
      return;
    }

    const { data, error } = await client
      .from('carga_marcados')
      .select('pedido_id, producto_id, cantidad, nombre_producto')
      .eq('checkbox_id', checkboxId)
      .single();

    if (error || !data || !data.producto_id) {
      console.log('⚠️ Item no tiene producto_id, no se devuelve stock');
      return;
    }

    const { data: producto, error: errorGet } = await client
      .from('productos')
      .select('stock, nombre')
      .eq('id', data.producto_id)
      .single();

    if (errorGet) {
      console.error('❌ Error obteniendo producto:', errorGet);
      return;
    }

    const stockAnterior = Math.floor(producto.stock || 0);
    const nuevoStock = stockAnterior + data.cantidad;

    const { error: errorUpdate } = await client
      .from('productos')
      .update({ stock: nuevoStock })
      .eq('id', data.producto_id);

    if (errorUpdate) {
      console.error('❌ Error devolviendo stock:', errorUpdate);
      return;
    }

    const { error: errorDelete } = await client
      .from('movimientos_stock')
      .delete()
      .eq('producto_id', data.producto_id)
      .eq('pedido_id', data.pedido_id)
      .eq('tipo', 'SALIDA')
      .eq('cantidad', data.cantidad);

    if (errorDelete) {
      console.warn('⚠️ No se pudo eliminar movimiento (no crítico):', errorDelete);
    }
  } catch (e) {
    console.error('❌ Error en devolverStockItem:', e);
  }
}

async function devolverStockItemsMarcados(pedidoId, pedido = null) {
  try {
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible para devolver items marcados');
      return;
    }

    const { data: itemsMarcados, error } = await client
      .from('carga_marcados')
      .select('checkbox_id, producto_id, cantidad, nombre_producto')
      .eq('pedido_id', pedidoId);

    if (error) {
      console.error('❌ Error consultando items marcados:', error);
      return;
    }

    if (!itemsMarcados || itemsMarcados.length === 0) {
      console.log('ℹ️ El pedido no tiene items marcados en carga - no hay stock para devolver');
      return;
    }

    let itemsDevueltos = 0;
    for (const item of itemsMarcados) {
      if (!item.producto_id) {
        continue;
      }

      try {
        const { data: producto, error: errorGet } = await client
          .from('productos')
          .select('stock, nombre')
          .eq('id', item.producto_id)
          .single();

        if (errorGet) {
          continue;
        }

        const stockAnterior = Math.floor(producto.stock || 0);
        const nuevoStock = stockAnterior + item.cantidad;

        const { error: errorUpdate } = await client
          .from('productos')
          .update({ stock: nuevoStock })
          .eq('id', item.producto_id);

        if (errorUpdate) {
          continue;
        }

        await client
          .from('movimientos_stock')
          .delete()
          .eq('producto_id', item.producto_id)
          .eq('pedido_id', pedidoId)
          .eq('tipo', 'SALIDA')
          .eq('cantidad', item.cantidad);

        itemsDevueltos++;
      } catch (itemError) {
        console.error('❌ Error procesando item:', itemError);
      }
    }

    const { error: errorDelete } = await client
      .from('carga_marcados')
      .delete()
      .eq('pedido_id', pedidoId);

    if (errorDelete) {
      console.error('❌ Error eliminando items de carga_marcados:', errorDelete);
    }

    console.log(`✅ Stock devuelto exitosamente: ${itemsDevueltos} items procesados`);
  } catch (error) {
    console.error('❌ Error en devolverStockItemsMarcados:', error);
  }
}

/**
 * Eliminar un item de la lista de marcados en Supabase
 * @param {string} checkboxId - ID único del checkbox
 */
async function eliminarItemMarcado(checkboxId) {
  try {
    try {
      await devolverStockItem(checkboxId);
    } catch (stockError) {
      console.warn('⚠️ Error devolviendo stock, pero continuando con desmarcado:', stockError);
    }

    itemsMarcadosCache.delete(checkboxId);
    const estadoLocal = cargarEstadoLocalCarga();
    estadoLocal[checkboxId] = false;
    guardarEstadoLocalCarga(estadoLocal);
    
    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente Supabase no disponible');
      return;
    }
    
    const { error } = await client
      .from('carga_marcados')
      .delete()
      .eq('checkbox_id', checkboxId);
    
    if (error) {
      console.error('❌ Error al eliminar de carga_marcados:', error);
      console.warn('⚠️ El desmarcado quedó aplicado solo en este dispositivo');
      return;
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
    guardarEstadoLocalCarga({});

    const client = getSupabaseClient();
    if (!client) {
      console.error('❌ Cliente no disponible');
      return;
    }

    const { error } = await client
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
function toggleMenuAcciones(menuElement) {
  if (!menuElement) return;
  
  // Cerrar otros menús abiertos
  document.querySelectorAll('.menu-acciones-dropdown').forEach(menu => {
    if (menu !== menuElement) {
      menu.style.display = 'none';
    }
  });
  
  // Toggle del menú actual
  const isVisible = menuElement.style.display === 'block';
  menuElement.style.display = isVisible ? 'none' : 'block';
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

// === SELECTOR DE CHOFER - INICIALIZACIÓN ===
// Esto debe estar AL FINAL para que todas las variables estén definidas
document.addEventListener('DOMContentLoaded', () => {
  console.log('=== INICIALIZANDO SELECTOR REPARTIDOR ===');
  
  // SELECTOR DE CHOFER: Recargar pedidos cuando se seleccione un repartidor
  const selectorChofer = document.getElementById('selectorChofer');
  console.log('🔍 Selector de chofer encontrado:', selectorChofer ? 'SÍ' : 'NO');
  
  if (selectorChofer) {
    // Recuperar perfil guardado de localStorage
    const perfilGuardado = localStorage.getItem('repartidor_perfil');
    if (perfilGuardado) {
      selectorChofer.value = perfilGuardado;
      console.log('✅ Perfil recuperado de localStorage:', perfilGuardado);
    }
    
    console.log('✅ Agregando listener al selector de chofer');
    selectorChofer.addEventListener('change', function() {
      console.log('🚚 ===== EVENTO CHANGE DISPARADO =====');
      console.log('🚚 Chofer seleccionado:', this.value);
      
      // Guardar perfil seleccionado en localStorage
      if (this.value) {
        localStorage.setItem('repartidor_perfil', this.value);
        console.log('💾 Perfil guardado en localStorage');
      } else {
        localStorage.removeItem('repartidor_perfil');
        console.log('🗑️ Perfil eliminado de localStorage');
      }
      
      cargarPedidos(); // Recargar con el nuevo filtro
    });
    
    // También escuchar cuando seleccione del dropdown
    selectorChofer.addEventListener('click', function() {
      console.log('🖱️ Click en selector');
    });
  } else {
    console.error('❌ NO SE ENCONTRÓ EL SELECTOR DE CHOFER');
  }
  
  // Llamada inicial para mostrar mensaje de bienvenida (o pedidos si hay perfil guardado)
  console.log('⏰ Programando carga inicial en 500ms...');
  setTimeout(() => {
    console.log('⏰ Ejecutando carga inicial');
    if (typeof cargarPedidos === 'function') {
      cargarPedidos();
    } else {
      console.error('❌ cargarPedidos no es una función');
    }
  }, 500);
});
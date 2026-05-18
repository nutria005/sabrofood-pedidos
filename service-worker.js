// ===================================
// 🚚 SABROFOOD REPARTO PWA SERVICE WORKER
// ===================================
// Versión: 2.1.2-ver-carga-sync-fix
// Fecha: 17-05-2026
// 
// CAMBIOS EN ESTA VERSIÓN:
// - Network First para archivos críticos (script.js, style.css, index.html)
// - Cache First solo para assets estáticos (fuentes, imágenes, libs)
// - Mejor manejo de errores y logs
// - Soporte para actualización forzada desde la app
// - Prevención de caché agresivo en iOS PWA
// - Timeout de 3s en peticiones de red
// ===================================

const CACHE_VERSION = 'sabrofood-reparto-v2.1.2-ver-carga-sync-fix';
const CACHE_NAME = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

// ===================================
// CONFIGURACIÓN DE CACHÉ
// ===================================

// 🔥 ARCHIVOS CRÍTICOS - Network First (siempre buscar versión nueva primero)
// Estos archivos deben estar SIEMPRE actualizados para que los fixes funcionen
const NETWORK_FIRST_FILES = [
  './index.html',
  './local/index.html',
  './local/ver-carga.html',
  './local/script.js',
  './local/style.css',
  './local/ver-carga.js',
  './local/ver-carga.css',
  './repartidor/index.html',
  './repartidor/ver-carga.html',
  './repartidor/script.js',
  './repartidor/style.css',
  './shared/auth.js',
  './shared/roles-config.js',
  './shared/route-protection.js',
  './shared/supabase-config.js'
];

// 📦 ASSETS ESTÁTICOS - Cache First (ok si están cacheados)
// Fuentes, librerías, manifest, etc. No cambian frecuentemente
const CACHE_FIRST_ASSETS = [
  './',
  './manifest.json',
  // Fuentes de Google
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap',
  'https://fonts.gstatic.com'
];

// 🚫 URLs QUE NUNCA SE CACHEAN - Solo APIs y auth
const NEVER_CACHE = [
  '.supabase.co',             // API de Supabase
  'supabase.co',              // Realtime y auth
  '/auth/',                   // Endpoints de autenticación
  '/rest/',                   // API REST de Supabase
  '/realtime/'                // WebSockets tiempo real
];

// ===================================
// 📦 INSTALACIÓN DEL SERVICE WORKER
// ===================================
self.addEventListener('install', (event) => {
  console.log('[SW Reparto] 🚀 Instalando Service Worker...', CACHE_VERSION);
  console.log('[SW Reparto] 📋 Estrategia: Network First para archivos críticos, Cache First para assets');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW Reparto] 💾 Pre-cacheando archivos estáticos...');
        // Solo pre-cachear assets que no cambian frecuentemente
        return cache.addAll(CACHE_FIRST_ASSETS);
      })
      .then(() => {
        console.log('[SW Reparto] ✅ Pre-caché completado');
        // NO hacer skipWaiting aquí - esperar a que la app lo solicite
        // return self.skipWaiting(); 
      })
      .catch((error) => {
        console.error('[SW Reparto] ❌ Error al cachear:', error);
        // Aún así, marcar como instalado
        return self.skipWaiting();
      })
  );
});

// ===================================
// 🔄 ACTIVACIÓN Y LIMPIEZA DE CACHÉS VIEJOS
// ===================================
self.addEventListener('activate', (event) => {
  console.log('[SW Reparto] 🔄 Activando Service Worker...', CACHE_VERSION);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Eliminar cachés de versiones anteriores
              return name.startsWith('sabrofood-reparto-') && 
                     name !== CACHE_NAME && 
                     name !== DATA_CACHE;
            })
            .map((name) => {
              console.log('[SW Reparto] 🗑️ Eliminando caché viejo:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW Reparto] ✅ Service Worker activado y limpio');
        return self.clients.claim(); // Tomar control inmediato
      })
  );
});

// ===================================
// 🌐 INTERCEPTAR PETICIONES (FETCH)
// ===================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 🚫 REGLA 1: APIs de Supabase - Network Only (nunca cachear)
  if (shouldNeverCache(url.href)) {
    event.respondWith(
      fetch(request).catch(error => {
        console.log('[SW Reparto] 📡 API offline:', request.url);
        return new Response(
          JSON.stringify({ error: 'Sin conexión a internet' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // 🔥 REGLA 2: Archivos críticos - Network First (siempre buscar nueva versión)
  if (isNetworkFirstFile(url.pathname)) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // 📦 REGLA 3: Assets estáticos - Cache First
  event.respondWith(cacheFirstStrategy(request));
});

// ===================================
// 📋 ESTRATEGIAS DE CACHÉ
// ===================================

/**
 * 🔥 NETWORK FIRST - Para archivos críticos
 * Intenta descargar de red primero, usa caché solo si falla
 * Esto asegura que iOS PWA siempre tenga la última versión
 */
async function networkFirstStrategy(request) {
  const url = request.url;
  
  try {
    // Intentar red primero con timeout de 3 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const networkResponse = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    // Si la respuesta es exitosa, actualizar caché
    if (networkResponse && networkResponse.status === 200) {
      console.log('[SW Reparto] ✅ Archivo crítico actualizado desde red:', url);
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    
    return networkResponse;

  } catch (error) {
    // Error de red o timeout - intentar caché
    console.log('[SW Reparto] 📡 Red no disponible, usando caché:', url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      console.log('[SW Reparto] 💾 Sirviendo desde caché (offline):', url);
      return cachedResponse;
    }
    
    // No hay caché - retornar error
    console.error('[SW Reparto] ❌ No disponible ni en red ni en caché:', url);
    return new Response('Archivo no disponible offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

/**
 * 📦 CACHE FIRST - Para assets estáticos
 * Usa caché primero, descarga si no existe
 * Opcional: actualiza en segundo plano
 */
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  
  // Si existe en caché, devolverlo inmediatamente
  if (cachedResponse) {
    // Actualizar en segundo plano (opcional)
    fetch(request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, networkResponse);
          });
        }
      })
      .catch(() => {}); // Ignorar errores de actualización
    
    return cachedResponse;
  }

  // No está en caché, descargar y cachear
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;

  } catch (error) {
    // Si falla la red, intentar caché
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW Reparto] 📡 Modo Offline: Sirviendo desde caché:', request.url);
      return cachedResponse;
    }
    
    // Si no hay caché, retornar error
    throw error;
  }
}

// ===================================
// 🛠️ FUNCIONES DE UTILIDAD
// ===================================

/**
 * Verificar si una URL NO debe cachearse (solo APIs)
 */
function shouldNeverCache(url) {
  return NEVER_CACHE.some(pattern => url.includes(pattern));
}

/**
 * Verificar si un archivo debe usar estrategia Network First
 */
function isNetworkFirstFile(pathname) {
  return NETWORK_FIRST_FILES.some(path => {
    const fileName = path.split('/').pop();
    return pathname.includes(fileName);
  });
}

// ===================================
// 📨 MENSAJES DEL CLIENTE
// ===================================
self.addEventListener('message', (event) => {
  // Comando: Activar nuevo service worker inmediatamente
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW Reparto] 🚀 Comando recibido: Activar nueva versión inmediatamente');
    self.skipWaiting();
  }

  // Comando: Obtener versión actual del SW
  if (event.data && event.data.type === 'GET_VERSION') {
    console.log('[SW Reparto] 📋 Enviando versión:', CACHE_VERSION);
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }

  // Comando: Limpiar TODO el caché (actualización forzada)
  if (event.data && event.data.type === 'CLEAR_ALL_CACHE') {
    console.log('[SW Reparto] 🗑️ Limpiando TODO el caché...');
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            console.log('[SW Reparto] 🗑️ Eliminando:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }).then(() => {
        console.log('[SW Reparto] ✅ Caché limpiado completamente');
        // Notificar a la app
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'CACHE_CLEARED' });
          });
        });
      })
    );
  }
});

// ===================================
// 🎯 INICIALIZACIÓN
// ===================================
console.log('[SW Reparto] 🚀 Service Worker cargado:', CACHE_VERSION);
console.log('[SW Reparto] 📋 Network First:', NETWORK_FIRST_FILES.length, 'archivos');
console.log('[SW Reparto] 📦 Cache First:', CACHE_FIRST_ASSETS.length, 'assets');


async function syncPedidos() {
  try {
    console.log('🔄 [SW Reparto] Sincronizando pedidos...');
    // Esta función será llamada por el cliente cuando haya conexión
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_PEDIDOS',
        timestamp: Date.now()
      });
    });
  } catch (error) {
    console.error('❌ [SW Reparto] Error en sync:', error);
  }
}

// ===================================
// NOTIFICACIONES PUSH (FUTURO)
// ===================================
self.addEventListener('push', (event) => {
  console.log('🔔 [SW Reparto] Push recibido:', event);
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Nuevo pedido';
  const options = {
    body: data.body || 'Tienes un nuevo pedido asignado',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    tag: 'pedido-notification',
    requireInteraction: true,
    data: data
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('🔔 [SW Reparto] Notificación clickeada:', event);
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});

console.log('🚚 [SW Reparto] Service Worker cargado correctamente');

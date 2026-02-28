// Sabrofood Reparto PWA Service Worker
// Versión: 1.0.0
// Fecha: 27-02-2026

const CACHE_VERSION = 'sabrofood-reparto-v1.0.0-20260227';
const CACHE_NAME = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

// Archivos a cachear para funcionamiento offline
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './local/index.html',
  './local/style.css',
  './repartidor/index.html',
  './repartidor/style.css',
  './shared/auth.js',
  './shared/roles-config.js',
  './shared/route-protection.js',
  './shared/supabase-config.js',
  // Fuentes de Google
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap'
];

// URLs que NUNCA deben cachearse (seguridad y tiempo real)
const NEVER_CACHE = [
  'supabase-config.js',       // Contiene credenciales
  '.supabase.co',             // API de Supabase
  'supabase.co',              // Realtime y auth
  '/auth/',                   // Endpoints de autenticación
  '/rest/',                   // API REST de Supabase
  '/realtime/',               // WebSockets tiempo real
  'cdn.jsdelivr.net'          // CDN de Supabase
];

// ===================================
// INSTALACIÓN DEL SERVICE WORKER
// ===================================
self.addEventListener('install', (event) => {
  console.log('🚚 [SW Reparto] Instalando Service Worker...', CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('🚚 [SW Reparto] Cacheando archivos estáticos');
        // Cachear archivos uno por uno para evitar fallos completos
        return Promise.allSettled(
          STATIC_ASSETS.map(url => 
            cache.add(url).catch(err => {
              console.warn(`⚠️ No se pudo cachear ${url}:`, err);
              return null;
            })
          )
        );
      })
      .then(() => {
        console.log('✅ [SW Reparto] Archivos cacheados correctamente');
        return self.skipWaiting(); // Activar inmediatamente
      })
      .catch((error) => {
        console.error('❌ [SW Reparto] Error al cachear:', error);
      })
  );
});

// ===================================
// ACTIVACIÓN Y LIMPIEZA DE CACHÉS VIEJOS
// ===================================
self.addEventListener('activate', (event) => {
  console.log('🚚 [SW Reparto] Activando Service Worker...', CACHE_VERSION);

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
              console.log('🗑️ [SW Reparto] Eliminando caché viejo:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('✅ [SW Reparto] Service Worker activado y limpio');
        return self.clients.claim(); // Tomar control inmediato
      })
  );
});

// ===================================
// INTERCEPTAR PETICIONES (FETCH)
// ===================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 🔒 REGLA 1: NUNCA cachear URLs sensibles o de Supabase
  if (shouldNeverCache(url.href)) {
    event.respondWith(fetch(request)); // Ir directo a la red
    return;
  }

  // 🔄 REGLA 2: Network First para JS y CSS (permite actualizaciones rápidas)
  const pathname = url.pathname.toLowerCase();
  if (pathname.endsWith('.js') || pathname.endsWith('.css')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 📦 REGLA 3: Cache First para HTML, imágenes y otros archivos estáticos
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 🌐 REGLA 4: Network First para todo lo demás
  event.respondWith(networkFirst(request));
});

// ===================================
// ESTRATEGIAS DE CACHÉ
// ===================================

// Cache First: Intenta desde caché, si falla va a la red
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    
    // Solo cachear respuestas exitosas
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;

  } catch (error) {
    console.error('❌ [SW Reparto] Error en Cache First:', error);
    
    // Intentar respuesta desde caché como fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback básico para HTML
    if (request.destination === 'document') {
      return caches.match('./index.html');
    }
    
    return new Response('Offline - Recurso no disponible', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Network First: Intenta red primero, si falla va al caché
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Solo cachear respuestas exitosas
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;

  } catch (error) {
    console.warn('⚠️ [SW Reparto] Network First fallo, intentando caché:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback para HTML
    if (request.destination === 'document') {
      return caches.match('./index.html');
    }
    
    throw error;
  }
}

// ===================================
// FUNCIONES AUXILIARES
// ===================================

// Verificar si una URL nunca debe cachearse
function shouldNeverCache(url) {
  return NEVER_CACHE.some(pattern => url.includes(pattern));
}

// Verificar si es un archivo estático cacheable
function isStaticAsset(url) {
  const pathname = url.pathname.toLowerCase();
  const staticExtensions = ['.html', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.json'];
  return staticExtensions.some(ext => pathname.endsWith(ext));
}

// ===================================
// MANEJO DE MENSAJES
// ===================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('🚚 [SW Reparto] Forzando activación inmediata');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('🗑️ [SW Reparto] Limpiando todos los cachés');
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      })
    );
  }
});

// ===================================
// SINCRONIZACIÓN EN BACKGROUND
// ===================================
self.addEventListener('sync', (event) => {
  console.log('🔄 [SW Reparto] Background sync:', event.tag);
  
  if (event.tag === 'sync-pedidos') {
    event.waitUntil(syncPedidos());
  }
});

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

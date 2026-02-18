// === PROTECCIÓN DE RUTAS ===
// Script compartido para verificar autenticación antes de cargar páginas protegidas

/**
 * Espera a que Supabase se inicialice con timeout
 * @param {number} maxWaitMs - Tiempo máximo de espera en milisegundos
 * @returns {Promise<boolean>} true si se inicializó, false si timeout
 */
async function esperarSupabase(maxWaitMs = 5000) {
  if (typeof window.supabase !== 'undefined') {
    return true;
  }
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (typeof window.supabase !== 'undefined') {
        clearInterval(checkInterval);
        resolve(true);
      } else if (Date.now() - startTime > maxWaitMs) {
        clearInterval(checkInterval);
        console.error('⏱️ Timeout esperando Supabase');
        resolve(false);
      }
    }, 50);
  });
}

/**
 * Verifica autenticación y redirige si no está autenticado
 * @param {string} redirectUrl - URL a donde redirigir si no autenticado
 */
async function verificarAutenticacionYRedirigir(redirectUrl = '/repatosabrofood/index.html') {
  try {
    // Esperar a que Supabase se cargue (máximo 5 segundos)
    const supabaseDisponible = await esperarSupabase(5000);
    
    if (!supabaseDisponible) {
      console.error('❌ Supabase no se pudo cargar');
      alert('Error al cargar el sistema. Por favor, recarga la página.');
      return;
    }
    
    // Inicializar cliente
    if (typeof inicializarSupabase === 'function') {
      inicializarSupabase();
    }
    
    // Verificar sesión
    if (typeof supabaseVerificarSesion === 'function') {
      const sesion = await supabaseVerificarSesion();
      
      if (!sesion.authenticated) {
        console.log('⚠️ No autenticado, redirigiendo a login...');
        window.location.href = redirectUrl;
      } else {
        console.log('✅ Usuario autenticado:', sesion.user?.email);
      }
    } else {
      console.error('❌ Función de verificación no disponible');
      window.location.href = redirectUrl;
    }
  } catch (error) {
    console.error('❌ Error en verificación de autenticación:', error);
    window.location.href = redirectUrl;
  }
}

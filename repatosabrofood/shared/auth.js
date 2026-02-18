// === SISTEMA DE AUTENTICACIÓN CON SUPABASE ===
// Este archivo provee funciones de compatibilidad con el código existente
// Las funciones reales de Supabase Auth están en supabase-config.js

/**
 * Verifica si hay una sesión válida usando Supabase Auth
 * @returns {Promise<boolean>} true si la sesión es válida
 */
async function verificarSesion() {
  // Verificar que la función de Supabase esté disponible
  if (typeof supabaseVerificarSesion !== 'function') {
    console.error('❌ supabaseVerificarSesion no está disponible. Asegúrate de incluir supabase-config.js');
    return false;
  }
  
  try {
    const resultado = await supabaseVerificarSesion();
    return resultado.authenticated;
  } catch (error) {
    console.error('❌ Error al verificar sesión:', error);
    return false;
  }
}

/**
 * Cierra la sesión actual usando Supabase Auth
 */
async function cerrarSesion() {
  // Verificar que la función de Supabase esté disponible
  if (typeof supabaseLogout !== 'function') {
    console.error('❌ supabaseLogout no está disponible. Asegúrate de incluir supabase-config.js');
    // Forzar redirección de todos modos
    window.location.href = '/repatosabrofood/index.html';
    return;
  }
  
  try {
    await supabaseLogout();
  } catch (error) {
    console.error('❌ Error al cerrar sesión:', error);
  }
  
  // Redirigir al login
  window.location.href = '/repatosabrofood/index.html';
}

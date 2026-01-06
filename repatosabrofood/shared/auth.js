// === SISTEMA DE AUTENTICACIÓN CON SUPABASE ===
// Este archivo provee funciones de compatibilidad con el código existente
// Las funciones reales de Supabase Auth están en supabase-config.js

/**
 * Verifica si hay una sesión válida usando Supabase Auth
 * @returns {Promise<boolean>} true si la sesión es válida
 */
async function verificarSesion() {
  // Usar función de Supabase
  if (typeof supabaseVerificarSesion !== 'undefined') {
    const resultado = await supabaseVerificarSesion();
    return resultado.authenticated;
  }
  return false;
}

/**
 * Cierra la sesión actual usando Supabase Auth
 */
async function cerrarSesion() {
  if (typeof supabaseLogout !== 'undefined') {
    await supabaseLogout();
  }
  // Redirigir al login
  window.location.href = '/repatosabrofood/index.html';
}

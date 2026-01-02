// === SISTEMA DE AUTENTICACIÓN ===
const CONFIG_SEGURIDAD = {
  // Hash de la clave real para mayor seguridad
  claveHash: "b9c950640e1ac86b3aa0a7b5d0f6b5ad", // Hash MD5 de "0603"
  sessionKey: "pedidos_auth_session",
  tiempoSesion: 24 * 60 * 60 * 1000, // 24 horas en milisegundos
  maxIntentos: 3,
  tiempoBloqueo: 15 * 60 * 1000 // 15 minutos
};

/**
 * Función simple de hash para validación de contraseñas
 * @param {string} str - Cadena a hashear
 * @returns {string} Hash hexadecimal de la cadena
 */
function hashSimple(str) {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convertir a entero de 32 bits
  }
  return Math.abs(hash).toString(16);
}

/**
 * Verifica si hay una sesión válida
 * @returns {boolean} true si la sesión es válida
 */
function verificarSesion() {
  const sesion = localStorage.getItem(CONFIG_SEGURIDAD.sessionKey);
  if (!sesion) return false;

  try {
    const datos = JSON.parse(sesion);
    const ahora = new Date().getTime();
    
    // Verificar si la sesión ha expirado
    if (ahora - datos.timestamp > CONFIG_SEGURIDAD.tiempoSesion) {
      localStorage.removeItem(CONFIG_SEGURIDAD.sessionKey);
      return false;
    }
    
    return datos.authenticated === true;
  } catch (e) {
    return false;
  }
}

/**
 * Guarda una nueva sesión válida
 */
function guardarSesion() {
  const sesion = {
    authenticated: true,
    timestamp: new Date().getTime()
  };
  localStorage.setItem(CONFIG_SEGURIDAD.sessionKey, JSON.stringify(sesion));
}

/**
 * Cierra la sesión actual
 */
function cerrarSesion() {
  localStorage.removeItem(CONFIG_SEGURIDAD.sessionKey);
  window.location.reload();
}

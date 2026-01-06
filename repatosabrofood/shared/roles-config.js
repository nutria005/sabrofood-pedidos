// === CONFIGURACIÓN DE ROLES Y USUARIOS AUTORIZADOS ===

/**
 * Configuración centralizada de roles de usuario
 * Facilita el mantenimiento y garantiza consistencia en toda la aplicación
 */
const ROLES_CONFIG = {
  // Email del administrador con acceso completo
  ADMIN_EMAIL: 'admin@sabrofood.com',
  
  // Email del repartidor con acceso limitado
  REPARTIDOR_EMAIL: 'repartidor@sabrofood.com',
  
  // Lista de emails autorizados para panel de repartidor
  EMAILS_PANEL_REPARTIDOR: ['admin@sabrofood.com', 'repartidor@sabrofood.com'],
  
  /**
   * Verificar si un email es el administrador
   * @param {string} email - Email a verificar
   * @returns {boolean}
   */
  esAdmin(email) {
    return email === this.ADMIN_EMAIL;
  },
  
  /**
   * Verificar si un email es el repartidor
   * @param {string} email - Email a verificar
   * @returns {boolean}
   */
  esRepartidor(email) {
    return email === this.REPARTIDOR_EMAIL;
  },
  
  /**
   * Verificar si un email puede acceder al panel de repartidor
   * @param {string} email - Email a verificar
   * @returns {boolean}
   */
  puedeAccederPanelRepartidor(email) {
    return this.EMAILS_PANEL_REPARTIDOR.includes(email);
  },
  
  /**
   * Verificar si un email está autorizado en el sistema
   * @param {string} email - Email a verificar
   * @returns {boolean}
   */
  estaAutorizado(email) {
    return this.esAdmin(email) || this.esRepartidor(email);
  }
};

// Hacer disponible globalmente
if (typeof window !== 'undefined') {
  window.ROLES_CONFIG = ROLES_CONFIG;
}

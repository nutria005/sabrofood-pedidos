// === PROTECCIÓN DE RUTAS ===
// Este archivo protege páginas que requieren autenticación
// Si el usuario no está autenticado, será redirigido al login

import { auth } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

/**
 * Protege una ruta verificando que el usuario esté autenticado
 * Si no está autenticado, redirige automáticamente a la página de login
 * @returns {Promise} Resuelve con el usuario si está autenticado, rechaza si no lo está
 */
export function protegerRuta() {
  return new Promise((resolve, reject) => {
    // Escuchar cambios en el estado de autenticación
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // Usuario autenticado - permitir acceso
        resolve(user);
      } else {
        // Usuario no autenticado - redirigir al login
        window.location.href = '../index.html';
        reject('No autenticado');
      }
    });
  });
}

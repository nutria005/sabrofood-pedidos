// === CONFIGURACIÓN DE FIREBASE ===
// Este archivo configura Firebase Authentication y Firestore
// IMPORTANTE: El usuario debe reemplazar estos valores con su propia configuración de Firebase

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Configuración de Firebase - DEBE ser reemplazada por el usuario
// Para obtener estas credenciales:
// 1. Ve a https://console.firebase.google.com/
// 2. Selecciona tu proyecto o crea uno nuevo
// 3. Ve a Project Settings > General
// 4. Copia la configuración de tu app web
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "tu-app-id"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Exportar servicios de Firebase para usar en otros archivos
export const auth = getAuth(app);
export const db = getFirestore(app);

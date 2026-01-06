// === CONFIGURACIÓN SUPABASE ===
const SUPABASE_CONFIG = {
  url: 'https://bhjgcpjsjofuohacyise.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoamdjcGpzam9mdW9oYWN5aXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNjI4MDksImV4cCI6MjA3NzkzODgwOX0.ki4Ss9vYQUEYcvT3-rHl5d5ghL71oTL9mOMzetBwhEw',
  tabla: 'pedidos'
};

// Cliente Supabase compartido
let supabase_shared = null;

function inicializarSupabase() {
  if (typeof window.supabase !== 'undefined' && !supabase_shared) {
    supabase_shared = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    console.log('✅ Cliente Supabase inicializado desde shared/supabase-config.js');
  }
  return supabase_shared;
}

// Auto-inicializar cuando esté disponible
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    inicializarSupabase();
  });
}

// === FUNCIONES DE AUTENTICACIÓN ===

/**
 * Realizar login con email y password usando Supabase Auth
 * @param {string} email - Email del usuario (debe ser válido y no vacío)
 * @param {string} password - Contraseña (mínimo 6 caracteres)
 * @returns {Promise<{success: boolean, user?: object, session?: object, error?: string}>}
 */
async function supabaseLogin(email, password) {
  try {
    // Validación de parámetros
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      return { success: false, error: 'Email es requerido' };
    }
    
    if (!password || typeof password !== 'string' || password.length < 6) {
      return { success: false, error: 'Contraseña debe tener al menos 6 caracteres' };
    }
    
    const client = inicializarSupabase();
    if (!client) {
      return { success: false, error: 'Cliente Supabase no inicializado' };
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password: password
    });

    if (error) {
      console.error('❌ Error de login:', error.message);
      return { success: false, error: error.message };
    }

    if (data.session) {
      console.log('✅ Login exitoso:', data.user.email);
      return { success: true, user: data.user, session: data.session };
    }

    return { success: false, error: 'No se pudo crear sesión' };
  } catch (error) {
    console.error('❌ Error en supabaseLogin:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Cerrar sesión en Supabase
 * @returns {Promise<{success: boolean}>}
 */
async function supabaseLogout() {
  try {
    const client = inicializarSupabase();
    if (!client) {
      return { success: false };
    }

    const { error } = await client.auth.signOut();
    
    if (error) {
      console.error('❌ Error al cerrar sesión:', error);
      return { success: false };
    }

    console.log('✅ Sesión cerrada exitosamente');
    return { success: true };
  } catch (error) {
    console.error('❌ Error en supabaseLogout:', error);
    return { success: false };
  }
}

/**
 * Verificar si hay una sesión activa
 * @returns {Promise<{authenticated: boolean, user?: object}>}
 */
async function supabaseVerificarSesion() {
  try {
    const client = inicializarSupabase();
    if (!client) {
      return { authenticated: false };
    }

    const { data: { session }, error } = await client.auth.getSession();
    
    if (error) {
      console.error('❌ Error al verificar sesión:', error);
      return { authenticated: false };
    }

    if (session && session.user) {
      console.log('✅ Sesión activa:', session.user.email);
      return { authenticated: true, user: session.user, session: session };
    }

    return { authenticated: false };
  } catch (error) {
    console.error('❌ Error en supabaseVerificarSesion:', error);
    return { authenticated: false };
  }
}

/**
 * Obtener usuario actual
 * @returns {Promise<object|null>}
 */
async function supabaseGetUsuarioActual() {
  try {
    const client = inicializarSupabase();
    if (!client) {
      return null;
    }

    const { data: { user } } = await client.auth.getUser();
    return user;
  } catch (error) {
    console.error('❌ Error al obtener usuario:', error);
    return null;
  }
}

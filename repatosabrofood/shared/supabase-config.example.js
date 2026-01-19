// === PLANTILLA DE CONFIGURACIÓN SUPABASE ===
// Copia este archivo como "supabase-config.js" y reemplaza con tus credenciales

const SUPABASE_CONFIG = {
  url: 'https://TU-PROYECTO.supabase.co',
  anonKey: 'TU_CLAVE_ANON_AQUI',
  tabla: 'pedidos'
};

// Cliente Supabase compartido
let supabase_shared = null;

function inicializarSupabase() {
  if (typeof window.supabase !== 'undefined' && !supabase_shared) {
    supabase_shared = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    console.log('✅ Cliente Supabase inicializado');
  }
  return supabase_shared;
}

if (typeof window !== 'undefined') {
  if (typeof window.supabase !== 'undefined') {
    inicializarSupabase();
  }
}

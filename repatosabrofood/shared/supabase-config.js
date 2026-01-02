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

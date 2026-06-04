(() => {
  const SUPABASE_URL = 'https://fitevtqimhixfjuufzvr.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Omx6njxpeBmHwYc4tne95g_I_451Ehe';

  console.log('window.supabase =>', window.supabase);

  if (!window.supabase) {
    console.error('La librería de Supabase no cargó.');
    return;
  }

  const { createClient } = window.supabase;
  window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  console.log('Cliente Supabase creado correctamente:', window.supabaseClient);
})();
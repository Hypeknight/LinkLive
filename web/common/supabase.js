(function(){
  if (!window.supabase) return;
  const cfg = window.LINKDN_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  window.LinkdNV2Supabase = {
    getClient(){ return client; }
  };
})();

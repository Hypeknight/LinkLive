(function () {
  const cfg = window.LINKDN_CONFIG || {};

  if (!window.supabase) {
    console.error("Supabase CDN library not loaded.");
    return;
  }

  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    console.error("Missing Supabase config values.");
    return;
  }

  const client = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

  window.LinkdNSupabase = {
    client,
    getClient() {
      return client;
    }
  };

  console.log("LinkdNSupabase initialized");
})();
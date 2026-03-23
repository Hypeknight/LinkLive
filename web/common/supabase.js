(function () {
  if (!window.LINKDN_CONFIG) {
    console.error("LINKDN_CONFIG is missing.");
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase CDN library not loaded.");
    return;
  }

  const cfg = window.LINKDN_CONFIG;

  const client = window.supabase.createClient(
    cfg.supabaseUrl,
    cfg.supabaseAnonKey
  );

  window.LinkdNSupabase = {
    client,
    getClient() {
      return client;
    }
  };

  console.log("LinkdNSupabase initialized");
})();
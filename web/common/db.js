(function () {
  if (!window.LINKDN_CONFIG) {
    console.error("APP_CONFIG is missing. Make sure config.js loads first.");
    return;
  }

  if (!window.supabase) {
    console.error("Supabase library not loaded.");
    return;
  }

  const cfg = window.LINKDN_CONFIG;

  const client = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

  const LiveDB = {
    client,

    cfg: {
      allowVenuePublicRead: false, // change to true if needed
      requireRole: ['admin','moderator','ops','venue']
    },

    async get(table) {
      const { data, error } = await client.from(table).select('*');
      if (error) throw error;
      return data;
    },

    async insert(table, payload) {
      const { error } = await client.from(table).insert(payload);
      if (error) throw error;
    },

    async update(table, payload, match) {
      const { error } = await client.from(table).update(payload).match(match);
      if (error) throw error;
    },

    async delete(table, match) {
      const { error } = await client.from(table).delete().match(match);
      if (error) throw error;
    },

    subscribe(table, handler) {
      return client
        .channel(`live-${table}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          handler
        )
        .subscribe();
    }
  };

  window.LiveDB = LiveDB;

  console.log("✅ LiveDB initialized");
})();
/*(function () {
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
      venueRoles: ['admin','moderator','ops','venue', 'owner'],
      moderatorRoles: ['admin','moderator','ops']
      
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

    async update(table, id, payload) {
    const { error } = await client.from(table).update(payload).eq('id', id);
    if (error) throw error;
    },

    async remove(table, id) {
    const { error } = await client.from(table).delete().eq('id', id);
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
*/
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
      allowVenuePublicRead: false,
      venueRoles: ['admin','moderator','ops','venue','owner'],
      moderatorRoles: ['admin','moderator','ops']
    },

    async get(table) {
      const { data, error } = await client.from(table).select('*');
      if (error) throw error;
      return data;
    },

    async insert(table, payload) {
      const { data, error } = await client.from(table).insert(payload).select();
      if (error) throw error;
      return data;
    },

    async update(table, id, payload) {
      const { data, error } = await client.from(table).update(payload).eq('id', id).select();
      if (error) throw error;
      return data;
    },

    async remove(table, id) {
      const { error } = await client.from(table).delete().eq('id', id);
      if (error) throw error;
    },

    subscribe(table, handler) {
      return client
        .channel(`live-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, handler)
        .subscribe();
    }
  };

  window.LiveDB = LiveDB;
})();
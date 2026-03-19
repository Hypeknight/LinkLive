(function () {
  const cfg = window.APP_CONFIG || {};
  if (!window.supabase) {
    console.error('Supabase client not loaded.');
    return;
  }
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || cfg.supabaseUrl.includes('REPLACE_') || cfg.supabaseAnonKey.includes('REPLACE_')) {
    console.error('Update assets/js/config.js with your Supabase URL and anon key.');
  }
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  window.LiveDB = {
    cfg,
    sb,
    venueId: cfg.venueId,
    async getSession() {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    async getUser() {
      const { data, error } = await sb.auth.getUser();
      if (error) throw error;
      return data.user;
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    async signOut() {
      const { error } = await sb.auth.signOut();
      if (error) throw error;
      return true;
    },
    async loadProfile() {
      const user = await this.getUser();
      if (!user) return null;
      const { data, error } = await sb
        .from('profiles')
        .select('id, email, full_name, role, venue_id')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async list(table, opts = {}) {
      const select = opts.select || '*';
      let q = sb.from(table).select(select);
      if (opts.byVenue !== false) q = q.eq('venue_id', this.venueId);
      if (opts.eq) Object.entries(opts.eq).forEach(([k, v]) => q = q.eq(k, v));
      if (opts.orderBy) q = q.order(opts.orderBy, { ascending: opts.ascending !== false });
      if (opts.limit) q = q.limit(opts.limit);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    async one(table, id, opts = {}) {
      let q = sb.from(table).select(opts.select || '*').eq('id', id);
      if (opts.byVenue !== false) q = q.eq('venue_id', this.venueId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data;
    },
    async insert(table, payload) {
      const row = { ...payload };
      if (row.venue_id === undefined) row.venue_id = this.venueId;
      const { data, error } = await sb.from(table).insert(row).select().single();
      if (error) throw error;
      return data;
    },
    async update(table, id, payload, opts = {}) {
      let q = sb.from(table).update(payload).eq('id', id);
      if (opts.byVenue !== false) q = q.eq('venue_id', this.venueId);
      const { data, error } = await q.select().single();
      if (error) throw error;
      return data;
    },
    async remove(table, id, opts = {}) {
      let q = sb.from(table).delete().eq('id', id);
      if (opts.byVenue !== false) q = q.eq('venue_id', this.venueId);
      const { error } = await q;
      if (error) throw error;
      return true;
    },
    async upsertDevices(rows) {
      const payload = rows.map(r => ({ ...r, venue_id: r.venue_id || this.venueId }));
      const { data, error } = await sb.from('devices').upsert(payload, { onConflict: 'venue_id,browser_device_id' }).select();
      if (error) throw error;
      return data || [];
    },
    subscribe(table, callback) {
      const channel = sb.channel(`rt-${table}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
        .subscribe();
      return () => sb.removeChannel(channel);
    }
  };
})();

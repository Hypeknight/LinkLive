(function () {
  const db = () => {
    if (!window.LiveDB?.client) throw new Error('LiveDB client is not initialized.');
    return window.LiveDB.client;
  };

  const auth = () => {
    if (!window.LiveAuth) throw new Error('LiveAuth is not initialized.');
    return window.LiveAuth;
  };

  window.LinkdNV2Client = {
    db,
    auth,
    async select(table, queryBuilder) {
      let q = db().from(table).select('*');
      if (typeof queryBuilder === 'function') q = queryBuilder(q) || q;
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    async maybeSingle(table, queryBuilder) {
      let q = db().from(table).select('*');
      if (typeof queryBuilder === 'function') q = queryBuilder(q) || q;
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data || null;
    },
    async insert(table, payload) {
      const { data, error } = await db().from(table).insert(payload).select();
      if (error) throw error;
      return data || [];
    },
    async upsert(table, payload, options) {
      const { data, error } = await db().from(table).upsert(payload, options).select();
      if (error) throw error;
      return data || [];
    },
    async update(table, payload, matcher) {
      let q = db().from(table).update(payload);
      Object.entries(matcher || {}).forEach(([k, v]) => { q = q.eq(k, v); });
      const { data, error } = await q.select();
      if (error) throw error;
      return data || [];
    },
    async remove(table, matcher) {
      let q = db().from(table).delete();
      Object.entries(matcher || {}).forEach(([k, v]) => { q = q.eq(k, v); });
      const { error } = await q;
      if (error) throw error;
      return true;
    },
    subscribe(table, handler) {
      return window.LiveDB.subscribe(table, handler);
    }
  };
})();

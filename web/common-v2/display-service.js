(function () {
  const C = window.LinkdNV2Client;

  window.LinkdNV2DisplayService = {
    async getDisplayState(venueId) {
      return C.maybeSingle('display_states', q => q.eq('venue_id', venueId));
    },
    async upsertDisplayState(payload) {
      return C.upsert('display_states', payload, { onConflict: 'venue_id' });
    }
  };
})();

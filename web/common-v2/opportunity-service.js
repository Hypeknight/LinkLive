(function () {
  const C = window.LinkdNV2Client;

  window.LinkdNV2OpportunityService = {
    async listOpenOpportunities(roomId = null) {
      return C.select('pulse_opportunities', q => {
        let next = q.order('created_at', { ascending: false });
        if (roomId) next = next.eq('room_id', roomId);
        return next.in('status', ['suggested', 'queued', 'offered', 'accepted', 'launched']);
      });
    },
    async createOpportunity(payload) {
      return C.insert('pulse_opportunities', payload);
    },
    async updateOpportunity(id, payload) {
      return C.update('pulse_opportunities', payload, { id });
    }
  };
})();

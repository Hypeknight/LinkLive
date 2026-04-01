(function () {
  const C = window.LinkdNV2Client;
  const U = window.LinkdNV2Utils;

  function tonightRows(rows, resetTime = '08:30:00') {
    const boundary = U.serviceBoundaryMs(resetTime);
    return rows.filter(r => new Date(r.created_at).getTime() >= boundary);
  }

  window.LinkdNV2PulseService = {
    tonightRows,
    async getActivePrompt(roomId) {
      return C.maybeSingle('pulse_prompts', q => q
        .eq('room_id', roomId)
        .eq('status', 'live')
        .order('created_at', { ascending: false })
        .limit(1)
      );
    },
    async listRoomPulseRows(roomId, limit = 200) {
      return C.select('patron_pulse', q => q.eq('room_id', roomId).order('created_at', { ascending: false }).limit(limit));
    },
    async listRoomComments(roomId, limit = 100) {
      return C.select('pulse_comments', q => q.eq('room_id', roomId).order('created_at', { ascending: false }).limit(limit));
    },
    async sendQuickPulse({ venueId, roomId, presenceSessionId, notes, pulseScore = 85, energyLevel = 9, crowdCount = 1 }) {
      return C.insert('patron_pulse', {
        venue_id: String(venueId),
        room_id: roomId || null,
        presence_session_id: presenceSessionId,
        pulse_score: pulseScore,
        crowd_count: crowdCount,
        energy_level: energyLevel,
        source: 'guest',
        notes
      });
    },
    async sendVote({ promptId, optionId, presenceSessionId, voterSessionId }) {
      return C.insert('patron_votes', {
        prompt_id: promptId,
        poll_id: promptId,
        option_id: optionId,
        presence_session_id: presenceSessionId,
        voter_session_id: voterSessionId
      });
    },
    async sendComment({ promptId, venueId, roomId, presenceSessionId, body }) {
      return C.insert('pulse_comments', {
        prompt_id: promptId || null,
        venue_id: venueId,
        room_id: roomId || null,
        presence_session_id: presenceSessionId,
        body
      });
    },
    async sendDjRequest({ venueId, roomId, presenceSessionId, requestText }) {
      return C.insert('dj_requests', {
        venue_id: venueId,
        room_id: roomId || null,
        presence_session_id: presenceSessionId,
        request_text: requestText
      });
    },
    computeStandings(rows, currentVenueName, currentVenueId) {
      const map = new Map();
      rows.forEach(row => {
        const key = String(row.venue_id || '');
        if (!key) return;
        if (!map.has(key)) {
          map.set(key, {
            venue_id: key,
            venue_name: key === String(currentVenueId) ? (currentVenueName || 'Your Venue') : key,
            score: 0,
            entries: 0
          });
        }
        const item = map.get(key);
        item.score += Number(row.pulse_score || 0) + Number(row.energy_level || 0);
        item.entries += 1;
      });
      return Array.from(map.values()).sort((a, b) => b.score - a.score).map((row, idx) => ({ ...row, rank: idx + 1 }));
    }
  };
})();

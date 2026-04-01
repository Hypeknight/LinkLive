(function () {
  const U = window.LinkdNV2Utils;
  const C = window.LinkdNV2Client;

  function storageKey(venueId) {
    return `linkdn_v2_guest_presence_${venueId || 'unknown'}`;
  }

  const SessionService = {
    getStoredPresence(venueId) {
      try {
        return JSON.parse(localStorage.getItem(storageKey(venueId)) || 'null');
      } catch (_) {
        return null;
      }
    },
    storePresence(payload) {
      localStorage.setItem(storageKey(payload?.venueId), JSON.stringify(payload));
    },
    clearPresence(venueId) {
      localStorage.removeItem(storageKey(venueId));
    },
    hasActivePresence(venueId) {
      const p = SessionService.getStoredPresence(venueId);
      return !!(p && p.expiresAt && new Date(p.expiresAt).getTime() > Date.now());
    },
    async verifyVenueCode({ venueId, roomId, promptId, code }) {
      const nowIso = U.nowIso();
      const rows = await C.select('venue_checkin_codes', q => q
        .eq('venue_id', venueId)
        .eq('is_active', true)
        .eq('code', String(code || '').trim().toUpperCase())
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(5)
      );

      if (!rows.length) throw new Error('Code is invalid, expired, or for a different venue.');
      const codeRow = rows[0];
      const sessionToken = U.randomToken('guest');
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      const inserted = await C.insert('guest_presence_sessions', {
        venue_id: venueId,
        room_id: roomId || null,
        prompt_id: promptId || null,
        session_token: sessionToken,
        verification_method: 'venue_code',
        verified_code_id: codeRow.id,
        expires_at: expiresAt,
        user_agent: navigator.userAgent || null
      });

      const session = inserted[0];
      if (!session?.id) throw new Error('Guest session could not be created.');

      SessionService.storePresence({
        venueId,
        roomId,
        promptId,
        expiresAt,
        sessionToken,
        presenceSessionId: session.id
      });

      return session;
    }
  };

  window.LinkdNV2SessionService = SessionService;
})();

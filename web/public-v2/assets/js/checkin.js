(function () {
  const U = window.LinkdNV2Utils;
  const C = window.LinkdNV2Client;
  const Session = window.LinkdNV2SessionService;

  async function boot() {
    const params = U.qs();
    const roomId = params.get('room') || '';
    const venueId = params.get('venue') || '';
    const promptId = params.get('prompt') || '';

    const submit = U.byId('v2-checkin-submit');
    const input = U.byId('v2-checkin-code');
    const status = U.byId('v2-checkin-status');

    if (!submit || !input || !status) return;

    const venue = venueId ? await C.maybeSingle('venues', q => q.eq('id', venueId)) : null;
    const room = roomId ? await C.maybeSingle('rooms', q => q.eq('id', roomId)) : null;

    U.setHtml('v2-checkin-context', `
      <div><strong>Venue:</strong> ${U.esc(venue?.name || 'Unknown')}</div>
      <div><strong>Room:</strong> ${U.esc(room?.title || 'Unknown')}</div>
      <div class="v2-helper" style="margin-top:8px;">Enter the venue code shown on screen.</div>
    `);

    submit.onclick = async () => {
      try {
        const code = String(input.value || '').trim().toUpperCase();
        if (!code) throw new Error('Enter a code first.');
        status.textContent = 'Verifying…';
        await Session.verifyVenueCode({ venueId, roomId, promptId, code });
        status.textContent = 'Verified. Redirecting…';
        const next = new URL(`${location.origin}/public-v2/pulse.html`);
        next.searchParams.set('venue', venueId);
        if (roomId) next.searchParams.set('room', roomId);
        if (promptId) next.searchParams.set('prompt', promptId);
        location.href = next.toString();
      } catch (err) {
        status.textContent = err.message || 'Verification failed.';
      }
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch(err => U.flash(err.message || 'Check-in failed to load.', 'error'));
  });
})();

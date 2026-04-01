(function () {
  const U = window.LinkdNV2Utils;
  const C = window.LinkdNV2Client;
  const Room = window.LinkdNV2RoomService;
  const Pulse = window.LinkdNV2PulseService;
  const Session = window.LinkdNV2SessionService;
  const LK = window.LinkdNV2LiveKitService;
  const auth = window.LiveAuth;

  const state = {
    profile: null,
    venue: null,
    rooms: [],
    memberships: [],
    currentMembership: null,
    schedules: [],
    prompt: null,
    pulses: [],
    showState: null,
    checkinCode: null,
    devices: [],
    localStream: null
  };

  function currentRoomId() { return state.currentMembership?.room_id || null; }
  function livekitRoomName(roomId) { return `linkdn_v2_room_${roomId}`; }
  function roomTitle(roomId) { return state.rooms.find(r => r.id === roomId)?.title || '—'; }
  function membershipRows(roomId) { return state.memberships.filter(m => m.room_id === roomId && !m.left_at); }

  async function resolveVenue() {
    const user = await auth.getUser();
    if (!user) throw new Error('No logged-in user found.');
    let venue = await C.maybeSingle('venues', q => q.eq('owner_profile_id', user.id).eq('active', true).limit(1));
    if (!venue && window.LiveDB?.cfg?.venueId) {
      venue = await C.maybeSingle('venues', q => q.eq('id', window.LiveDB.cfg.venueId));
    }
    if (!venue) throw new Error('No active venue found for this account.');
    return venue;
  }

  async function ensureCheckinCode() {
    if (!state.venue?.id) return null;
    const active = await C.maybeSingle('venue_checkin_codes', q => q.eq('venue_id', state.venue.id).eq('is_active', true).gt('expires_at', U.nowIso()).order('created_at', { ascending: false }).limit(1));
    if (active) return active;
    const code = Math.random().toString(36).slice(2, 6).toUpperCase();
    const created = await C.insert('venue_checkin_codes', {
      venue_id: state.venue.id,
      room_id: currentRoomId(),
      code,
      starts_at: U.nowIso(),
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      is_active: true,
      created_by: state.profile?.id || null
    });
    return created[0] || null;
  }

  async function loadBase() {
    await auth.requireRole(window.LiveDB?.cfg?.venueRoles || ['admin','moderator','ops','venue','owner']);
    state.profile = await auth.getProfile();
    state.venue = await resolveVenue();
    state.rooms = await Room.listActiveRooms();
    state.memberships = await Room.listRoomMemberships();
    state.currentMembership = state.memberships.find(m => String(m.venue_id) === String(state.venue.id)) || null;
    state.devices = await C.select('devices', q => q.eq('venue_id', state.venue.id).order('created_at', { ascending: true }));
    if (currentRoomId()) {
      state.schedules = await C.select('schedules', q => q.eq('room_id', currentRoomId()).order('starts_at', { ascending: true }));
      state.prompt = await Pulse.getActivePrompt(currentRoomId());
      state.pulses = await Pulse.listRoomPulseRows(currentRoomId(), 200);
      state.showState = await C.maybeSingle('show_state', q => q.eq('room_id', currentRoomId()));
    } else {
      state.schedules = [];
      state.prompt = null;
      state.pulses = [];
      state.showState = null;
    }
    state.checkinCode = await ensureCheckinCode();

    document.querySelectorAll('[data-venue-name]').forEach(el => el.textContent = state.venue?.name || 'Venue');
    document.querySelectorAll('[data-app-name]').forEach(el => el.textContent = 'Linkd’N V2');
    U.setText('current-user', state.profile?.display_name || state.profile?.email || '');
    window.LiveUI?.setConnection?.(true, 'Connected');
  }

  function renderRooms() {
    const table = U.byId('v2-venue-rooms-body');
    if (!table) return;
    table.innerHTML = state.rooms.map(room => {
      const count = membershipRows(room.id).length;
      const joined = currentRoomId() === room.id;
      const full = count >= 5 && !joined;
      return `
        <tr>
          <td>${U.esc(room.title)}</td>
          <td>${U.esc(room.zone || '—')}</td>
          <td>${U.esc(room.status || 'open')}</td>
          <td>${count}/5</td>
          <td>${joined ? '<button data-leave="1">Leave</button>' : `<button data-join="${room.id}" ${full ? 'disabled' : ''}>${full ? 'Full' : 'Join'}</button>`}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="5">No rooms available.</td></tr>';

    table.querySelectorAll('[data-join]').forEach(btn => btn.onclick = async () => {
      try {
        if (currentRoomId()) throw new Error('Leave your current room before joining a new one.');
        await Room.joinRoom({ roomId: btn.dataset.join, venueId: state.venue.id });
        U.flash('Joined room.');
        await boot();
      } catch (err) { U.flash(err.message || 'Unable to join room.', 'error'); }
    });
    table.querySelectorAll('[data-leave]').forEach(btn => btn.onclick = async () => {
      try {
        await Room.leaveRoomByVenue(state.venue.id);
        await LK.disconnect();
        U.flash('Left room.');
        await boot();
      } catch (err) { U.flash(err.message || 'Unable to leave room.', 'error'); }
    });
  }

  function renderProduction() {
    U.setText('v2-production-room', currentRoomId() ? roomTitle(currentRoomId()) : 'No room joined');
    U.setText('v2-production-status', state.currentMembership?.is_broadcasting ? 'Broadcasting' : 'Idle');
    U.setHtml('v2-production-schedule', state.schedules.map(s => `
      <tr><td>${U.esc(s.segment_title || 'Segment')}</td><td>${U.fmt(s.starts_at)}</td><td>${U.fmt(s.end_at)}</td><td>${U.esc(s.segment_type || 'segment')}</td></tr>
    `).join('') || '<tr><td colspan="4">No schedule for this room.</td></tr>');
    U.setHtml('v2-production-venues', membershipRows(currentRoomId()).map(m => `
      <tr><td>${U.esc(String(m.venue_id))}</td><td>${U.esc(m.status || 'connected')}</td><td>${m.is_broadcasting ? 'Live' : 'Idle'}</td></tr>
    `).join('') || '<tr><td colspan="3">No connected venues.</td></tr>');
    U.setHtml('v2-production-pulse', state.prompt ? `
      <div><strong>${U.esc(state.prompt.prompt_text)}</strong></div>
      <div class="v2-helper">CTA: ${U.esc(state.prompt.cta_type || 'vote')} • Ends ${U.fmt(state.prompt.ends_at)}</div>
    ` : '<div class="v2-helper">No live pulse.</div>');
  }

  function attachDisplayTrack(track, participant) {
    const host = U.byId('v2-display-others');
    if (!host || track.kind !== 'video') return;
    const identity = String(participant.identity || '');
    if (identity.includes(`venue_${state.venue?.id}`)) return;
    let box = host.querySelector(`[data-participant="${identity}"]`);
    if (!box) {
      box = document.createElement('div');
      box.className = 'v2-display-box';
      box.dataset.participant = identity;
      host.appendChild(box);
    }
    box.innerHTML = '';
    const label = document.createElement('div');
    label.className = 'v2-display-label';
    label.textContent = participant.name || identity;
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    track.attach(video);
    box.appendChild(label);
    box.appendChild(video);
  }

  function renderDisplayInfo() {
    U.setText('v2-display-room', currentRoomId() ? roomTitle(currentRoomId()) : 'No room joined');
    U.setText('v2-display-mode', state.showState?.event_type || 'ambient');
    U.setText('v2-display-phase', state.showState?.current_segment || state.prompt?.prompt_type || 'Waiting…');
    U.setText('v2-display-phase-sub', state.showState?.current_round || (state.prompt ? 'Live pulse active' : 'No active phase'));
    U.setText('v2-display-prompt', state.prompt?.prompt_text || 'No live pulse prompt.');
    U.setText('v2-display-prompt-meta', state.prompt ? `${state.prompt.cta_type || 'vote'} • ${state.prompt.status || 'live'}` : 'No active pulse');
    U.setText('v2-display-code', state.checkinCode?.code || '----');
    const voteUrl = `${location.origin}/public-v2/checkin.html?venue=${encodeURIComponent(state.venue?.id || '')}&room=${encodeURIComponent(currentRoomId() || '')}${state.prompt?.id ? `&prompt=${encodeURIComponent(state.prompt.id)}` : ''}`;
    U.setHtml('v2-display-url', `<div class="v2-helper">${U.esc(voteUrl)}</div>`);
    const standings = Pulse.computeStandings(Pulse.tonightRows(state.pulses, state.venue?.reset_time_local || '08:30:00'), state.venue?.name, state.venue?.id);
    U.setHtml('v2-display-standings', standings.length ? standings.map(s => `
      <div class="v2-feed-item"><div><strong>#${s.rank}</strong> ${U.esc(s.venue_name)}</div><div class="v2-dim">${s.score} pts • ${s.entries} tonight</div></div>
    `).join('') : '<div class="v2-feed-item">Standings will appear as the room interacts tonight.</div>');
    const qrCanvas = U.byId('v2-display-qr');
    if (qrCanvas && window.QRious) {
      new window.QRious({ element: qrCanvas, value: voteUrl, size: 180, level: 'H' });
    }
  }

  function renderPulse() {
    U.setHtml('v2-venue-pulse-current', state.prompt ? `
      <div><strong>${U.esc(state.prompt.prompt_text)}</strong></div>
      <div class="v2-helper">CTA: ${U.esc(state.prompt.cta_type || 'vote')} • Ends ${U.fmt(state.prompt.ends_at)}</div>
      <div class="v2-helper">Venue Code: ${U.esc(state.checkinCode?.code || '----')}</div>
    ` : '<div class="v2-helper">No live pulse prompt right now.</div>');
  }

  function renderLocalControls() {
    const camSel = U.byId('v2-local-camera');
    const micSel = U.byId('v2-local-mic');
    if (!camSel || !micSel) return;
    const cams = state.devices.filter(d => d.type === 'camera');
    const mics = state.devices.filter(d => d.type === 'microphone');
    camSel.innerHTML = U.option('', 'Select camera') + cams.map(d => U.option(d.input_id || d.id, d.name || d.input_id || d.id)).join('');
    micSel.innerHTML = U.option('', 'Select microphone') + mics.map(d => U.option(d.input_id || d.id, d.name || d.input_id || d.id)).join('');
    U.setHtml('v2-local-device-table', state.devices.map(d => `
      <tr><td>${U.esc(d.name)}</td><td>${U.esc(d.type)}</td><td>${U.esc(d.input_id || '—')}</td><td>${U.esc(d.status)}</td></tr>
    `).join('') || '<tr><td colspan="4">No devices saved.</td></tr>');
  }

  function bindShared() {
    U.byId('logout-button')?.addEventListener('click', async () => auth.signOut());
  }

  function bindProduction() {
    U.byId('v2-start-feed')?.addEventListener('click', async () => {
      try {
        if (!currentRoomId()) throw new Error('Join a room first.');
        await LK.connect({
          roomName: livekitRoomName(currentRoomId()),
          identity: `venue_${state.venue.id}`,
          participantName: state.venue.name,
          canPublish: true,
          canSubscribe: true
        });
        await LK.createAndPublishLocalTracks({});
        const preview = U.byId('v2-production-preview');
        if (preview) LK.attachLocalPreview(preview);
        await C.update('room_venues', { is_broadcasting: true, status: 'live' }, { id: state.currentMembership.id });
        U.flash('Feed started.');
        await boot();
      } catch (err) { U.flash(err.message || 'Unable to start feed.', 'error'); }
    });

    U.byId('v2-stop-feed')?.addEventListener('click', async () => {
      try {
        await LK.disconnect();
        if (state.currentMembership?.id) {
          await C.update('room_venues', { is_broadcasting: false, status: 'connected' }, { id: state.currentMembership.id });
        }
        U.flash('Feed stopped.');
        await boot();
      } catch (err) { U.flash(err.message || 'Unable to stop feed.', 'error'); }
    });
  }

  function bindDisplay() {
    // display is passive
  }

  async function bootDisplayConnect() {
    if (!currentRoomId()) return renderDisplayInfo();
    renderDisplayInfo();
    await LK.connect({
      roomName: livekitRoomName(currentRoomId()),
      identity: `display_${state.venue.id}_${Date.now()}`,
      participantName: `Display ${state.venue.name}`,
      canPublish: false,
      canSubscribe: true
    });
    LK.onTrackSubscribed(({ track, participant }) => attachDisplayTrack(track, participant));
    const room = LK.getRoom();
    room?.remoteParticipants?.forEach(participant => participant.trackPublications.forEach(pub => pub.track && attachDisplayTrack(pub.track, participant)));
  }

  async function bindLocalControls() {
    U.byId('v2-local-save')?.addEventListener('click', async () => {
      try {
        const camSel = U.byId('v2-local-camera');
        const micSel = U.byId('v2-local-mic');
        const rows = [];
        if (camSel?.value) rows.push({ venue_id: state.venue.id, room_id: currentRoomId(), name: camSel.options[camSel.selectedIndex]?.text || 'Camera', type: 'camera', input_id: camSel.value, status: 'online', is_default: false });
        if (micSel?.value) rows.push({ venue_id: state.venue.id, room_id: currentRoomId(), name: micSel.options[micSel.selectedIndex]?.text || 'Microphone', type: 'microphone', input_id: micSel.value, status: 'online', is_default: false });
        if (!rows.length) throw new Error('Choose a camera and/or microphone first.');
        await C.upsert('devices', rows, { onConflict: 'venue_id,input_id' });
        U.flash('Local devices saved.');
        await boot();
      } catch (err) { U.flash(err.message || 'Could not save local devices.', 'error'); }
    });
  }

  async function boot() {
    await loadBase();
    bindShared();

    const page = document.body.dataset.page;
    if (page === 'v2-venue-rooms') renderRooms();
    if (page === 'v2-venue-production') { renderProduction(); bindProduction(); }
    if (page === 'v2-venue-display') { await bootDisplayConnect(); }
    if (page === 'v2-venue-pulse') renderPulse();
    if (page === 'v2-venue-local-controls') { renderLocalControls(); bindLocalControls(); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch(err => U.flash(err.message || 'Venue V2 failed to load.', 'error'));
  });
})();

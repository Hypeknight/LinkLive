(function () {
  const db = window.LiveDB;
  const ui = window.LiveUI;
  const auth = window.LiveAuth;

  const state = {
    profile: null,
    venue: null,
    roomMembership: null,
    rooms: [],
    devices: [],
    schedules: [],
    pulses: [],
    prompt: null,
    showState: null,
    memberships: [],
    messages: [],
    localStream: null,
  };

  const MAX_VENUES_PER_ROOM = 5;

  function esc(v) {
    return ui?.esc ? ui.esc(v) : String(v ?? '');
  }

  function fmt(v) {
    return ui?.fmtDate ? ui.fmtDate(v) : (v || '—');
  }

  function flash(msg, type = 'info') {
    if (ui?.flash) ui.flash(msg, type);
  }

  function setConnection(ok, label) {
    if (ui?.setConnection) ui.setConnection(ok, label);
  }

  async function q(table) {
    return db.client.from(table);
  }

  async function loadProfileAndVenue() {
    await auth.requireRole(db.cfg.venueRoles || ['admin', 'moderator', 'ops', 'venue', 'owner']);
    state.profile = await auth.getProfile();

    const userName = document.getElementById('current-user');
    if (userName) userName.textContent = state.profile?.display_name || state.profile?.email || '';

    let venueId = db.cfg.venueId || state.profile?.venue_id || null;
    let venue = null;

    if (venueId) {
      const { data, error } = await db.client.from('venues').select('*').eq('id', venueId).maybeSingle();
      if (error) throw error;
      venue = data;
    }

    if (!venue) {
      const { data, error } = await db.client
        .from('venues')
        .select('*')
        .eq('owner_profile_id', state.profile.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      venue = data;
    }

    if (!venue) throw new Error('No venue is linked to this account.');
    state.venue = venue;

    document.querySelectorAll('[data-venue-name]').forEach(el => {
      el.textContent = venue.name || 'Venue';
    });

    if (document.querySelector('[data-app-name]')) {
      document.querySelectorAll('[data-app-name]').forEach(el => el.textContent = 'Linkd’N Live');
    }
  }

  async function loadRooms() {
    const { data, error } = await db.client
      .from('rooms')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (error) throw error;
    state.rooms = data || [];
  }

  async function loadMemberships() {
    const { data, error } = await db.client
      .from('room_venues')
      .select('*')
      .is('left_at', null)
      .order('joined_at', { ascending: true });
    if (error) throw error;
    state.memberships = data || [];
    state.roomMembership = state.memberships.find(m => m.venue_id === state.venue.id) || null;
  }

  async function loadDevices() {
    const { data, error } = await db.client
      .from('devices')
      .select('*')
      .eq('venue_id', state.venue.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    state.devices = data || [];
  }

  async function loadSchedules() {
    if (!state.roomMembership?.room_id) {
      state.schedules = [];
      return;
    }
    const { data, error } = await db.client
      .from('schedules')
      .select('*')
      .eq('room_id', state.roomMembership.room_id)
      .order('starts_at', { ascending: true });
    if (error) throw error;
    state.schedules = data || [];
  }

  async function loadPulse() {
    if (!state.roomMembership?.room_id) {
      state.pulses = [];
      state.prompt = null;
      return;
    }

    const [pulseRes, promptRes] = await Promise.all([
      db.client.from('patron_pulse').select('*').eq('room_id', state.roomMembership.room_id).order('created_at', { ascending: false }).limit(50),
      db.client.from('pulse_prompts').select('*').eq('room_id', state.roomMembership.room_id).eq('status', 'live').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (pulseRes.error) throw pulseRes.error;
    if (promptRes.error) throw promptRes.error;

    state.pulses = pulseRes.data || [];
    state.prompt = promptRes.data || null;
  }

  async function loadShowState() {
    if (!state.roomMembership?.room_id) {
      state.showState = null;
      return;
    }
    const { data, error } = await db.client
      .from('show_state')
      .select('*')
      .eq('room_id', state.roomMembership.room_id)
      .maybeSingle();
    if (error) throw error;
    state.showState = data || null;
  }

  async function loadMessages() {
    if (!state.roomMembership?.room_id) {
      state.messages = [];
      return;
    }
    const { data, error } = await db.client
      .from('production_messages')
      .select('*')
      .eq('room_id', state.roomMembership.room_id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    state.messages = data || [];
  }

  async function refresh() {
    await Promise.all([loadRooms(), loadMemberships(), loadDevices()]);
    await Promise.all([loadSchedules(), loadPulse(), loadShowState(), loadMessages()]);
    renderCurrentPage();
  }

  function roomTitle(roomId) {
    return state.rooms.find(r => r.id === roomId)?.title || '—';
  }

  function roomVenueCount(roomId) {
    return state.memberships.filter(m => m.room_id === roomId).length;
  }

  function roomIsFull(roomId) {
    return roomVenueCount(roomId) >= MAX_VENUES_PER_ROOM;
  }

  async function joinRoom(roomId) {
    if (state.roomMembership && state.roomMembership.room_id !== roomId) {
      throw new Error('Leave your current room before joining a new one.');
    }
    if (roomIsFull(roomId) && !state.roomMembership) {
      throw new Error('That room is full.');
    }
    if (state.roomMembership?.room_id === roomId) return;

    const { error } = await db.client.from('room_venues').insert({
      room_id: roomId,
      venue_id: state.venue.id,
      status: 'connected',
      is_broadcasting: false,
    });
    if (error) throw error;
  }

  async function leaveRoom() {
    if (!state.roomMembership) return;
    const { error } = await db.client
      .from('room_venues')
      .update({ left_at: new Date().toISOString(), status: 'left', is_broadcasting: false })
      .eq('id', state.roomMembership.id);
    if (error) throw error;
  }

  async function updateMembership(payload) {
    if (!state.roomMembership) throw new Error('Join a room first.');
    const { error } = await db.client.from('room_venues').update(payload).eq('id', state.roomMembership.id);
    if (error) throw error;
  }

  function renderCurrentPage() {
    const page = document.body.dataset.page;
    if (page === 'venue-rooms') renderRooms();
    if (page === 'venue-production') renderProduction();
    if (page === 'venue-display') renderDisplay();
    if (page === 'venue-pulse') renderPulse();
    if (page === 'venue-local-controls') renderLocalControls();
  }

  function renderRooms() {
    const grid = document.getElementById('rooms-grid');
    const current = document.getElementById('current-room-banner');
    if (!grid) return;

    if (current) {
      current.innerHTML = state.roomMembership
        ? `<strong>Connected room:</strong> ${esc(roomTitle(state.roomMembership.room_id))} <button type="button" id="leave-room-btn" class="secondary">Leave room</button>`
        : '<strong>No room connected.</strong>';
      const leaveBtn = document.getElementById('leave-room-btn');
      if (leaveBtn) leaveBtn.onclick = async () => {
        try {
          await leaveRoom();
          flash('Left room.');
          await refresh();
        } catch (err) {
          flash(err.message || 'Unable to leave room.', 'error');
        }
      };
    }

    grid.innerHTML = state.rooms.map(room => {
      const count = roomVenueCount(room.id);
      const connected = state.roomMembership?.room_id === room.id;
      const full = roomIsFull(room.id) && !connected;
      return `
        <article class="card room-card">
          <h3>${esc(room.title)}</h3>
          <div class="helper">Zone: ${esc(room.zone || '—')}</div>
          <div class="helper">Capacity: ${esc(room.capacity ?? '—')}</div>
          <div class="helper">Venues connected: ${count}/${MAX_VENUES_PER_ROOM}</div>
          <div class="pill ${esc(room.status || 'scheduled')}">${esc(room.status || 'scheduled')}</div>
          <p>${esc(room.notes || '')}</p>
          <div class="button-row">
            ${connected ? '<button type="button" disabled>Connected</button>' : `<button type="button" data-join="${room.id}" ${full ? 'disabled' : ''}>${full ? 'Room Full' : 'Join Room'}</button>`}
          </div>
        </article>
      `;
    }).join('') || '<p>No rooms are available.</p>';

    grid.querySelectorAll('[data-join]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await joinRoom(btn.dataset.join);
          flash('Joined room.');
          await refresh();
        } catch (err) {
          flash(err.message || 'Unable to join room.', 'error');
        }
      };
    });
  }

  function nextScheduleBlock() {
    const now = Date.now();
    return state.schedules.find(s => new Date(s.starts_at).getTime() >= now) || state.schedules[0] || null;
  }

  function connectedVenuesInRoom() {
    if (!state.roomMembership) return [];
    return state.memberships.filter(m => m.room_id === state.roomMembership.room_id);
  }

  function renderProduction() {
    const roomName = document.getElementById('production-room-name');
    const roomStatus = document.getElementById('production-room-status');
    const sched = document.getElementById('production-schedule-list');
    const venues = document.getElementById('production-venues-list');
    const messages = document.getElementById('production-message-list');
    const pulse = document.getElementById('production-pulse-card');

    if (roomName) roomName.textContent = state.roomMembership ? roomTitle(state.roomMembership.room_id) : 'No room selected';
    if (roomStatus) roomStatus.textContent = state.roomMembership ? (state.roomMembership.is_broadcasting ? 'Broadcasting' : 'Connected / feed idle') : 'Not connected';

    if (sched) {
      sched.innerHTML = state.schedules.map(s => `<tr><td>${esc(s.segment_title)}</td><td>${fmt(s.starts_at)}</td><td>${fmt(s.end_at)}</td><td>${esc(s.segment_type || 'segment')}</td></tr>`).join('') || '<tr><td colspan="4">No schedule loaded.</td></tr>';
    }

    if (venues) {
      venues.innerHTML = connectedVenuesInRoom().map(v => `
        <tr>
          <td>${esc(v.venue_id)}</td>
          <td>${esc(v.status || 'connected')}</td>
          <td>${v.is_broadcasting ? 'Live' : 'Idle'}</td>
        </tr>`).join('') || '<tr><td colspan="3">No venues connected.</td></tr>';
    }

    if (messages) {
      messages.innerHTML = state.messages.map(m => `<tr><td>${esc(m.from_role)}</td><td>${esc(m.body)}</td><td>${fmt(m.created_at)}</td></tr>`).join('') || '<tr><td colspan="3">No messages.</td></tr>';
    }

    if (pulse) {
      pulse.innerHTML = state.prompt
        ? `<h4>${esc(state.prompt.prompt_text)}</h4><p>Status: ${esc(state.prompt.status)}</p><p>Ends: ${fmt(state.prompt.ends_at)}</p>`
        : '<p>No live pulse prompt.</p>';
    }
  }

  function renderDisplay() {
    const layout = document.getElementById('display-layout');
    const title = document.getElementById('display-room-title');
    const mode = document.getElementById('display-mode');
    if (!layout) return;

    const members = connectedVenuesInRoom();
    const others = members.filter(v => v.venue_id !== state.venue.id);
    const activeMode = state.showState?.event_type || 'auto';

    if (title) title.textContent = state.roomMembership ? roomTitle(state.roomMembership.room_id) : 'No room selected';
    if (mode) mode.textContent = activeMode;

    if (!state.roomMembership) {
      layout.innerHTML = '<div class="wall-empty">Join a room to use the display.</div>';
      return;
    }

    if (others.length === 1) {
      layout.innerHTML = `<article class="wall-card featured"><h2>Opposite Venue</h2><p>${esc(others[0].venue_id)}</p><p>Status: ${esc(others[0].status || 'connected')}</p></article>`;
      return;
    }

    if (others.length > 1) {
      layout.innerHTML = others.map(v => `<article class="wall-card"><h2>${esc(v.venue_id)}</h2><p>${v.is_broadcasting ? 'Live Feed' : 'Idle Feed'}</p><p>Status: ${esc(v.status || 'connected')}</p></article>`).join('');
      return;
    }

    layout.innerHTML = '<div class="wall-empty">No other venues are connected in this room yet.</div>';
  }

  function renderPulse() {
    const prompt = document.getElementById('venue-pulse-prompt');
    const metrics = document.getElementById('venue-pulse-metrics');
    const entries = document.getElementById('venue-pulse-table');
    const qr = document.getElementById('venue-pulse-qr');

    if (prompt) {
      prompt.innerHTML = state.prompt
        ? `<h3>${esc(state.prompt.prompt_text)}</h3><p>${esc(state.prompt.prompt_type || 'vote')}</p><p>Ends ${fmt(state.prompt.ends_at)}</p>`
        : '<p>No pulse prompt is currently live.</p>';
    }

    const roomPulse = state.pulses.filter(p => p.room_id === state.roomMembership?.room_id);
    const avg = roomPulse.length ? Math.round(roomPulse.reduce((a, b) => a + Number(b.pulse_score || 0), 0) / roomPulse.length) : 0;
    const hype = roomPulse.length ? Math.round(roomPulse.reduce((a, b) => a + Number(b.energy_level || 0), 0) / roomPulse.length) : 0;
    if (metrics) metrics.innerHTML = `<div class="stat-box"><strong>${avg}%</strong><span>Pulse Score</span></div><div class="stat-box"><strong>${hype}</strong><span>Hype Meter</span></div><div class="stat-box"><strong>${roomPulse.length}</strong><span>Entries</span></div>`;

    if (entries) {
      entries.innerHTML = roomPulse.map(p => `<tr><td>${fmt(p.created_at)}</td><td>${esc(p.pulse_score)}</td><td>${esc(p.energy_level)}</td><td>${esc(p.crowd_count)}</td><td>${esc(p.notes || '—')}</td></tr>`).join('') || '<tr><td colspan="5">No pulse entries yet.</td></tr>';
    }

    if (qr) {
      const voteUrl = `${location.origin}/venue/pulse-vote.html?room=${encodeURIComponent(state.roomMembership?.room_id || '')}&venue=${encodeURIComponent(state.venue?.id || '')}`;
      qr.innerHTML = `<div class="helper">Patrons can vote from their phones:</div><code>${esc(voteUrl)}</code>`;
    }
  }

  function renderLocalControls() {
    const cams = document.getElementById('local-camera-device');
    const mics = document.getElementById('local-mic-device');
    const preferredCam = document.getElementById('local-preferred-camera');
    const preferredMic = document.getElementById('local-preferred-mic');
    const table = document.getElementById('local-devices-table');
    if (!table) return;

    const camDevices = state.devices.filter(d => d.type === 'camera');
    const micDevices = state.devices.filter(d => d.type === 'microphone');

    const opts = rows => ui.option('', 'Select') + rows.map(d => ui.option(d.input_id || d.id, d.name || d.input_id || d.id)).join('');
    if (cams) cams.innerHTML = opts(camDevices);
    if (mics) mics.innerHTML = opts(micDevices);
    if (preferredCam) preferredCam.innerHTML = ui.option('', 'No default') + camDevices.map(d => ui.option(d.id, d.name || d.input_id || d.id, !!d.is_default)).join('');
    if (preferredMic) preferredMic.innerHTML = ui.option('', 'No default') + micDevices.map(d => ui.option(d.id, d.name || d.input_id || d.id, !!d.is_default)).join('');

    table.innerHTML = state.devices.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.type)}</td><td>${esc(d.input_id || '—')}</td><td>${esc(d.status)}</td><td>${d.is_default ? 'Yes' : 'No'}</td><td><button type="button" data-toggle="${d.id}">${d.status === 'offline' ? 'online' : 'offline'}</button> <button type="button" data-remove="${d.id}" class="danger">Remove</button></td></tr>`).join('') || '<tr><td colspan="6">No saved devices.</td></tr>';

    table.querySelectorAll('[data-toggle]').forEach(btn => btn.onclick = async () => {
      try {
        const device = state.devices.find(d => d.id === btn.dataset.toggle);
        const next = device?.status === 'offline' ? 'online' : 'offline';
        const { error } = await db.client.from('devices').update({ status: next }).eq('id', btn.dataset.toggle);
        if (error) throw error;
        flash(`Device ${next === 'online' ? 'enabled' : 'disabled'}.`);
        await refresh();
      } catch (err) { flash(err.message || 'Device update failed.', 'error'); }
    });

    table.querySelectorAll('[data-remove]').forEach(btn => btn.onclick = async () => {
      try {
        const { error } = await db.client.from('devices').delete().eq('id', btn.dataset.remove);
        if (error) throw error;
        flash('Device removed.');
        await refresh();
      } catch (err) { flash(err.message || 'Device remove failed.', 'error'); }
    });
  }

  async function bindVenueActions() {
    document.getElementById('logout-button')?.addEventListener('click', async () => {
      await auth.signOut();
    });

    document.getElementById('start-feed-btn')?.addEventListener('click', async () => {
      try { await updateMembership({ is_broadcasting: true, status: 'live' }); flash('Feed started.'); await refresh(); } catch (err) { flash(err.message || 'Unable to start feed.', 'error'); }
    });
    document.getElementById('stop-feed-btn')?.addEventListener('click', async () => {
      try { await updateMembership({ is_broadcasting: false, status: 'connected' }); flash('Feed stopped.'); await refresh(); } catch (err) { flash(err.message || 'Unable to stop feed.', 'error'); }
    });

    document.getElementById('send-message-btn')?.addEventListener('click', async () => {
      const input = document.getElementById('production-message-input');
      if (!input?.value.trim() || !state.roomMembership) return;
      try {
        const { error } = await db.client.from('production_messages').insert({
          room_id: state.roomMembership.room_id,
          venue_id: state.venue.id,
          profile_id: state.profile.id,
          from_role: 'venue',
          body: input.value.trim(),
        });
        if (error) throw error;
        input.value = '';
        await loadMessages();
        renderProduction();
      } catch (err) {
        flash(err.message || 'Unable to send message.', 'error');
      }
    });

    document.getElementById('allow-browser-media-btn')?.addEventListener('click', async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        s.getTracks().forEach(t => t.stop());
        flash('Camera and mic access granted.');
        await discoverBrowserDevices();
      } catch (err) {
        flash(err.message || 'Media access denied.', 'error');
      }
    });

    document.getElementById('discover-devices-btn')?.addEventListener('click', discoverBrowserDevices);
    document.getElementById('save-local-devices-btn')?.addEventListener('click', saveSelectedLocalDevices);
    document.getElementById('save-default-devices-btn')?.addEventListener('click', saveDefaultVenueDevices);
    document.getElementById('preview-start-btn')?.addEventListener('click', startPreview);
    document.getElementById('preview-stop-btn')?.addEventListener('click', stopPreview);
  }

  async function discoverBrowserDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    const mics = devices.filter(d => d.kind === 'audioinput');
    const camSel = document.getElementById('local-camera-device');
    const micSel = document.getElementById('local-mic-device');
    if (camSel) camSel.innerHTML = ui.option('', 'Select camera') + cams.map((d, i) => ui.option(d.deviceId, d.label || `Camera ${i + 1}`)).join('');
    if (micSel) micSel.innerHTML = ui.option('', 'Select microphone') + mics.map((d, i) => ui.option(d.deviceId, d.label || `Microphone ${i + 1}`)).join('');
  }

  async function saveSelectedLocalDevices() {
    const camSel = document.getElementById('local-camera-device');
    const micSel = document.getElementById('local-mic-device');
    const rows = [];
    if (camSel?.value) rows.push({ venue_id: state.venue.id, room_id: state.roomMembership?.room_id || null, name: camSel.options[camSel.selectedIndex]?.text || 'Camera', type: 'camera', input_id: camSel.value, status: 'active', is_default: false });
    if (micSel?.value) rows.push({ venue_id: state.venue.id, room_id: state.roomMembership?.room_id || null, name: micSel.options[micSel.selectedIndex]?.text || 'Microphone', type: 'microphone', input_id: micSel.value, status: 'active', is_default: false });
    if (!rows.length) return flash('Choose a camera and/or microphone first.', 'error');
    const { error } = await db.client.from('devices').upsert(rows, { onConflict: 'venue_id,input_id' });
    if (error) throw error;
    flash('Local devices saved to venue profile.');
    await refresh();
  }

  async function saveDefaultVenueDevices() {
    const preferredCam = document.getElementById('local-preferred-camera');
    const preferredMic = document.getElementById('local-preferred-mic');
    const { error } = await db.client.from('venue_device_preferences').upsert({
      venue_id: state.venue.id,
      preferred_camera_id: preferredCam?.value || null,
      preferred_audio_input_id: preferredMic?.value || null,
      preferred_audio_interface_id: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'venue_id' });
    if (error) throw error;
    flash('Default venue devices saved.');
  }

  async function startPreview() {
    const video = document.getElementById('local-preview-video');
    const camSel = document.getElementById('local-camera-device');
    const micSel = document.getElementById('local-mic-device');
    const info = document.getElementById('local-preview-info');
    if (!video) return;
    if (state.localStream) state.localStream.getTracks().forEach(t => t.stop());
    state.localStream = await navigator.mediaDevices.getUserMedia({
      video: camSel?.value ? { deviceId: { exact: camSel.value } } : true,
      audio: micSel?.value ? { deviceId: { exact: micSel.value } } : true,
    });
    video.srcObject = state.localStream;
    if (info) info.textContent = 'Preview active.';
  }

  function stopPreview() {
    const video = document.getElementById('local-preview-video');
    const info = document.getElementById('local-preview-info');
    if (state.localStream) state.localStream.getTracks().forEach(t => t.stop());
    state.localStream = null;
    if (video) video.srcObject = null;
    if (info) info.textContent = 'Preview stopped.';
  }

  async function boot() {
    try {
      setConnection(false, 'Connecting');
      await loadProfileAndVenue();
      await refresh();
      await bindVenueActions();
      setConnection(true, 'Connected');
      ['rooms', 'room_venues', 'devices', 'schedules', 'patron_pulse', 'pulse_prompts', 'show_state', 'production_messages'].forEach(t => db.subscribe(t, refresh));
    } catch (err) {
      console.error(err);
      setConnection(false, 'Error');
      flash(err.message || 'Venue live pages failed to load.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

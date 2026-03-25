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
    if (camSel?.value) rows.push({ venue_id: state.venue.id, room_id: state.roomMembership?.room_id || null, name: camSel.options[camSel.selectedIndex]?.text || 'Camera', type: 'camera', input_id: camSel.value, status: 'online', is_default: false });
    if (micSel?.value) rows.push({ venue_id: state.venue.id, room_id: state.roomMembership?.room_id || null, name: micSel.options[micSel.selectedIndex]?.text || 'Microphone', type: 'microphone', input_id: micSel.value, status: 'online', is_default: false });
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





(function () {
  const db = window.LiveDB;
  const ui = window.LiveUI;
  const auth = window.LiveAuth;
  const lk = window.LinkdNLiveKit;

  let cached = {
    rooms: [],
    devices: [],
    schedules: [],
    notes: [],
    pulse: [],
    roomVenues: [],
    showState: [],
    prefs: null,
    venue: null,
    joinedRoom: null,
  };

  function roomTitle(room) {
    return room?.title || '—';
  }

  function currentVenueId() {
    return cached.venue?.id || null;
  }

  function currentRoomId() {
    return cached.joinedRoom?.room_id || null;
  }

  function livekitRoomName(roomId) {
    return `lk_room_${roomId}`;
  }

  async function resolveVenue() {
    const user = await auth.getUser();
    if (!user) throw new Error('No logged-in user found.');

    const { data, error } = await db.client
      .from('venues')
      .select('*')
      .eq('owner_profile_id', user.id)
      .eq('active', true)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('No active venue found for this account.');
    return data;
  }

  async function loadVenueScopedData() {
    cached.venue = await resolveVenue();

    const venueId = cached.venue.id;

    const [
      roomsRes,
      devicesRes,
      schedulesRes,
      pulseRes,
      prefsRes,
      roomVenuesRes,
      showStateRes,
      joinedRoomRes
    ] = await Promise.all([
      db.client.from('rooms').select('*').eq('is_active', true),
      db.client.from('devices').select('*').eq('venue_id', venueId),
      db.client.from('schedules').select('*'),
      db.client.from('patron_pulse').select('*').eq('venue_id', String(venueId)),
      db.client.from('venue_device_preferences').select('*').eq('venue_id', venueId).maybeSingle(),
      db.client.from('room_venues').select('*').is('left_at', null),
      db.client.from('show_state').select('*'),
      db.client.from('room_venues').select('*').eq('venue_id', venueId).is('left_at', null).maybeSingle()
    ]);

    [
      roomsRes, devicesRes, schedulesRes, pulseRes,
      prefsRes, roomVenuesRes, showStateRes, joinedRoomRes
    ].forEach(r => { if (r.error) throw r.error; });

    cached.rooms = roomsRes.data || [];
    cached.devices = devicesRes.data || [];
    cached.schedules = schedulesRes.data || [];
    cached.pulse = pulseRes.data || [];
    cached.prefs = prefsRes.data || null;
    cached.roomVenues = roomVenuesRes.data || [];
    cached.showState = showStateRes.data || [];
    cached.joinedRoom = joinedRoomRes.data || null;
  }

  async function refresh() {
    await loadVenueScopedData();
    const page = document.body.dataset.page;

    if (page === 'venue-rooms') renderRooms();
    if (page === 'venue-production') renderProduction();
    if (page === 'venue-display') renderDisplayState();
    if (page === 'venue-pulse') renderPulse();
    if (page === 'venue-local-controls') renderLocalControlsState();
  }

  async function boot() {
    await auth.requireRole(db.cfg.venueRoles);
    await auth.bootProtectedShell();
    ui.setConnection(true, 'Connected');
    await refresh();

    const page = document.body.dataset.page;
    const boots = {
      'venue-rooms': bootRooms,
      'venue-production': bootProduction,
      'venue-display': bootDisplay,
      'venue-pulse': bootPulse,
      'venue-local-controls': bootLocalControls
    };

    if (boots[page]) await boots[page]();

    ['rooms','devices','schedules','patron_pulse','room_venues','show_state','venue_device_preferences']
      .forEach(table => db.subscribe(table, refresh));
  }

  function joinedVenueCount(roomId) {
    return cached.roomVenues.filter(rv => rv.room_id === roomId && !rv.left_at).length;
  }

  function renderRooms() {
    const table = document.getElementById('venue-rooms-table');
    if (!table) return;

    table.innerHTML = cached.rooms.map(room => {
      const count = joinedVenueCount(room.id);
      const isJoined = cached.joinedRoom?.room_id === room.id;
      const isFull = count >= 5 && !isJoined;

      return `<tr>
        <td>${ui.esc(room.title)}</td>
        <td>${ui.esc(room.zone || '—')}</td>
        <td>${ui.esc(room.status || 'scheduled')}</td>
        <td>${ui.esc(count)}/5</td>
        <td class="actions">
          ${isJoined
            ? `<button data-leave="${room.id}" class="secondary">Leave Room</button>`
            : `<button data-join="${room.id}" ${isFull ? 'disabled' : ''}>${isFull ? 'Full' : 'Join Room'}</button>`}
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="5">No rooms available.</td></tr>`;

    table.querySelectorAll('[data-join]').forEach(btn => btn.onclick = async () => {
      try {
        if (cached.joinedRoom) {
          ui.flash('Leave your current room before joining a new one.', 'error');
          return;
        }

        const roomId = btn.dataset.join;
        const count = joinedVenueCount(roomId);
        if (count >= 5) {
          ui.flash('This room is already full.', 'error');
          return;
        }

        const { error } = await db.client.from('room_venues').insert({
          room_id: roomId,
          venue_id: currentVenueId(),
          status: 'connected',
          is_broadcasting: false
        });

        if (error) throw error;
        ui.flash('Joined room.');
        await refresh();
      } catch (err) {
        ui.flash(err.message || 'Could not join room.', 'error');
      }
    });

    table.querySelectorAll('[data-leave]').forEach(btn => btn.onclick = async () => {
      try {
        const { error } = await db.client
          .from('room_venues')
          .update({ left_at: new Date().toISOString(), status: 'disconnected', is_broadcasting: false })
          .eq('venue_id', currentVenueId())
          .is('left_at', null);

        if (error) throw error;

        await lk.disconnect();
        ui.flash('Left room.');
        await refresh();
      } catch (err) {
        ui.flash(err.message || 'Could not leave room.', 'error');
      }
    });
  }

  function renderProduction() {
    const roomNameEl = document.getElementById('production-room-name');
    const statusEl = document.getElementById('production-feed-status');
    const connectedVenuesEl = document.getElementById('production-connected-venues');
    const scheduleEl = document.getElementById('production-schedule-body');

    if (roomNameEl) {
      const room = cached.rooms.find(r => r.id === currentRoomId());
      roomNameEl.textContent = room ? roomTitle(room) : 'No room joined';
    }

    if (statusEl) {
      statusEl.textContent = cached.joinedRoom?.is_broadcasting ? 'Live' : 'Stopped';
    }

    if (connectedVenuesEl) {
      const roomId = currentRoomId();
      const venueIds = cached.roomVenues
        .filter(rv => rv.room_id === roomId && !rv.left_at)
        .map(rv => rv.venue_id);

      connectedVenuesEl.innerHTML = venueIds.length
        ? venueIds.map(id => `<li>${ui.esc(String(id))}</li>`).join('')
        : `<li>No connected venues.</li>`;
    }

    if (scheduleEl) {
      const roomId = currentRoomId();
      scheduleEl.innerHTML = cached.schedules
        .filter(s => s.room_id === roomId)
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
        .map(s => `<tr>
          <td>${ui.esc(s.segment_title)}</td>
          <td>${ui.fmtDate(s.starts_at)}</td>
          <td>${ui.fmtDate(s.end_at)}</td>
          <td>${ui.esc(s.segment_type || '—')}</td>
        </tr>`)
        .join('') || `<tr><td colspan="4">No schedule found for this room.</td></tr>`;
    }
  }

  async function bootProduction() {
    const preview = document.getElementById('production-preview');
    const startBtn = document.getElementById('start-feed');
    const stopBtn = document.getElementById('stop-feed');

    if (!startBtn || !stopBtn) return;

    startBtn.onclick = async () => {
      try {
        if (!currentRoomId()) throw new Error('Join a room first.');

        const cameraId = cached.prefs?.preferred_camera_id
          ? cached.devices.find(d => d.id === cached.prefs.preferred_camera_id)?.input_id
          : null;

        const micId = cached.prefs?.preferred_audio_input_id
          ? cached.devices.find(d => d.id === cached.prefs.preferred_audio_input_id)?.input_id
          : null;

        await lk.connect({
          roomName: livekitRoomName(currentRoomId()),
          identity: `venue_${currentVenueId()}`,
          participantName: cached.venue?.name || `Venue ${currentVenueId()}`,
          canPublish: true,
          canSubscribe: true
        });

        await lk.createAndPublishLocalTracks({
          videoDeviceId: cameraId,
          audioDeviceId: micId
        });

        if (preview) lk.attachLocalPreview(preview);

        const { error } = await db.client
          .from('room_venues')
          .update({ is_broadcasting: true, status: 'connected' })
          .eq('venue_id', currentVenueId())
          .is('left_at', null);

        if (error) throw error;

        ui.flash('Feed started.');
        await refresh();
      } catch (err) {
        ui.flash(err.message || 'Could not start feed.', 'error');
      }
    };

    stopBtn.onclick = async () => {
      try {
        await lk.disconnect();

        const { error } = await db.client
          .from('room_venues')
          .update({ is_broadcasting: false })
          .eq('venue_id', currentVenueId())
          .is('left_at', null);

        if (error) throw error;

        ui.flash('Feed stopped.');
        await refresh();
      } catch (err) {
        ui.flash(err.message || 'Could not stop feed.', 'error');
      }
    };

    renderProduction();
  }

  function renderDisplayState() {
    const roomTitleEl = document.getElementById('display-room-title');
    if (!roomTitleEl) return;

    const room = cached.rooms.find(r => r.id === currentRoomId());
    roomTitleEl.textContent = room ? roomTitle(room) : 'No room joined';
  }

  async function bootDisplay() {
    const host = document.getElementById('display-video-host');
    if (!host) return;

    if (!currentRoomId()) {
      host.innerHTML = `<div class="wall-empty">No room joined.</div>`;
      return;
    }

    await lk.connect({
      roomName: livekitRoomName(currentRoomId()),
      identity: `display_${currentVenueId()}`,
      participantName: `Display ${currentVenueId()}`,
      canPublish: false,
      canSubscribe: true
    });

    function attachTrack(track, participant) {
      if (track.kind !== 'video') return;

      const existing = host.querySelector(`[data-participant="${participant.identity}"]`);
      if (existing) return;

      const card = document.createElement('div');
      card.className = 'display-feed-card';
      card.dataset.participant = participant.identity;

      const title = document.createElement('h3');
      title.textContent = participant.name || participant.identity;

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = false;

      track.attach(video);

      card.appendChild(title);
      card.appendChild(video);
      host.appendChild(card);
    }

    lk.onTrackSubscribed(({ track, participant }) => {
      attachTrack(track, participant);
    });

    const room = lk.getRoom();
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((pub) => {
        if (pub.track) attachTrack(pub.track, participant);
      });
    });

    renderDisplayState();
  }

  function renderPulse() {
    const table = document.getElementById('venue-pulse-table');
    if (!table) return;

    table.innerHTML = cached.pulse.map(p => `<tr>
      <td>${ui.esc(roomTitle(cached.rooms.find(r => r.id === p.room_id)))}</td>
      <td>${ui.esc(p.pulse_score)}</td>
      <td>${ui.esc(p.crowd_count)}</td>
      <td>${ui.esc(p.energy_level)}</td>
      <td>${ui.esc(p.source)}</td>
      <td>${ui.fmtDate(p.created_at)}</td>
    </tr>`).join('') || `<tr><td colspan="6">No pulse entries found.</td></tr>`;
  }

  async function bootPulse() {
    renderPulse();
  }

  function renderLocalControlsState() {
    const roomText = document.getElementById('local-current-room');
    if (!roomText) return;
    const room = cached.rooms.find(r => r.id === currentRoomId());
    roomText.textContent = room ? roomTitle(room) : 'No room joined';
  }

  async function bootLocalControls() {
    const camSel = document.getElementById('local-camera-device');
    const micSel = document.getElementById('local-mic-device');
    const preview = document.getElementById('local-video');
    const info = document.getElementById('stream-info');
    const saveBtn = document.getElementById('save-local-devices');
    const requestBtn = document.getElementById('request-media');
    const startPreviewBtn = document.getElementById('start-preview');
    const stopPreviewBtn = document.getElementById('stop-preview');

    if (!camSel || !micSel) return;

    async function loadDevices() {
      const { videoInputs, audioInputs } = await lk.listDevices();

      camSel.innerHTML = videoInputs.map((d, i) => ui.option(d.deviceId, d.label || `Camera ${i + 1}`)).join('');
      micSel.innerHTML = audioInputs.map((d, i) => ui.option(d.deviceId, d.label || `Microphone ${i + 1}`)).join('');
    }

    requestBtn && (requestBtn.onclick = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(t => t.stop());
        await loadDevices();
        ui.flash('Camera and microphone access granted');
      } catch (err) {
        ui.flash(err.message || 'Permission denied', 'error');
      }
    });

    startPreviewBtn && (startPreviewBtn.onclick = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: camSel.value ? { deviceId: { exact: camSel.value } } : true,
          audio: micSel.value ? { deviceId: { exact: micSel.value } } : true
        });

        preview.srcObject = stream;
        info.textContent = 'Preview active.';
      } catch (err) {
        ui.flash(err.message || 'Preview failed', 'error');
      }
    });

    stopPreviewBtn && (stopPreviewBtn.onclick = () => {
      const stream = preview.srcObject;
      if (stream) stream.getTracks().forEach(t => t.stop());
      preview.srcObject = null;
      info.textContent = 'Preview stopped.';
    });

    saveBtn && (saveBtn.onclick = async () => {
      try {
        const cameraName = camSel.options[camSel.selectedIndex]?.text || 'Camera';
        const micName = micSel.options[micSel.selectedIndex]?.text || 'Microphone';

        let savedCamera = null;
        let savedMic = null;

        if (camSel.value) {
          const { data, error } = await db.client
            .from('devices')
            .upsert({
              venue_id: String(currentVenueId()),
              room_id: currentRoomId(),
              name: cameraName,
              type: 'camera',
              input_id: camSel.value,
              status: 'online',
              is_default: false
            }, { onConflict: 'venue_id,input_id' })
            .select()
            .single();

          if (error) throw error;
          savedCamera = data;
        }

        if (micSel.value) {
          const { data, error } = await db.client
            .from('devices')
            .upsert({
              venue_id: String(currentVenueId()),
              room_id: currentRoomId(),
              name: micName,
              type: 'microphone',
              input_id: micSel.value,
              status: 'online',
              is_default: false
            }, { onConflict: 'venue_id,input_id' })
            .select()
            .single();

          if (error) throw error;
          savedMic = data;
        }

        const { error: prefError } = await db.client
          .from('venue_device_preferences')
          .upsert({
            venue_id: currentVenueId(),
            preferred_camera_id: savedCamera?.id || null,
            preferred_audio_input_id: savedMic?.id || null,
            preferred_audio_interface_id: null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'venue_id' });

        if (prefError) throw prefError;

        ui.flash('Local devices saved.');
        await refresh();
      } catch (err) {
        ui.flash(err.message || 'Could not save local devices.', 'error');
      }
    });

    await loadDevices();
    renderLocalControlsState();
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch(err => {
      console.error(err);
      ui.flash(err.message || 'Venue page failed to load', 'error');
    });
  });
})();
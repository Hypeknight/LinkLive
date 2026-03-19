(function () {
  const cfg = window.APP_CONFIG || {};
  const supabaseReady = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  let sb = null;

  if (supabaseReady) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  }

  const mockSeed = {
    rooms: [
      { id: crypto.randomUUID(), name: 'Main Stage', capacity: 350, status: 'active', zone: 'Front', assigned_camera_id: null, assigned_mic_id: null, notes: 'Primary show area', created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: 'VIP Lounge', capacity: 80, status: 'active', zone: 'Upper', assigned_camera_id: null, assigned_mic_id: null, notes: 'Premium guests', created_at: new Date().toISOString() },
    ],
    devices: [
      { id: crypto.randomUUID(), name: 'Front Camera A', type: 'camera', status: 'online', room_id: null, input_id: '', is_default: true, settings_json: { resolution: '1280x720' }, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: 'Wireless Mic 1', type: 'microphone', status: 'online', room_id: null, input_id: '', is_default: true, settings_json: { gain: 75 }, created_at: new Date().toISOString() },
    ],
    schedules: [
      { id: crypto.randomUUID(), title: 'Doors Open', room_id: null, start_at: isoOffsetHours(1), end_at: isoOffsetHours(2), status: 'scheduled', lead_name: 'Ops Lead', notes: 'Staff check-in 30 mins early', created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), title: 'Headline Set', room_id: null, start_at: isoOffsetHours(3), end_at: isoOffsetHours(5), status: 'scheduled', lead_name: 'Stage Manager', notes: 'Mic check complete first', created_at: new Date().toISOString() },
    ],
    patron_pulse: [
      { id: crypto.randomUUID(), room_id: null, pulse_score: 78, crowd_count: 112, energy_level: 8, source: 'manual', notes: 'Strong early crowd', created_at: new Date().toISOString() },
    ],
    ops_notes: [
      { id: crypto.randomUUID(), title: 'Pre-open checklist', priority: 'high', status: 'open', assigned_to: 'Ops', room_id: null, note: 'Verify stage routing and VIP wristbands.', created_at: new Date().toISOString() },
    ]
  };

  function isoOffsetHours(hours) {
    return new Date(Date.now() + hours * 3600 * 1000).toISOString();
  }

  function getStore(table) {
    const raw = localStorage.getItem(`live_${table}`);
    if (!raw) {
      localStorage.setItem(`live_${table}`, JSON.stringify(mockSeed[table] || []));
      return JSON.parse(JSON.stringify(mockSeed[table] || []));
    }
    return JSON.parse(raw);
  }

  function setStore(table, rows) {
    localStorage.setItem(`live_${table}`, JSON.stringify(rows));
  }

  async function list(table) {
    if (sb) {
      const { data, error } = await sb.from(table).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
    return getStore(table);
  }

  async function insert(table, row) {
    const payload = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    if (sb) {
      const { data, error } = await sb.from(table).insert(payload).select().single();
      if (error) throw error;
      return data;
    }
    const rows = getStore(table);
    rows.unshift(payload);
    setStore(table, rows);
    return payload;
  }

  async function update(table, id, patch) {
    if (sb) {
      const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    }
    const rows = getStore(table).map(r => r.id === id ? { ...r, ...patch } : r);
    setStore(table, rows);
    return rows.find(r => r.id === id);
  }

  async function remove(table, id) {
    if (sb) {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) throw error;
      return true;
    }
    const rows = getStore(table).filter(r => r.id !== id);
    setStore(table, rows);
    return true;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }

  async function hydrateCommon() {
    const modeEl = document.querySelector('[data-mode]');
    if (modeEl) modeEl.textContent = sb ? 'Supabase live mode' : 'Mock mode';
    const venueEl = document.querySelector('[data-venue]');
    if (venueEl) venueEl.textContent = cfg.venueName || 'Venue';
  }

  async function renderDashboard() {
    const rooms = await list('rooms');
    const devices = await list('devices');
    const schedules = await list('schedules');
    const pulse = await list('patron_pulse');

    document.getElementById('kpiRooms').textContent = rooms.length;
    document.getElementById('kpiDevices').textContent = devices.length;
    document.getElementById('kpiLiveShows').textContent = schedules.filter(s => ['scheduled','live'].includes(s.status)).length;
    document.getElementById('kpiPulse').textContent = pulse[0]?.pulse_score ?? 0;

    document.getElementById('roomStatus').innerHTML = rooms.map(r => `
      <div class="item">
        <div class="flex justify-between flex-wrap">
          <strong>${esc(r.name)}</strong>
          <span class="badge ${r.status === 'active' ? 'success' : 'warn'}">${esc(r.status)}</span>
        </div>
        <div class="small muted">Zone: ${esc(r.zone || '—')} • Capacity: ${esc(r.capacity || 0)}</div>
      </div>
    `).join('');

    document.getElementById('todaySchedule').innerHTML = schedules.map(s => `
      <tr>
        <td>${new Date(s.start_at).toLocaleString()}</td>
        <td>${esc(s.title)}</td>
        <td>${esc(s.status)}</td>
        <td>${esc(s.lead_name || '—')}</td>
      </tr>
    `).join('');

    const recentPulse = pulse.slice(0, 6).map(p => `
      <div class="item">
        <div class="flex justify-between"><strong>Pulse ${esc(p.pulse_score)}</strong><span>${new Date(p.created_at).toLocaleTimeString()}</span></div>
        <div class="small muted">Crowd ${esc(p.crowd_count || 0)} • Energy ${esc(p.energy_level || 0)}/10</div>
      </div>
    `).join('');
    document.getElementById('pulseFeed').innerHTML = recentPulse || '<div class="muted">No pulse yet.</div>';
  }

  async function renderRooms() {
    const rooms = await list('rooms');
    const devices = await list('devices');
    const tbody = document.getElementById('roomsBody');
    tbody.innerHTML = rooms.map(r => {
      const cam = devices.find(d => d.id === r.assigned_camera_id)?.name || '—';
      const mic = devices.find(d => d.id === r.assigned_mic_id)?.name || '—';
      return `
        <tr>
          <td>${esc(r.name)}</td>
          <td>${esc(r.zone || '—')}</td>
          <td>${esc(r.capacity || 0)}</td>
          <td>${esc(r.status || 'inactive')}</td>
          <td>${esc(cam)}</td>
          <td>${esc(mic)}</td>
          <td>
            <button class="btn" data-edit-room="${r.id}">Assign</button>
            <button class="btn" data-delete-room="${r.id}">Delete</button>
          </td>
        </tr>`;
    }).join('');

    const roomSelect = document.getElementById('assignRoomId');
    const camSelect = document.getElementById('assignCameraId');
    const micSelect = document.getElementById('assignMicId');
    roomSelect.innerHTML = rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    camSelect.innerHTML = '<option value="">None</option>' + devices.filter(d => d.type === 'camera').map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
    micSelect.innerHTML = '<option value="">None</option>' + devices.filter(d => d.type === 'microphone').map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');

    tbody.querySelectorAll('[data-delete-room]').forEach(btn => btn.addEventListener('click', async e => {
      await remove('rooms', e.target.dataset.deleteRoom);
      await renderRooms();
    }));

    tbody.querySelectorAll('[data-edit-room]').forEach(btn => btn.addEventListener('click', async e => {
      const row = rooms.find(r => r.id === e.target.dataset.editRoom);
      roomSelect.value = row.id;
      camSelect.value = row.assigned_camera_id || '';
      micSelect.value = row.assigned_mic_id || '';
      document.getElementById('assignHint').textContent = `Editing ${row.name}`;
    }));
  }

  async function renderScheduling() {
    const rooms = await list('rooms');
    const schedules = await list('schedules');
    const roomSelect = document.getElementById('scheduleRoomId');
    roomSelect.innerHTML = '<option value="">Unassigned</option>' + rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    document.getElementById('scheduleBody').innerHTML = schedules.map(s => `
      <tr>
        <td>${esc(s.title)}</td>
        <td>${esc(rooms.find(r => r.id === s.room_id)?.name || '—')}</td>
        <td>${new Date(s.start_at).toLocaleString()}</td>
        <td>${new Date(s.end_at).toLocaleString()}</td>
        <td>${esc(s.status)}</td>
      </tr>
    `).join('');
  }

  async function renderPatronPulse() {
    const rooms = await list('rooms');
    const pulse = await list('patron_pulse');
    const roomSelect = document.getElementById('pulseRoomId');
    roomSelect.innerHTML = '<option value="">Venue-wide</option>' + rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    document.getElementById('pulseBody').innerHTML = pulse.map(p => `
      <tr>
        <td>${new Date(p.created_at).toLocaleString()}</td>
        <td>${esc(rooms.find(r => r.id === p.room_id)?.name || 'Venue-wide')}</td>
        <td>${esc(p.pulse_score)}</td>
        <td>${esc(p.crowd_count || 0)}</td>
        <td>${esc(p.energy_level || 0)}</td>
        <td>${esc(p.source || 'manual')}</td>
      </tr>
    `).join('');
  }

  async function renderOps() {
    const rooms = await list('rooms');
    const notes = await list('ops_notes');
    const roomSelect = document.getElementById('opsRoomId');
    roomSelect.innerHTML = '<option value="">No room</option>' + rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    document.getElementById('opsList').innerHTML = notes.map(n => `
      <div class="item">
        <div class="flex justify-between flex-wrap">
          <strong>${esc(n.title)}</strong>
          <span class="badge ${n.priority === 'high' ? 'danger' : n.priority === 'medium' ? 'warn' : ''}">${esc(n.priority)}</span>
        </div>
        <div class="small muted">${esc(n.assigned_to || 'Unassigned')} • ${esc(n.status)}</div>
        <div>${esc(n.note || '')}</div>
      </div>
    `).join('');
  }

  async function renderDeviceSettings() {
    const devices = await list('devices');
    const rooms = await list('rooms');
    document.getElementById('deviceBody').innerHTML = devices.map(d => `
      <tr>
        <td>${esc(d.name)}</td>
        <td>${esc(d.type)}</td>
        <td>${esc(d.status)}</td>
        <td>${esc(rooms.find(r => r.id === d.room_id)?.name || '—')}</td>
        <td>${esc(d.input_id || '—')}</td>
        <td>${esc(JSON.stringify(d.settings_json || {}))}</td>
      </tr>
    `).join('');
  }

  async function renderLocalControls() {
    const rooms = await list('rooms');
    const roomSelect = document.getElementById('controlRoomId');
    roomSelect.innerHTML = rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');

    const camSelect = document.getElementById('localCamId');
    const micSelect = document.getElementById('localMicId');

    if (!navigator.mediaDevices?.enumerateDevices) {
      camSelect.innerHTML = '<option>Media devices not available</option>';
      micSelect.innerHTML = '<option>Media devices not available</option>';
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    const mics = devices.filter(d => d.kind === 'audioinput');
    camSelect.innerHTML = cams.map(d => `<option value="${d.deviceId}">${esc(d.label || 'Camera')}</option>`).join('');
    micSelect.innerHTML = mics.map(d => `<option value="${d.deviceId}">${esc(d.label || 'Microphone')}</option>`).join('');
  }

  async function startPreview() {
    const videoId = document.getElementById('localCamId').value;
    const audioId = document.getElementById('localMicId').value;
    const constraints = {
      video: videoId ? { deviceId: { exact: videoId } } : true,
      audio: audioId ? { deviceId: { exact: audioId } } : true,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = document.getElementById('previewVideo');
    video.srcObject = stream;
    window.__livePreviewStream = stream;
  }

  function stopPreview() {
    const stream = window.__livePreviewStream;
    if (stream) stream.getTracks().forEach(t => t.stop());
    const video = document.getElementById('previewVideo');
    if (video) video.srcObject = null;
  }

  function bindForms() {
    const roomForm = document.getElementById('roomForm');
    if (roomForm) roomForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(roomForm);
      await insert('rooms', {
        name: fd.get('name'), zone: fd.get('zone'), capacity: Number(fd.get('capacity') || 0),
        status: fd.get('status'), notes: fd.get('notes')
      });
      roomForm.reset();
      await renderRooms();
    });

    const assignForm = document.getElementById('assignForm');
    if (assignForm) assignForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(assignForm);
      const roomId = fd.get('room_id');
      const assigned_camera_id = fd.get('assigned_camera_id') || null;
      const assigned_mic_id = fd.get('assigned_mic_id') || null;
      await update('rooms', roomId, { assigned_camera_id, assigned_mic_id });
      if (assigned_camera_id) await update('devices', assigned_camera_id, { room_id: roomId });
      if (assigned_mic_id) await update('devices', assigned_mic_id, { room_id: roomId });
      document.getElementById('assignHint').textContent = 'Assignment saved';
      await renderRooms();
    });

    const scheduleForm = document.getElementById('scheduleForm');
    if (scheduleForm) scheduleForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(scheduleForm);
      await insert('schedules', {
        title: fd.get('title'), room_id: fd.get('room_id') || null,
        start_at: fd.get('start_at'), end_at: fd.get('end_at'),
        status: fd.get('status'), lead_name: fd.get('lead_name'), notes: fd.get('notes')
      });
      scheduleForm.reset();
      await renderScheduling();
    });

    const pulseForm = document.getElementById('pulseForm');
    if (pulseForm) pulseForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(pulseForm);
      await insert('patron_pulse', {
        room_id: fd.get('room_id') || null,
        pulse_score: Number(fd.get('pulse_score') || 0),
        crowd_count: Number(fd.get('crowd_count') || 0),
        energy_level: Number(fd.get('energy_level') || 0),
        source: fd.get('source'), notes: fd.get('notes')
      });
      pulseForm.reset();
      await renderPatronPulse();
    });

    const opsForm = document.getElementById('opsForm');
    if (opsForm) opsForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(opsForm);
      await insert('ops_notes', {
        title: fd.get('title'), priority: fd.get('priority'), status: fd.get('status'),
        assigned_to: fd.get('assigned_to'), room_id: fd.get('room_id') || null, note: fd.get('note')
      });
      opsForm.reset();
      await renderOps();
    });

    const deviceForm = document.getElementById('deviceForm');
    if (deviceForm) deviceForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(deviceForm);
      let settings_json = {};
      try { settings_json = JSON.parse(fd.get('settings_json') || '{}'); } catch {}
      await insert('devices', {
        name: fd.get('name'), type: fd.get('type'), status: fd.get('status'),
        input_id: fd.get('input_id'), room_id: fd.get('room_id') || null,
        is_default: fd.get('is_default') === 'on', settings_json
      });
      deviceForm.reset();
      await renderDeviceSettings();
      if (document.getElementById('roomsBody')) await renderRooms();
    });

    const previewBtn = document.getElementById('startPreviewBtn');
    if (previewBtn) previewBtn.addEventListener('click', async () => {
      try {
        await startPreview();
        document.getElementById('previewStatus').textContent = 'Preview live';
      } catch (err) {
        document.getElementById('previewStatus').textContent = `Preview error: ${err.message}`;
      }
    });

    const stopBtn = document.getElementById('stopPreviewBtn');
    if (stopBtn) stopBtn.addEventListener('click', () => {
      stopPreview();
      document.getElementById('previewStatus').textContent = 'Preview stopped';
    });

    const saveLocalMapBtn = document.getElementById('saveLocalMapBtn');
    if (saveLocalMapBtn) saveLocalMapBtn.addEventListener('click', async () => {
      const roomId = document.getElementById('controlRoomId').value;
      const camInputId = document.getElementById('localCamId').value;
      const micInputId = document.getElementById('localMicId').value;
      const devices = await list('devices');
      const cam = devices.find(d => d.type === 'camera') || null;
      const mic = devices.find(d => d.type === 'microphone') || null;
      if (cam) await update('devices', cam.id, { room_id: roomId, input_id: camInputId, status: 'online' });
      if (mic) await update('devices', mic.id, { room_id: roomId, input_id: micInputId, status: 'online' });
      document.getElementById('previewStatus').textContent = 'Local devices mapped to room';
    });
  }

  async function boot() {
    await hydrateCommon();
    bindForms();
    const page = document.body.dataset.page;
    if (page === 'dashboard') await renderDashboard();
    if (page === 'rooms') await renderRooms();
    if (page === 'scheduling') await renderScheduling();
    if (page === 'pulse') await renderPatronPulse();
    if (page === 'ops') await renderOps();
    if (page === 'devices') await renderDeviceSettings();
    if (page === 'controls') await renderLocalControls();
  }

  window.LiveApp = { list, insert, update, remove, boot };
  document.addEventListener('DOMContentLoaded', boot);
})();

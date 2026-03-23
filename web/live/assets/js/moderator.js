(function () {
    const db = window.LiveDB;
  const ui = window.LiveUI;
  const auth = window.LiveAuth;

  let stream = null;
  let cached = { rooms: [], devices: [], schedules: [], notes: [], pulse: [] };

  function setOptions(select, rows, placeholder, valueKey = 'id', labelKey = 'name') {
    if (!select) return;
    select.innerHTML = ui.option('', placeholder, true) + rows.map(row => ui.option(row[valueKey], row[labelKey] || row.browser_device_id || row.id)).join('');
  }

  async function refreshCache() {
    cached = await ui.loadReferenceData();
    return cached;
  }

  async function boot() {
    await auth.requireRole(db.cfg.moderatorRoles);
    await auth.bootProtectedShell();
    ui.setConnection(true, 'Connected');
    await refreshCache();
    const page = document.body.dataset.page;
    const boots = {
      'moderator-dashboard': bootDashboard,
      'moderator-rooms': bootRooms,
      'moderator-scheduling': bootScheduling,
      'moderator-ops': bootOps,
      'moderator-pulse': bootPulse,
      'moderator-local-controls': bootLocalControls,
      'moderator-devices': bootDevices
    };
    if (boots[page]) await boots[page]();
    ['rooms','devices','schedules','ops_notes','patron_pulse'].forEach(t => db.subscribe(t, async () => {
      await refreshCache();
      if (boots[page]) await boots[page](true);
    }));
  }

  async function bootDashboard() {
    const data = cached;
    const now = Date.now();
    const stats = {
      rooms: data.rooms.length,
      live: data.rooms.filter(r => r.status === 'live').length,
      scheduled: data.schedules.filter(s => s.status === 'scheduled' && new Date(s.start_at || 0).getTime() >= now).length,
      openNotes: data.notes.filter(n => n.status !== 'closed').length,
      devices: data.devices.length,
      avgPulse: data.pulse.length ? Math.round(data.pulse.reduce((a, b) => a + Number(b.pulse_score || 0), 0) / data.pulse.length) : 0
    };
    document.querySelector('[data-stat="rooms"]').textContent = stats.rooms;
    document.querySelector('[data-stat="live"]').textContent = stats.live;
    document.querySelector('[data-stat="scheduled"]').textContent = stats.scheduled;
    document.querySelector('[data-stat="openNotes"]').textContent = stats.openNotes;
    document.querySelector('[data-stat="devices"]').textContent = stats.devices;
    document.querySelector('[data-stat="avgPulse"]').textContent = `${stats.avgPulse}%`;

    document.getElementById('dashboard-rooms').innerHTML = data.rooms.map(r => `<tr><td>${ui.esc(r.name)}</td><td>${ui.esc(r.zone || '—')}</td><td>${ui.esc(r.status)}</td><td>${ui.esc(r.capacity)}</td><td>${ui.fmtDate(r.updated_at)}</td></tr>`).join('') || `<tr><td colspan="5">No rooms found.</td></tr>`;
    document.getElementById('dashboard-schedules').innerHTML = data.schedules.slice(0, 10).map(s => `<tr><td>${ui.esc(s.title)}</td><td>${ui.esc(ui.roomName(data.rooms, s.room_id))}</td><td>${ui.fmtDate(s.start_at)}</td><td>${ui.esc(s.status)}</td></tr>`).join('') || `<tr><td colspan="4">No schedules found.</td></tr>`;
    document.getElementById('dashboard-notes').innerHTML = data.notes.slice(0, 10).map(n => `<tr><td>${ui.esc(n.title)}</td><td>${ui.esc(n.priority)}</td><td>${ui.esc(n.status)}</td><td>${ui.fmtDate(n.created_at)}</td></tr>`).join('') || `<tr><td colspan="4">No ops notes found.</td></tr>`;
  }

  async function bootRooms() {
    const form = document.getElementById('room-form');
    if (!form) return;
    setOptions(form.assigned_camera_id, cached.devices.filter(d => d.device_kind === 'camera'), 'Unassigned camera', 'id', 'label');
    setOptions(form.assigned_mic_id, cached.devices.filter(d => d.device_kind === 'microphone'), 'Unassigned mic', 'id', 'label');
    let editingId = form.dataset.editingId || '';
    const tbody = document.getElementById('rooms-table');
    tbody.innerHTML = cached.rooms.map(r => `<tr>
      <td>${ui.esc(r.name)}</td>
      <td>${ui.esc(r.zone || '—')}</td>
      <td>${ui.esc(r.capacity)}</td>
      <td>${ui.esc(r.status)}</td>
      <td>${ui.esc(cached.devices.find(d => d.id === r.assigned_camera_id)?.label || '—')}</td>
      <td>${ui.esc(cached.devices.find(d => d.id === r.assigned_mic_id)?.label || '—')}</td>
      <td class="actions">
        <button data-edit="${r.id}">Edit</button>
        <button data-live="${r.id}">Go Live</button>
        <button data-complete="${r.id}">Complete</button>
        <button class="danger" data-delete="${r.id}">Delete</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="7">No rooms found.</td></tr>`;

    tbody.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = () => {
      const r = cached.rooms.find(x => x.id === btn.dataset.edit);
      if (!r) return;
      editingId = r.id;
      form.dataset.editingId = r.id;
      form.name.value = r.name || '';
      form.zone.value = r.zone || '';
      form.capacity.value = r.capacity || 0;
      form.status.value = r.status || 'scheduled';
      form.assigned_camera_id.value = r.assigned_camera_id || '';
      form.assigned_mic_id.value = r.assigned_mic_id || '';
      document.getElementById('room-form-title').textContent = 'Edit Room';
    });
    tbody.querySelectorAll('[data-live]').forEach(btn => btn.onclick = async () => {
      await db.update('rooms', btn.dataset.live, { status: 'live' });
      ui.flash('Room is live');
    });
    tbody.querySelectorAll('[data-complete]').forEach(btn => btn.onclick = async () => {
      await db.update('rooms', btn.dataset.complete, { status: 'completed' });
      ui.flash('Room marked complete');
    });
    tbody.querySelectorAll('[data-delete]').forEach(btn => btn.onclick = async () => {
      if (!confirm('Delete this room?')) return;
      await db.remove('rooms', btn.dataset.delete);
      ui.flash('Room deleted');
    });

    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          name: form.name.value.trim(),
          zone: form.zone.value.trim() || null,
          capacity: Number(form.capacity.value || 0),
          status: form.status.value,
          assigned_camera_id: form.assigned_camera_id.value || null,
          assigned_mic_id: form.assigned_mic_id.value || null
        };
        try {
          if (form.dataset.editingId) {
            await db.update('rooms', form.dataset.editingId, payload);
            ui.flash('Room updated');
          } else {
            await db.insert('rooms', payload);
            ui.flash('Room created');
          }
          form.reset();
          form.dataset.editingId = '';
          document.getElementById('room-form-title').textContent = 'Add Room';
        } catch (err) {
          ui.flash(err.message, 'error');
        }
      });
      document.getElementById('room-form-reset').addEventListener('click', () => {
        form.reset();
        form.dataset.editingId = '';
        document.getElementById('room-form-title').textContent = 'Add Room';
      });
    }
  }

  async function bootScheduling() {
    const form = document.getElementById('schedule-form');
    if (!form) return;
    setOptions(form.room_id, cached.rooms, 'Select room');
    const tbody = document.getElementById('schedule-table');
    tbody.innerHTML = cached.schedules.map(s => `<tr>
      <td>${ui.esc(s.title)}</td>
      <td>${ui.esc(ui.roomName(cached.rooms, s.room_id))}</td>
      <td>${ui.fmtDate(s.start_at)}</td>
      <td>${ui.fmtDate(s.end_at)}</td>
      <td>${ui.esc(s.lead_name || '—')}</td>
      <td>${ui.esc(s.status)}</td>
      <td class="actions"><button data-edit="${s.id}">Edit</button><button data-live="${s.id}">Live</button><button data-delete="${s.id}" class="danger">Delete</button></td>
    </tr>`).join('') || `<tr><td colspan="7">No schedule blocks found.</td></tr>`;

    tbody.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = () => {
      const s = cached.schedules.find(x => x.id === btn.dataset.edit);
      if (!s) return;
      form.dataset.editingId = s.id;
      form.title.value = s.title || '';
      form.room_id.value = s.room_id || '';
      form.start_at.value = s.start_at ? new Date(s.start_at).toISOString().slice(0,16) : '';
      form.end_at.value = s.end_at ? new Date(s.end_at).toISOString().slice(0,16) : '';
      form.lead_name.value = s.lead_name || '';
      form.status.value = s.status || 'scheduled';
      document.getElementById('schedule-form-title').textContent = 'Edit Schedule Block';
    });
    tbody.querySelectorAll('[data-live]').forEach(btn => btn.onclick = async () => {
      await db.update('schedules', btn.dataset.live, { status: 'live' });
      ui.flash('Schedule block set live');
    });
    tbody.querySelectorAll('[data-delete]').forEach(btn => btn.onclick = async () => {
      if (!confirm('Delete this schedule block?')) return;
      await db.remove('schedules', btn.dataset.delete);
      ui.flash('Schedule block deleted');
    });

    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          room_id: form.room_id.value || null,
          title: form.title.value.trim(),
          start_at: new Date(form.start_at.value).toISOString(),
          end_at: form.end_at.value ? new Date(form.end_at.value).toISOString() : null,
          lead_name: form.lead_name.value.trim() || null,
          status: form.status.value
        };
        if (form.dataset.editingId) {
          await db.update('schedules', form.dataset.editingId, payload);
          ui.flash('Schedule updated');
        } else {
          await db.insert('schedules', payload);
          ui.flash('Schedule created');
        }
        form.reset();
        form.dataset.editingId = '';
        document.getElementById('schedule-form-title').textContent = 'Add Schedule Block';
      });
      document.getElementById('schedule-form-reset').addEventListener('click', () => {
        form.reset();
        form.dataset.editingId = '';
        document.getElementById('schedule-form-title').textContent = 'Add Schedule Block';
      });
    }
  }

  async function bootOps() {
    const form = document.getElementById('ops-form');
    if (!form) return;
    setOptions(form.room_id, cached.rooms, 'General note');
    const tbody = document.getElementById('ops-table');
    tbody.innerHTML = cached.notes.map(n => `<tr>
      <td>${ui.esc(n.title)}</td><td>${ui.esc(ui.roomName(cached.rooms, n.room_id))}</td><td>${ui.esc(n.priority)}</td><td>${ui.esc(n.status)}</td><td>${ui.esc(n.assigned_to || '—')}</td><td>${ui.fmtDate(n.created_at)}</td>
      <td class="actions"><button data-edit="${n.id}">Edit</button><button data-close="${n.id}">Close</button><button class="danger" data-delete="${n.id}">Delete</button></td>
    </tr>`).join('') || `<tr><td colspan="7">No ops notes found.</td></tr>`;

    tbody.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = () => {
      const n = cached.notes.find(x => x.id === btn.dataset.edit);
      form.dataset.editingId = n.id;
      form.room_id.value = n.room_id || '';
      form.title.value = n.title || '';
      form.priority.value = n.priority || 'medium';
      form.status.value = n.status || 'open';
      form.assigned_to.value = n.assigned_to || '';
      form.note.value = n.note || '';
    });
    tbody.querySelectorAll('[data-close]').forEach(btn => btn.onclick = async () => {
      await db.update('ops_notes', btn.dataset.close, { status: 'closed' });
      ui.flash('Ops note closed');
    });
    tbody.querySelectorAll('[data-delete]').forEach(btn => btn.onclick = async () => {
      if (!confirm('Delete this ops note?')) return;
      await db.remove('ops_notes', btn.dataset.delete);
      ui.flash('Ops note deleted');
    });

    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          room_id: form.room_id.value || null,
          title: form.title.value.trim(),
          priority: form.priority.value,
          status: form.status.value,
          assigned_to: form.assigned_to.value.trim() || null,
          note: form.note.value.trim() || null
        };
        if (form.dataset.editingId) {
          await db.update('ops_notes', form.dataset.editingId, payload);
          ui.flash('Ops note updated');
        } else {
          await db.insert('ops_notes', payload);
          ui.flash('Ops note created');
        }
        form.reset();
        form.dataset.editingId = '';
      });
      document.getElementById('ops-form-reset').addEventListener('click', () => {
        form.reset();
        form.dataset.editingId = '';
      });
    }
  }

  async function bootPulse() {
    const form = document.getElementById('pulse-form');
    if (!form) return;
    setOptions(form.room_id, cached.rooms, 'Select room');
    document.getElementById('pulse-table').innerHTML = cached.pulse.map(p => `<tr><td>${ui.esc(ui.roomName(cached.rooms, p.room_id))}</td><td>${ui.esc(p.pulse_score)}</td><td>${ui.esc(p.crowd_count)}</td><td>${ui.esc(p.energy_level)}</td><td>${ui.esc(p.source)}</td><td>${ui.fmtDate(p.created_at)}</td></tr>`).join('') || `<tr><td colspan="6">No pulse entries found.</td></tr>`;
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          room_id: form.room_id.value || null,
          pulse_score: Number(form.pulse_score.value || 0),
          crowd_count: Number(form.crowd_count.value || 0),
          energy_level: Number(form.energy_level.value || 1),
          source: form.source.value || 'moderator',
          notes: form.notes.value.trim() || null
        };
        await db.insert('patron_pulse', payload);
        ui.flash('Pulse entry saved');
        form.reset();
      });
    }
  }

  async function bootDevices() {
    const form = document.getElementById('device-form');
    if (!form) return;
    document.getElementById('devices-table').innerHTML = cached.devices.map(d => `<tr><td>${ui.esc(d.label)}</td><td>${ui.esc(d.device_kind)}</td><td>${ui.esc(d.browser_device_id || '—')}</td><td>${ui.esc(d.status)}</td><td>${ui.fmtDate(d.updated_at)}</td><td class="actions"><button data-edit="${d.id}">Edit</button><button class="danger" data-delete="${d.id}">Delete</button></td></tr>`).join('') || `<tr><td colspan="6">No devices found.</td></tr>`;
    document.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = () => {
      const d = cached.devices.find(x => x.id === btn.dataset.edit);
      form.dataset.editingId = d.id;
      form.label.value = d.label || '';
      form.device_kind.value = d.device_kind || 'camera';
      form.browser_device_id.value = d.browser_device_id || '';
      form.status.value = d.status || 'active';
      document.getElementById('device-form-title').textContent = 'Edit Device';
    });
    document.querySelectorAll('[data-delete]').forEach(btn => btn.onclick = async () => {
      if (!confirm('Delete this device?')) return;
      await db.remove('devices', btn.dataset.delete);
      ui.flash('Device deleted');
    });

    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          label: form.label.value.trim(),
          device_kind: form.device_kind.value,
          browser_device_id: form.browser_device_id.value.trim() || null,
          status: form.status.value
        };
        if (form.dataset.editingId) {
          await db.update('devices', form.dataset.editingId, payload);
          ui.flash('Device updated');
        } else {
          await db.insert('devices', payload);
          ui.flash('Device created');
        }
        form.reset();
        form.dataset.editingId = '';
        document.getElementById('device-form-title').textContent = 'Add Device';
      });
      document.getElementById('device-form-reset').addEventListener('click', () => {
        form.reset();
        form.dataset.editingId = '';
        document.getElementById('device-form-title').textContent = 'Add Device';
      });
      document.getElementById('scan-browser-devices').addEventListener('click', async () => {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const rows = devices.filter(d => d.kind === 'videoinput' || d.kind === 'audioinput').map(d => ({
            label: d.label || (d.kind === 'videoinput' ? 'Camera' : 'Microphone'),
            device_kind: d.kind === 'videoinput' ? 'camera' : 'microphone',
            browser_device_id: d.deviceId,
            status: 'active'
          }));
          await db.upsertDevices(rows);
          ui.flash('Browser devices synced');
        } catch (err) {
          ui.flash(err.message || 'Unable to scan browser devices', 'error');
        }
      });
    }
  }

  async function bootLocalControls() {
    const camSel = document.getElementById('local-camera-device');
    const micSel = document.getElementById('local-mic-device');
    const roomSel = document.getElementById('local-room-id');
    const video = document.getElementById('local-video');
    const info = document.getElementById('stream-info');
    setOptions(roomSel, cached.rooms, 'Select room');
    document.getElementById('local-map-table').innerHTML = cached.rooms.map(r => `<tr><td>${ui.esc(r.name)}</td><td>${ui.esc(cached.devices.find(d => d.id === r.assigned_camera_id)?.label || '—')}</td><td>${ui.esc(cached.devices.find(d => d.id === r.assigned_mic_id)?.label || '—')}</td><td>${ui.esc(r.status)}</td></tr>`).join('') || `<tr><td colspan="4">No rooms found.</td></tr>`;

    async function loadBrowserDevices() {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      const mics = devices.filter(d => d.kind === 'audioinput');
      camSel.innerHTML = cams.map(d => ui.option(d.deviceId, d.label || 'Camera')).join('');
      micSel.innerHTML = mics.map(d => ui.option(d.deviceId, d.label || 'Microphone')).join('');
      return { cams, mics };
    }

    document.getElementById('request-media').onclick = async () => {
      try {
        const req = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        req.getTracks().forEach(t => t.stop());
        await loadBrowserDevices();
        ui.flash('Camera and microphone access granted');
      } catch (err) {
        ui.flash(err.message || 'Media permission denied', 'error');
      }
    };
    document.getElementById('start-preview').onclick = async () => {
      try {
        if (stream) stream.getTracks().forEach(t => t.stop());
        stream = await navigator.mediaDevices.getUserMedia({
          video: camSel.value ? { deviceId: { exact: camSel.value } } : true,
          audio: micSel.value ? { deviceId: { exact: micSel.value } } : true
        });
        video.srcObject = stream;
        info.textContent = 'Preview active.';
      } catch (err) {
        ui.flash(err.message || 'Preview failed', 'error');
      }
    };
    document.getElementById('stop-preview').onclick = () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
      info.textContent = 'Preview stopped.';
    };
    document.getElementById('map-devices').onclick = async () => {
      try {
        const browserDevices = await navigator.mediaDevices.enumerateDevices();
        const cam = browserDevices.find(d => d.deviceId === camSel.value);
        const mic = browserDevices.find(d => d.deviceId === micSel.value);
        const [savedCam] = await db.upsertDevices([{ label: cam?.label || 'Camera', device_kind: 'camera', browser_device_id: camSel.value, status: 'active' }]);
        const [savedMic] = await db.upsertDevices([{ label: mic?.label || 'Microphone', device_kind: 'microphone', browser_device_id: micSel.value, status: 'active' }]);
        await db.update('rooms', roomSel.value, { assigned_camera_id: savedCam?.id || null, assigned_mic_id: savedMic?.id || null, status: 'live' });
        ui.flash('Devices mapped to room and room set live');
      } catch (err) {
        ui.flash(err.message || 'Failed to map devices', 'error');
      }
    };

    if (navigator.mediaDevices?.enumerateDevices) {
      try { await loadBrowserDevices(); } catch (_) {}
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch(err => {
      console.error(err);
      ui.setConnection(false, 'Error');
    });
  });
})();

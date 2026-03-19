(function () {
  const cfg = window.APP_CONFIG || {};
  const hasSupabase = typeof window.supabase !== 'undefined';
  const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && hasSupabase);
  const venueId = cfg.venueId || 'demo-venue-1';

  const mockKey = 'liveVenueControlMockData.v1';
  const nowIso = () => new Date().toISOString();

  const defaultMock = {
    rooms: [
      { id: crypto.randomUUID(), venue_id: venueId, name: 'Main Floor', zone: 'A', status: 'scheduled', capacity: 150, assigned_camera_id: null, assigned_mic_id: null, updated_at: nowIso(), created_at: nowIso() },
      { id: crypto.randomUUID(), venue_id: venueId, name: 'VIP Lounge', zone: 'B', status: 'scheduled', capacity: 40, assigned_camera_id: null, assigned_mic_id: null, updated_at: nowIso(), created_at: nowIso() }
    ],
    devices: [],
    schedules: [],
    patron_pulse: [],
    ops_notes: []
  };

  function readMock() {
    const raw = localStorage.getItem(mockKey);
    if (!raw) {
      localStorage.setItem(mockKey, JSON.stringify(defaultMock));
      return structuredClone(defaultMock);
    }
    try {
      return JSON.parse(raw);
    } catch {
      localStorage.setItem(mockKey, JSON.stringify(defaultMock));
      return structuredClone(defaultMock);
    }
  }

  function writeMock(data) {
    localStorage.setItem(mockKey, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('live:mock-update'));
  }

  const sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  function byVenue(items) {
    return items.filter(x => !x.venue_id || x.venue_id === venueId);
  }

  function sortByCreatedDesc(items) {
    return [...items].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  async function list(table, options = {}) {
    if (!configured) {
      let rows = byVenue(readMock()[table] || []);
      if (options.orderBy) {
        rows = [...rows].sort((a, b) => {
          const av = a[options.orderBy];
          const bv = b[options.orderBy];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return options.ascending === false ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
        });
      }
      return rows;
    }

    let query = sb.from(table).select(options.select || '*').eq('venue_id', venueId);
    if (options.orderBy) query = query.order(options.orderBy, { ascending: options.ascending !== false });
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function getById(table, id) {
    if (!configured) {
      return (readMock()[table] || []).find(x => x.id === id) || null;
    }
    const { data, error } = await sb.from(table).select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  async function insert(table, payload) {
    const clean = { ...payload, venue_id: payload.venue_id || venueId };
    if (!configured) {
      const data = readMock();
      const row = { id: crypto.randomUUID(), created_at: nowIso(), updated_at: nowIso(), ...clean };
      data[table].push(row);
      writeMock(data);
      return row;
    }
    const { data, error } = await sb.from(table).insert(clean).select().single();
    if (error) throw error;
    return data;
  }

  async function update(table, id, payload) {
    if (!configured) {
      const data = readMock();
      const idx = (data[table] || []).findIndex(x => x.id === id);
      if (idx === -1) throw new Error(`${table} record not found`);
      data[table][idx] = { ...data[table][idx], ...payload, updated_at: nowIso() };
      writeMock(data);
      return data[table][idx];
    }
    const { data, error } = await sb.from(table).update({ ...payload, updated_at: nowIso() }).eq('id', id).eq('venue_id', venueId).select().single();
    if (error) throw error;
    return data;
  }

  async function remove(table, id) {
    if (!configured) {
      const data = readMock();
      data[table] = (data[table] || []).filter(x => x.id !== id);
      writeMock(data);
      return true;
    }
    const { error } = await sb.from(table).delete().eq('id', id).eq('venue_id', venueId);
    if (error) throw error;
    return true;
  }

  async function upsertDevice(payload) {
    if (!configured) return insert('devices', payload);
    const { data, error } = await sb.from('devices').upsert({ ...payload, venue_id: venueId }, { onConflict: 'venue_id,browser_device_id' }).select().single();
    if (error) throw error;
    return data;
  }

  async function getDashboardData() {
    const [rooms, schedules, pulse, notes, devices] = await Promise.all([
      list('rooms', { orderBy: 'name' }),
      list('schedules', { orderBy: 'start_at' }),
      list('patron_pulse', { orderBy: 'created_at', ascending: false }),
      list('ops_notes', { orderBy: 'created_at', ascending: false }),
      list('devices', { orderBy: 'label' })
    ]);

    const liveRooms = rooms.filter(r => r.status === 'live').length;
    const upcoming = schedules.filter(s => new Date(s.start_at || 0) > new Date()).length;
    const avgPulse = pulse.length ? Math.round(pulse.reduce((sum, p) => sum + (Number(p.pulse_score) || 0), 0) / pulse.length) : 0;

    return {
      rooms,
      schedules,
      pulse,
      notes,
      devices,
      stats: {
        rooms: rooms.length,
        liveRooms,
        upcoming,
        devices: devices.length,
        avgPulse
      }
    };
  }

  function subscribe(table, callback) {
    if (!configured || cfg.realtime === false) {
      const handler = () => callback();
      window.addEventListener('live:mock-update', handler);
      return () => window.removeEventListener('live:mock-update', handler);
    }
    const channel = sb.channel(`live-${table}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
      .subscribe();
    return () => { try { sb.removeChannel(channel); } catch (_) {} };
  }

  function flash(message, type = 'success') {
    const host = document.getElementById('flash-host') || document.body;
    const div = document.createElement('div');
    div.className = `flash ${type}`;
    div.textContent = message;
    host.appendChild(div);
    setTimeout(() => div.remove(), 2500);
  }

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

  function optionHtml(v, label, selected) {
    return `<option value="${String(v ?? '').replace(/"/g, '&quot;')}" ${selected ? 'selected' : ''}>${label}</option>`;
  }

  function fmtDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  }

  async function bootDashboard() {
    const wrap = qs('[data-page="dashboard"]');
    if (!wrap) return;
    async function render() {
      try {
        const data = await getDashboardData();
        qs('[data-stat="rooms"]').textContent = data.stats.rooms;
        qs('[data-stat="liveRooms"]').textContent = data.stats.liveRooms;
        qs('[data-stat="upcoming"]').textContent = data.stats.upcoming;
        qs('[data-stat="devices"]').textContent = data.stats.devices;
        qs('[data-stat="avgPulse"]').textContent = `${data.stats.avgPulse}%`;

        qs('#live-rooms').innerHTML = data.rooms.map(r => `
          <tr>
            <td>${r.name || 'Unnamed'}</td>
            <td>${r.zone || '—'}</td>
            <td><span class="pill ${r.status || 'scheduled'}">${r.status || 'scheduled'}</span></td>
            <td>${r.capacity || 0}</td>
            <td>${fmtDate(r.updated_at)}</td>
          </tr>
        `).join('') || `<tr><td colspan="5">No rooms yet.</td></tr>`;

        qs('#upcoming-schedule').innerHTML = sortByCreatedDesc(data.schedules).slice(0, 8).map(s => `
          <tr>
            <td>${s.title || 'Untitled'}</td>
            <td>${roomName(data.rooms, s.room_id)}</td>
            <td>${fmtDate(s.start_at)}</td>
            <td>${fmtDate(s.end_at)}</td>
            <td>${s.lead_name || '—'}</td>
          </tr>
        `).join('') || `<tr><td colspan="5">No schedule entries.</td></tr>`;

        qs('#recent-pulse').innerHTML = sortByCreatedDesc(data.pulse).slice(0, 8).map(p => `
          <tr>
            <td>${roomName(data.rooms, p.room_id)}</td>
            <td>${p.pulse_score}</td>
            <td>${p.crowd_count}</td>
            <td>${p.energy_level}</td>
            <td>${fmtDate(p.created_at)}</td>
          </tr>
        `).join('') || `<tr><td colspan="5">No pulse data yet.</td></tr>`;

        qs('#recent-notes').innerHTML = sortByCreatedDesc(data.notes).slice(0, 8).map(n => `
          <tr>
            <td>${n.title}</td>
            <td>${roomName(data.rooms, n.room_id)}</td>
            <td><span class="pill ${n.priority}">${n.priority}</span></td>
            <td><span class="pill ${n.status}">${n.status}</span></td>
            <td>${fmtDate(n.created_at)}</td>
          </tr>
        `).join('') || `<tr><td colspan="5">No ops notes.</td></tr>`;
      } catch (err) {
        console.error(err);
        flash(err.message || 'Failed to load dashboard', 'error');
      }
    }
    await render();
    const unsubs = ['rooms','schedules','patron_pulse','ops_notes','devices'].map(t => subscribe(t, render));
    window.addEventListener('beforeunload', () => unsubs.forEach(fn => fn && fn()));
  }

  function roomName(rooms, id) {
    return rooms.find(r => r.id === id)?.name || '—';
  }

  async function bootRooms() {
    const wrap = qs('[data-page="rooms"]');
    if (!wrap) return;
    const form = qs('#room-form');
    const table = qs('#rooms-table');
    const cameraSel = qs('#assigned_camera_id');
    const micSel = qs('#assigned_mic_id');
    let editingId = null;

    async function render() {
      const [rooms, devices] = await Promise.all([
        list('rooms', { orderBy: 'name' }),
        list('devices', { orderBy: 'label' })
      ]);
      const cameras = devices.filter(d => d.device_kind === 'camera');
      const mics = devices.filter(d => d.device_kind === 'microphone');

      cameraSel.innerHTML = optionHtml('', 'Unassigned', true) + cameras.map(d => optionHtml(d.id, d.label || d.browser_device_id, false)).join('');
      micSel.innerHTML = optionHtml('', 'Unassigned', true) + mics.map(d => optionHtml(d.id, d.label || d.browser_device_id, false)).join('');

      table.innerHTML = rooms.map(r => `
        <tr>
          <td>${r.name || 'Unnamed'}</td>
          <td>${r.zone || '—'}</td>
          <td>${r.capacity || 0}</td>
          <td><span class="pill ${r.status || 'scheduled'}">${r.status || 'scheduled'}</span></td>
          <td>${devices.find(d => d.id === r.assigned_camera_id)?.label || '—'}</td>
          <td>${devices.find(d => d.id === r.assigned_mic_id)?.label || '—'}</td>
          <td class="actions">
            <button data-edit="${r.id}">Edit</button>
            <button data-live="${r.id}">Live</button>
            <button data-complete="${r.id}">Complete</button>
            <button class="danger" data-delete="${r.id}">Delete</button>
          </td>
        </tr>
      `).join('') || `<tr><td colspan="7">No rooms found.</td></tr>`;

      qsa('[data-edit]', table).forEach(btn => btn.onclick = async () => {
        const room = await getById('rooms', btn.dataset.edit);
        editingId = room.id;
        form.name.value = room.name || '';
        form.zone.value = room.zone || '';
        form.capacity.value = room.capacity || 0;
        form.status.value = room.status || 'scheduled';
        form.assigned_camera_id.value = room.assigned_camera_id || '';
        form.assigned_mic_id.value = room.assigned_mic_id || '';
        qs('#room-form-title').textContent = 'Edit Room';
      });
      qsa('[data-live]', table).forEach(btn => btn.onclick = async () => { await update('rooms', btn.dataset.live, { status: 'live' }); flash('Room set live'); await render(); });
      qsa('[data-complete]', table).forEach(btn => btn.onclick = async () => { await update('rooms', btn.dataset.complete, { status: 'completed' }); flash('Room marked complete'); await render(); });
      qsa('[data-delete]', table).forEach(btn => btn.onclick = async () => { if (confirm('Delete this room?')) { await remove('rooms', btn.dataset.delete); flash('Room deleted'); await render(); } });
    }

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
        if (editingId) {
          await update('rooms', editingId, payload);
          flash('Room updated');
        } else {
          await insert('rooms', payload);
          flash('Room created');
        }
        editingId = null;
        form.reset();
        form.status.value = 'scheduled';
        qs('#room-form-title').textContent = 'Add Room';
        await render();
      } catch (err) {
        console.error(err);
        flash(err.message || 'Failed to save room', 'error');
      }
    });

    qs('#room-form-reset').onclick = () => { editingId = null; form.reset(); form.status.value = 'scheduled'; qs('#room-form-title').textContent = 'Add Room'; };

    await render();
    const unsubs = ['rooms','devices'].map(t => subscribe(t, render));
    window.addEventListener('beforeunload', () => unsubs.forEach(fn => fn && fn()));
  }

  async function bootScheduling() {
    const wrap = qs('[data-page="scheduling"]');
    if (!wrap) return;
    const form = qs('#schedule-form');
    const table = qs('#schedule-table');
    const roomSelect = qs('#schedule-room-id');
    let editingId = null;

    async function render() {
      const [rooms, schedules] = await Promise.all([
        list('rooms', { orderBy: 'name' }),
        list('schedules', { orderBy: 'start_at' })
      ]);
      roomSelect.innerHTML = rooms.map(r => optionHtml(r.id, r.name || 'Unnamed', false)).join('');
      table.innerHTML = schedules.map(s => `
        <tr>
          <td>${s.title || 'Untitled'}</td>
          <td>${roomName(rooms, s.room_id)}</td>
          <td>${fmtDate(s.start_at)}</td>
          <td>${fmtDate(s.end_at)}</td>
          <td>${s.lead_name || '—'}</td>
          <td><span class="pill ${s.status || 'scheduled'}">${s.status || 'scheduled'}</span></td>
          <td class="actions">
            <button data-edit="${s.id}">Edit</button>
            <button class="danger" data-delete="${s.id}">Delete</button>
          </td>
        </tr>
      `).join('') || `<tr><td colspan="7">No schedules found.</td></tr>`;

      qsa('[data-edit]', table).forEach(btn => btn.onclick = async () => {
        const s = await getById('schedules', btn.dataset.edit);
        editingId = s.id;
        form.title.value = s.title || '';
        form.room_id.value = s.room_id || '';
        form.start_at.value = toLocalInput(s.start_at);
        form.end_at.value = toLocalInput(s.end_at);
        form.lead_name.value = s.lead_name || '';
        form.status.value = s.status || 'scheduled';
        qs('#schedule-form-title').textContent = 'Edit Schedule';
      });
      qsa('[data-delete]', table).forEach(btn => btn.onclick = async () => { if (confirm('Delete this schedule?')) { await remove('schedules', btn.dataset.delete); flash('Schedule deleted'); await render(); } });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        title: form.title.value.trim(),
        room_id: form.room_id.value || null,
        start_at: new Date(form.start_at.value).toISOString(),
        end_at: form.end_at.value ? new Date(form.end_at.value).toISOString() : null,
        lead_name: form.lead_name.value.trim() || null,
        status: form.status.value
      };
      try {
        if (editingId) {
          await update('schedules', editingId, payload);
          flash('Schedule updated');
        } else {
          await insert('schedules', payload);
          flash('Schedule created');
        }
        editingId = null;
        form.reset();
        form.status.value = 'scheduled';
        qs('#schedule-form-title').textContent = 'Add Schedule';
        await render();
      } catch (err) {
        console.error(err);
        flash(err.message || 'Failed to save schedule', 'error');
      }
    });

    qs('#schedule-form-reset').onclick = () => { editingId = null; form.reset(); form.status.value = 'scheduled'; qs('#schedule-form-title').textContent = 'Add Schedule'; };

    await render();
    const unsubs = ['schedules','rooms'].map(t => subscribe(t, render));
    window.addEventListener('beforeunload', () => unsubs.forEach(fn => fn && fn()));
  }

  function toLocalInput(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function bootPulse() {
    const wrap = qs('[data-page="pulse"]');
    if (!wrap) return;
    const form = qs('#pulse-form');
    const table = qs('#pulse-table');
    const roomSelect = qs('#pulse-room-id');

    async function render() {
      const [rooms, pulse] = await Promise.all([
        list('rooms', { orderBy: 'name' }),
        list('patron_pulse', { orderBy: 'created_at', ascending: false })
      ]);
      roomSelect.innerHTML = rooms.map(r => optionHtml(r.id, r.name || 'Unnamed', false)).join('');
      table.innerHTML = pulse.map(p => `
        <tr>
          <td>${roomName(rooms, p.room_id)}</td>
          <td>${p.pulse_score}</td>
          <td>${p.crowd_count}</td>
          <td>${p.energy_level}</td>
          <td>${p.source || 'manual'}</td>
          <td>${p.notes || '—'}</td>
          <td>${fmtDate(p.created_at)}</td>
        </tr>
      `).join('') || `<tr><td colspan="7">No pulse entries yet.</td></tr>`;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await insert('patron_pulse', {
          room_id: form.room_id.value || null,
          pulse_score: Number(form.pulse_score.value || 0),
          crowd_count: Number(form.crowd_count.value || 0),
          energy_level: Number(form.energy_level.value || 1),
          source: form.source.value || 'manual',
          notes: form.notes.value.trim() || null
        });
        flash('Pulse submitted');
        form.reset();
        form.energy_level.value = 5;
        await render();
      } catch (err) {
        console.error(err);
        flash(err.message || 'Failed to save pulse', 'error');
      }
    });

    await render();
    const unsubs = ['patron_pulse','rooms'].map(t => subscribe(t, render));
    window.addEventListener('beforeunload', () => unsubs.forEach(fn => fn && fn()));
  }

  async function bootOps() {
    const wrap = qs('[data-page="ops"]');
    if (!wrap) return;
    const form = qs('#ops-form');
    const table = qs('#ops-table');
    const roomSelect = qs('#ops-room-id');
    let editingId = null;

    async function render() {
      const [rooms, notes] = await Promise.all([
        list('rooms', { orderBy: 'name' }),
        list('ops_notes', { orderBy: 'created_at', ascending: false })
      ]);
      roomSelect.innerHTML = optionHtml('', 'General Venue', true) + rooms.map(r => optionHtml(r.id, r.name || 'Unnamed', false)).join('');
      table.innerHTML = notes.map(n => `
        <tr>
          <td>${n.title}</td>
          <td>${roomName(rooms, n.room_id)}</td>
          <td><span class="pill ${n.priority}">${n.priority}</span></td>
          <td><span class="pill ${n.status}">${n.status}</span></td>
          <td>${n.assigned_to || '—'}</td>
          <td>${n.note || '—'}</td>
          <td>${fmtDate(n.created_at)}</td>
          <td class="actions">
            <button data-edit="${n.id}">Edit</button>
            <button data-status="${n.id}" data-next="${n.status === 'closed' ? 'open' : 'closed'}">${n.status === 'closed' ? 'Reopen' : 'Close'}</button>
            <button class="danger" data-delete="${n.id}">Delete</button>
          </td>
        </tr>
      `).join('') || `<tr><td colspan="8">No ops notes yet.</td></tr>`;

      qsa('[data-edit]', table).forEach(btn => btn.onclick = async () => {
        const n = await getById('ops_notes', btn.dataset.edit);
        editingId = n.id;
        form.title.value = n.title || '';
        form.room_id.value = n.room_id || '';
        form.priority.value = n.priority || 'medium';
        form.status.value = n.status || 'open';
        form.assigned_to.value = n.assigned_to || '';
        form.note.value = n.note || '';
        qs('#ops-form-title').textContent = 'Edit Ops Note';
      });
      qsa('[data-status]', table).forEach(btn => btn.onclick = async () => { await update('ops_notes', btn.dataset.status, { status: btn.dataset.next }); flash('Ops note updated'); await render(); });
      qsa('[data-delete]', table).forEach(btn => btn.onclick = async () => { if (confirm('Delete this note?')) { await remove('ops_notes', btn.dataset.delete); flash('Ops note deleted'); await render(); } });
    }

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
      try {
        if (editingId) {
          await update('ops_notes', editingId, payload);
          flash('Ops note updated');
        } else {
          await insert('ops_notes', payload);
          flash('Ops note created');
        }
        editingId = null;
        form.reset();
        form.priority.value = 'medium';
        form.status.value = 'open';
        qs('#ops-form-title').textContent = 'Add Ops Note';
        await render();
      } catch (err) {
        console.error(err);
        flash(err.message || 'Failed to save ops note', 'error');
      }
    });

    qs('#ops-form-reset').onclick = () => { editingId = null; form.reset(); form.priority.value = 'medium'; form.status.value = 'open'; qs('#ops-form-title').textContent = 'Add Ops Note'; };

    await render();
    const unsubs = ['ops_notes','rooms'].map(t => subscribe(t, render));
    window.addEventListener('beforeunload', () => unsubs.forEach(fn => fn && fn()));
  }

  async function bootDeviceSettings() {
    const wrap = qs('[data-page="devices"]');
    if (!wrap) return;
    const form = qs('#device-form');
    const table = qs('#devices-table');
    let editingId = null;

    async function render() {
      const devices = await list('devices', { orderBy: 'label' });
      table.innerHTML = devices.map(d => `
        <tr>
          <td>${d.label || 'Unnamed Device'}</td>
          <td>${d.device_kind || '—'}</td>
          <td>${d.browser_device_id || '—'}</td>
          <td><span class="pill ${d.status || 'active'}">${d.status || 'active'}</span></td>
          <td>${fmtDate(d.updated_at || d.created_at)}</td>
          <td class="actions">
            <button data-edit="${d.id}">Edit</button>
            <button class="danger" data-delete="${d.id}">Delete</button>
          </td>
        </tr>
      `).join('') || `<tr><td colspan="6">No devices yet.</td></tr>`;
      qsa('[data-edit]', table).forEach(btn => btn.onclick = async () => {
        const d = await getById('devices', btn.dataset.edit);
        editingId = d.id;
        form.label.value = d.label || '';
        form.device_kind.value = d.device_kind || 'camera';
        form.browser_device_id.value = d.browser_device_id || '';
        form.status.value = d.status || 'active';
        qs('#device-form-title').textContent = 'Edit Device';
      });
      qsa('[data-delete]', table).forEach(btn => btn.onclick = async () => { if (confirm('Delete this device?')) { await remove('devices', btn.dataset.delete); flash('Device deleted'); await render(); } });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        label: form.label.value.trim(),
        device_kind: form.device_kind.value,
        browser_device_id: form.browser_device_id.value.trim() || null,
        status: form.status.value
      };
      try {
        if (editingId) {
          await update('devices', editingId, payload);
          flash('Device updated');
        } else {
          await insert('devices', payload);
          flash('Device created');
        }
        editingId = null;
        form.reset();
        form.device_kind.value = 'camera';
        form.status.value = 'active';
        qs('#device-form-title').textContent = 'Add Device';
        await render();
      } catch (err) {
        console.error(err);
        flash(err.message || 'Failed to save device', 'error');
      }
    });

    qs('#scan-browser-devices').onclick = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const filtered = devices.filter(d => d.kind === 'videoinput' || d.kind === 'audioinput');
        for (const d of filtered) {
          await upsertDevice({
            label: d.label || (d.kind === 'videoinput' ? 'Browser Camera' : 'Browser Mic'),
            device_kind: d.kind === 'videoinput' ? 'camera' : 'microphone',
            browser_device_id: d.deviceId,
            status: 'active'
          });
        }
        flash('Browser devices scanned and saved');
        await render();
      } catch (err) {
        console.error(err);
        flash('Unable to scan browser devices. Allow camera/mic permission first.', 'error');
      }
    };

    qs('#device-form-reset').onclick = () => { editingId = null; form.reset(); form.device_kind.value = 'camera'; form.status.value = 'active'; qs('#device-form-title').textContent = 'Add Device'; };

    await render();
    const unsubs = ['devices'].map(t => subscribe(t, render));
    window.addEventListener('beforeunload', () => unsubs.forEach(fn => fn && fn()));
  }

  async function bootLocalControls() {
    const wrap = qs('[data-page="local-controls"]');
    if (!wrap) return;
    const cameraSelect = qs('#local-camera-device');
    const micSelect = qs('#local-mic-device');
    const roomSelect = qs('#local-room-id');
    const video = qs('#local-video');
    const streamInfo = qs('#stream-info');
    let currentStream = null;

    async function render() {
      const [rooms, devices] = await Promise.all([
        list('rooms', { orderBy: 'name' }),
        list('devices', { orderBy: 'label' })
      ]);
      roomSelect.innerHTML = rooms.map(r => optionHtml(r.id, r.name || 'Unnamed', false)).join('');
      const cameras = devices.filter(d => d.device_kind === 'camera');
      const mics = devices.filter(d => d.device_kind === 'microphone');
      cameraSelect.innerHTML = cameras.map(d => optionHtml(d.browser_device_id || d.id, d.label || d.browser_device_id, false)).join('');
      micSelect.innerHTML = mics.map(d => optionHtml(d.browser_device_id || d.id, d.label || d.browser_device_id, false)).join('');
      qs('#local-map-table').innerHTML = rooms.map(r => `
        <tr>
          <td>${r.name || 'Unnamed'}</td>
          <td>${devices.find(d => d.id === r.assigned_camera_id)?.label || '—'}</td>
          <td>${devices.find(d => d.id === r.assigned_mic_id)?.label || '—'}</td>
          <td><span class="pill ${r.status || 'scheduled'}">${r.status || 'scheduled'}</span></td>
        </tr>
      `).join('') || `<tr><td colspan="4">No rooms found.</td></tr>`;
    }

    async function startPreview() {
      try {
        if (currentStream) currentStream.getTracks().forEach(t => t.stop());
        const constraints = {
          video: cameraSelect.value ? { deviceId: { exact: cameraSelect.value } } : true,
          audio: micSelect.value ? { deviceId: { exact: micSelect.value } } : true
        };
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        streamInfo.textContent = `Preview live • ${currentStream.getTracks().map(t => t.label || t.kind).join(' | ')}`;
      } catch (err) {
        console.error(err);
        streamInfo.textContent = 'Unable to start preview.';
        flash('Could not start preview. Check HTTPS, permissions, and selected devices.', 'error');
      }
    }

    qs('#request-media').onclick = async () => {
      try {
        const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        temp.getTracks().forEach(t => t.stop());
        const browserDevices = await navigator.mediaDevices.enumerateDevices();
        for (const d of browserDevices.filter(x => x.kind === 'videoinput' || x.kind === 'audioinput')) {
          await upsertDevice({
            label: d.label || (d.kind === 'videoinput' ? 'Browser Camera' : 'Browser Mic'),
            device_kind: d.kind === 'videoinput' ? 'camera' : 'microphone',
            browser_device_id: d.deviceId,
            status: 'active'
          });
        }
        flash('Media permission granted and devices synced');
        await render();
      } catch (err) {
        console.error(err);
        flash('Permission denied or unavailable.', 'error');
      }
    };

    qs('#start-preview').onclick = startPreview;
    qs('#stop-preview').onclick = () => {
      if (currentStream) currentStream.getTracks().forEach(t => t.stop());
      currentStream = null;
      video.srcObject = null;
      streamInfo.textContent = 'Preview stopped.';
    };
    qs('#map-devices').onclick = async () => {
      try {
        const [rooms, devices] = await Promise.all([list('rooms'), list('devices')]);
        const room = rooms.find(r => r.id === roomSelect.value);
        const camera = devices.find(d => (d.browser_device_id || d.id) === cameraSelect.value && d.device_kind === 'camera');
        const mic = devices.find(d => (d.browser_device_id || d.id) === micSelect.value && d.device_kind === 'microphone');
        if (!room) throw new Error('Please select a room.');
        await update('rooms', room.id, {
          assigned_camera_id: camera?.id || null,
          assigned_mic_id: mic?.id || null,
          status: 'live'
        });
        flash('Devices mapped to room and room set live');
        await render();
      } catch (err) {
        console.error(err);
        flash(err.message || 'Failed to map devices', 'error');
      }
    };

    await render();
    const unsubs = ['rooms','devices'].map(t => subscribe(t, render));
    window.addEventListener('beforeunload', () => {
      unsubs.forEach(fn => fn && fn());
      if (currentStream) currentStream.getTracks().forEach(t => t.stop());
    });
  }

  function setStatus() {
    const el = qs('#connection-state');
    if (!el) return;
    el.textContent = configured ? 'Supabase connected' : 'Mock mode';
    el.className = `connection ${configured ? 'online' : 'offline'}`;
    const venue = qs('#venue-badge');
    if (venue) venue.textContent = venueId;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    setStatus();
    await Promise.all([
      bootDashboard(),
      bootRooms(),
      bootScheduling(),
      bootPulse(),
      bootOps(),
      bootDeviceSettings(),
      bootLocalControls()
    ]);
  });

  window.LiveApp = {
    configured,
    venueId,
    sb,
    list,
    getById,
    insert,
    update,
    remove,
    subscribe,
    upsertDevice,
    flash,
    fmtDate
  };
})();

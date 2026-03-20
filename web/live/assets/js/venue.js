(function () {
  const db = window.LINKDN_CONFIG;
  const ui = window.LinkdNUI;
  const auth = window.LinkdNV2Auth;
  let cached = { rooms: [], devices: [], schedules: [], notes: [], pulse: [] };

  async function refresh() {
    cached = await ui.loadReferenceData();
    const page = document.body.dataset.page;
    if (page === 'venue-dashboard') renderDashboard();
    if (page === 'venue-rooms') renderRooms();
    if (page === 'venue-schedule') renderSchedule();
    if (page === 'venue-pulse') renderPulse();
    if (page === 'venue-wallboard') renderWallboard();
  }

  async function boot() {
    if (!db.cfg.allowVenuePublicRead) {
      await auth.requireRole(db.cfg.venueRoles);
      await auth.bootProtectedShell();
    } else {
      ui.fillShell();
    }
    ui.setConnection(true, 'Connected');
    await refresh();
    ['rooms','devices','schedules','ops_notes','patron_pulse'].forEach(t => db.subscribe(t, refresh));
  }

  function renderDashboard() {
    const now = Date.now();
    document.querySelector('[data-stat="rooms"]').textContent = cached.rooms.length;
    document.querySelector('[data-stat="live"]').textContent = cached.rooms.filter(r => r.status === 'live').length;
    document.querySelector('[data-stat="upcoming"]').textContent = cached.schedules.filter(s => new Date(s.start_at || 0).getTime() >= now).length;
    document.querySelector('[data-stat="avgPulse"]').textContent = `${cached.pulse.length ? Math.round(cached.pulse.reduce((a,b)=>a+Number(b.pulse_score||0),0)/cached.pulse.length) : 0}%`;

    document.getElementById('venue-room-grid').innerHTML = cached.rooms.map(r => `<article class="mini-card"><h3>${ui.esc(r.name)}</h3><div class="helper">Zone ${ui.esc(r.zone || '—')}</div><div class="pill ${ui.esc(r.status)}">${ui.esc(r.status)}</div><div class="helper">Capacity ${ui.esc(r.capacity)}</div></article>`).join('') || `<p>No rooms found.</p>`;
    document.getElementById('venue-schedule-list').innerHTML = cached.schedules.slice(0, 8).map(s => `<tr><td>${ui.esc(s.title)}</td><td>${ui.esc(ui.roomName(cached.rooms, s.room_id))}</td><td>${ui.fmtDate(s.start_at)}</td><td>${ui.fmtDate(s.end_at)}</td></tr>`).join('') || `<tr><td colspan="4">No schedule blocks found.</td></tr>`;
    document.getElementById('venue-note-list').innerHTML = cached.notes.filter(n => n.status !== 'closed').slice(0,6).map(n => `<tr><td>${ui.esc(n.title)}</td><td>${ui.esc(n.priority)}</td><td>${ui.esc(n.status)}</td></tr>`).join('') || `<tr><td colspan="3">No open ops notes.</td></tr>`;
  }

  function renderRooms() {
    document.getElementById('venue-rooms-table').innerHTML = cached.rooms.map(r => `<tr><td>${ui.esc(r.name)}</td><td>${ui.esc(r.zone || '—')}</td><td>${ui.esc(r.capacity)}</td><td>${ui.esc(r.status)}</td><td>${ui.esc(cached.devices.find(d => d.id === r.assigned_camera_id)?.label || '—')}</td><td>${ui.esc(cached.devices.find(d => d.id === r.assigned_mic_id)?.label || '—')}</td></tr>`).join('') || `<tr><td colspan="6">No rooms found.</td></tr>`;
  }

  function renderSchedule() {
    document.getElementById('venue-schedule-table').innerHTML = cached.schedules.map(s => `<tr><td>${ui.esc(s.title)}</td><td>${ui.esc(ui.roomName(cached.rooms, s.room_id))}</td><td>${ui.fmtDate(s.start_at)}</td><td>${ui.fmtDate(s.end_at)}</td><td>${ui.esc(s.lead_name || '—')}</td><td>${ui.esc(s.status)}</td></tr>`).join('') || `<tr><td colspan="6">No schedule blocks found.</td></tr>`;
  }

  function renderPulse() {
    document.getElementById('venue-pulse-table').innerHTML = cached.pulse.map(p => `<tr><td>${ui.esc(ui.roomName(cached.rooms, p.room_id))}</td><td>${ui.esc(p.pulse_score)}</td><td>${ui.esc(p.crowd_count)}</td><td>${ui.esc(p.energy_level)}</td><td>${ui.esc(p.source)}</td><td>${ui.fmtDate(p.created_at)}</td></tr>`).join('') || `<tr><td colspan="6">No pulse entries found.</td></tr>`;
  }

  function renderWallboard() {
    const liveRooms = cached.rooms.filter(r => r.status === 'live');
    document.getElementById('wallboard-live-count').textContent = liveRooms.length;
    document.getElementById('wallboard-pulse').textContent = `${cached.pulse.length ? Math.round(cached.pulse.reduce((a,b)=>a+Number(b.pulse_score||0),0)/cached.pulse.length) : 0}%`;
    document.getElementById('wallboard-grid').innerHTML = liveRooms.map(r => `<article class="wall-card"><h2>${ui.esc(r.name)}</h2><p>Zone ${ui.esc(r.zone || '—')}</p><div class="wall-status">${ui.esc(r.status)}</div><p>Camera: ${ui.esc(cached.devices.find(d => d.id === r.assigned_camera_id)?.label || '—')}</p><p>Mic: ${ui.esc(cached.devices.find(d => d.id === r.assigned_mic_id)?.label || '—')}</p></article>`).join('') || `<div class="wall-empty">No rooms are currently live.</div>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch(err => {
      console.error(err);
      ui.flash(err.message || 'Venue page failed to load', 'error');
    });
  });
})();

window.LinkdNUI = {
  topbar(title, nav='') {
    return `<div class="topbar"><div><div class="brand">Linkd'N</div><div class="small">${title}</div></div><div class="app-nav">${nav}</div></div>`;
  },
  ownerNav() {
    return `
      <a href="/owner/dashboard.html">Dashboard</a>
      <a href="/owner/profile.html">Profile</a>
      <a href="/owner/venues.html">Venues</a>
      <a href="/owner/workers.html">Workers</a>
      <a href="/owner/billing.html">Billing</a>
      <a href="/owner/messaging.html">Messaging</a>
      <a href="/auth/login.html" id="logoutLink">Logout</a>`;
  },
  adminNav() {
    return `
      <a href="/admin/dashboard.html">Dashboard</a>
      <a href="/admin/venues.html">Venues</a>
      <a href="/admin/owners.html">Owners</a>
      <a href="/admin/workers.html">Workers</a>
      <a href="/admin/billing.html">Billing</a>
      <a href="/admin/metrics.html">Metrics</a>
      <a href="/auth/login.html" id="logoutLink">Logout</a>`;
  },
  venueNav() {
    return `
      <a href="/venue/dashboard.html">Venue Dashboard</a>
      <a href="/venue/settings.html">Settings</a>
      <a href="/venue/workers.html">Workers</a>
      <a href="/venue/metrics.html">Metrics</a>
      <a href="/venue/device-setup.html">Device Setup</a>
      <a href="/venue/local-controls.html">Local Controls</a>`;
  },
  bindLogout(handler) {
    document.querySelectorAll('#logoutLink').forEach(el => el.addEventListener('click', async (e) => {
      e.preventDefault();
      await handler();
      location.href = '/auth/login.html';
    }));
  }
  
};
window.LiveUI = window.LiveUI || {};

(function () {
  function flash(message, type = 'info') {
    let box = document.getElementById('live-flash');

    if (!box) {
      box = document.createElement('div');
      box.id = 'live-flash';
      box.style.position = 'fixed';
      box.style.top = '20px';
      box.style.right = '20px';
      box.style.zIndex = '9999';
      box.style.padding = '12px 16px';
      box.style.borderRadius = '8px';
      box.style.background = '#1f2937';
      box.style.color = '#fff';
      box.style.boxShadow = '0 8px 24px rgba(0,0,0,.25)';
      document.body.appendChild(box);
    }

    box.textContent = message;
    box.style.display = 'block';
    box.style.background = type === 'error' ? '#7f1d1d' : '#1f2937';

    clearTimeout(box._timer);
    box._timer = setTimeout(() => {
      box.style.display = 'none';
    }, 3000);
  }

  function setConnection(isConnected, label) {
    const el = document.querySelector('[data-connection-status], #connection-state');
    if (!el) return;

    el.textContent = label || (isConnected ? 'Connected' : 'Disconnected');
    el.dataset.state = isConnected ? 'connected' : 'disconnected';
    el.classList.toggle('offline', !isConnected);
    el.classList.toggle('online', !!isConnected);
  }

  function fillShell() {}

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, s => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[s]));
  }

  function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  function roomName(rooms, id) {
    return rooms.find(r => r.id === id)?.name || '—';
  }

  function option(value, label, selected = false) {
    const safeValue = esc(value ?? '');
    const safeLabel = esc(label ?? '');
    return `<option value="${safeValue}"${selected ? ' selected' : ''}>${safeLabel}</option>`;
  }

  async function loadReferenceData() {
    const db = window.LiveDB;
    const venueId = db.cfg.venueId;

    const [rooms, devices, schedules, notes, pulse] = await Promise.all([
      db.client.from('rooms').select('*').eq('venue_id', venueId),
      db.client.from('devices').select('*').eq('venue_id', venueId),
      db.client.from('schedules').select('*').eq('venue_id', venueId),
      db.client.from('ops_notes').select('*').eq('venue_id', venueId),
      db.client.from('patron_pulse').select('*').eq('venue_id', venueId)
    ]);

    [rooms, devices, schedules, notes, pulse].forEach(r => {
      if (r.error) throw r.error;
    });

    return {
      rooms: rooms.data || [],
      devices: devices.data || [],
      schedules: schedules.data || [],
      notes: notes.data || [],
      pulse: pulse.data || []
    };
  }

  Object.assign(window.LiveUI, {
    flash,
    setConnection,
    fillShell,
    esc,
    fmtDate,
    roomName,
    option,
    loadReferenceData
  });

  console.log('LiveUI initialized:', Object.keys(window.LiveUI));
})();
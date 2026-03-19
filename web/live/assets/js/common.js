(function () {
  const cfg = (window.LiveDB && window.LiveDB.cfg) || window.APP_CONFIG || {};

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }
  function esc(v) {
    return String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
  function fmtDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString([], { timeZone: cfg.timezone || undefined });
  }
  function flash(message, type = 'success') {
    const host = qs('#flash-host') || document.body;
    const el = document.createElement('div');
    el.className = `flash ${type}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
  function setConnection(ok, text) {
    const node = qs('#connection-state');
    if (!node) return;
    node.className = `connection ${ok ? 'online' : 'offline'}`;
    node.textContent = text || (ok ? 'Connected' : 'Disconnected');
  }
  function fillShell() {
    qsa('[data-venue-name]').forEach(n => n.textContent = cfg.venueName || cfg.venueId || 'Venue');
    qsa('[data-venue-id]').forEach(n => n.textContent = cfg.venueId || '—');
    qsa('[data-app-name]').forEach(n => n.textContent = cfg.appName || 'Live Venue Control');
  }
  function formObject(form) {
    return Object.fromEntries(new FormData(form).entries());
  }
  function roomName(rooms, id) {
    return rooms.find(r => r.id === id)?.name || '—';
  }
  function option(value, label, selected = false) {
    return `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
  }
  async function loadReferenceData() {
    const db = window.LiveDB;
    const [rooms, devices, schedules, notes, pulse] = await Promise.all([
      db.list('rooms', { orderBy: 'name' }),
      db.list('devices', { orderBy: 'label' }),
      db.list('schedules', { orderBy: 'start_at' }),
      db.list('ops_notes', { orderBy: 'created_at', ascending: false }),
      db.list('patron_pulse', { orderBy: 'created_at', ascending: false, limit: 100 })
    ]);
    return { rooms, devices, schedules, notes, pulse };
  }
  window.LiveUI = { qs, qsa, esc, fmtDate, flash, setConnection, fillShell, formObject, roomName, option, loadReferenceData };
})();

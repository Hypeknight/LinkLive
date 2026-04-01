(function () {
  const U = {
    esc(v) {
      return String(v ?? '').replace(/[&<>"']/g, s => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[s]));
    },
    fmt(v) {
      if (window.LiveUI?.fmtDate) return window.LiveUI.fmtDate(v);
      if (!v) return '—';
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
    },
    nowIso() {
      return new Date().toISOString();
    },
    qs() {
      return new URLSearchParams(window.location.search);
    },
    randomToken(prefix = 'tok') {
      return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    },
    byId(id) {
      return document.getElementById(id);
    },
    option(value, label, selected = false) {
      if (window.LiveUI?.option) return window.LiveUI.option(value, label, selected);
      return `<option value="${U.esc(value)}"${selected ? ' selected' : ''}>${U.esc(label)}</option>`;
    },
    setText(id, value) {
      const el = U.byId(id);
      if (el) el.textContent = value;
    },
    setHtml(id, value) {
      const el = U.byId(id);
      if (el) el.innerHTML = value;
    },
    flash(message, type = 'info') {
      if (window.LiveUI?.flash) return window.LiveUI.flash(message, type);
      console[type === 'error' ? 'error' : 'log'](message);
    },
    serviceBoundaryMs(resetTime = '08:30:00') {
      const now = new Date();
      const [h, m, s] = String(resetTime).split(':').map(n => Number(n || 0));
      const boundary = new Date(now);
      boundary.setHours(h, m, s || 0, 0);
      if (now.getTime() < boundary.getTime()) boundary.setDate(boundary.getDate() - 1);
      return boundary.getTime();
    },
    formatCountdown(seconds) {
      const total = Math.max(0, Number(seconds || 0));
      const mins = Math.floor(total / 60);
      const secs = total % 60;
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  };

  window.LinkdNV2Utils = U;
})();

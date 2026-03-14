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

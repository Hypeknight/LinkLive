window.LinkdNNav = {
  owner() {
    return `
      <nav class="app-nav">
        <a href="/owner/dashboard.html">Dashboard</a>
        <a href="/owner/profile.html">Profile</a>
        <a href="/owner/venues.html">Venues</a>
        <a href="/owner/workers.html">Workers</a>
        <a href="/owner/billing.html">Billing</a>
        <a href="/owner/messaging.html">Messaging</a>
      </nav>
    `;
  },

  admin() {
    return `
      <nav class="app-nav">
        <a href="/admin/dashboard.html">Dashboard</a>
        <a href="/admin/owners.html">Owners</a>
        <a href="/admin/venues.html">Venues</a>
        <a href="/admin/workers.html">Workers</a>
        <a href="/admin/billing.html">Billing</a>
        <a href="/admin/metrics.html">Metrics</a>
      </nav>
    `;
  },

  venue() {
    return `
      <nav class="app-nav">
        <a href="/venue/dashboard.html">Dashboard</a>
        <a href="/venue/settings.html">Settings</a>
        <a href="/venue/device-setup.html">Device Setup</a>
        <a href="/venue/local-controls.html">Local Controls</a>
      </nav>
    `;
  }
};
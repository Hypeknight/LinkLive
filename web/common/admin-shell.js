window.LinkdNAdminShell = {
  render(pageTitle, bodyHtml) {
    return `
      <div class="page-wrap">
        <div id="menu"></div>
        <div class="form-card">
          <div class="top-actions">
            <div>
              <h2 style="margin:0;">${pageTitle}</h2>
              <p id="pageStatus" class="notice" style="margin-top:12px;">Loading...</p>
            </div>
          </div>
        </div>
        ${bodyHtml}
      </div>
    `;
  },

  nav() {
    if (window.LinkdNNav && typeof window.LinkdNNav.admin === "function") {
      return window.LinkdNNav.admin();
    }
    return `
      <nav class="app-nav">
        <a href="/admin/dashboard.html">Dashboard</a>
        <a href="/admin/owners.html">Owners</a>
        <a href="/admin/venues.html">Venues</a>
        <a href="/admin/workers.html">Workers</a>
        <a href="/admin/billing.html">Billing</a>
        <a href="/admin/incidents.html">Incidents</a>
        <a href="/admin/rooms.html">Rooms</a>
        <a href="/admin/system.html">System</a>
      </nav>
    `;
  },

  setStatus(msg) {
    const el = document.getElementById("pageStatus");
    if (el) el.textContent = msg;
  },

  async requireAdmin() {
    if (!window.LinkdNAuthLive) throw new Error("LinkdNAuthLive is not loaded.");
    const profile = await LinkdNAuthLive.getProfile();
    if (!profile) {
      location.href = "/auth/login.html";
      return null;
    }
    if (!["admin", "moderator"].includes(profile.role)) {
      throw new Error("Admin access only.");
    }
    return profile;
  }
};

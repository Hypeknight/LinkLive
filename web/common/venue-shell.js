window.LinkdNVenueShell = {
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

  venueNav() {
    if (window.LinkdNNav && typeof window.LinkdNNav.venue === "function") {
      return window.LinkdNNav.venue();
    }
    return `
      <nav class="app-nav">
        <a href="/venue/dashboard.html">Dashboard</a>
        <a href="/venue/settings.html">Settings</a>
        <a href="/venue/device-setup.html">Device Setup</a>
        <a href="/venue/local-controls.html">Local Controls</a>
        <a href="/venue/workers.html">Workers</a>
        <a href="/venue/metrics.html">Metrics</a>
        <a href="/owner/venues.html">Back to Owner</a>
      </nav>
    `;
  },

  setStatus(msg) {
    const el = document.getElementById("pageStatus");
    if (el) el.textContent = msg;
  },

  async requireVenueAccess() {
    if (!window.LinkdNAuthLive) throw new Error("LinkdNAuthLive is not loaded.");
    const profile = await LinkdNAuthLive.getProfile();
    if (!profile) {
      location.href = "/auth/login.html";
      return null;
    }
    if (!["owner", "worker", "venue_owner", "venue_staff"].includes(profile.role)) {
      throw new Error("Venue access only.");
    }
    return profile;
  },

  async getActiveVenue(profile) {
    const supabase = window.LinkdNSupabase.getClient();

    if (profile.role === "owner" || profile.role === "venue_owner") {
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq("owner_profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data && data.length ? data[0] : null;
    }

    const { data: membership, error: membershipError } = await supabase
      .from("venue_workers")
      .select("venue_id")
      .eq("profile_id", profile.id)
      .eq("active", true)
      .limit(1);

    if (membershipError) throw membershipError;
    if (!membership || !membership.length) return null;

    const { data: venue, error: venueError } = await supabase
      .from("venues")
      .select("*")
      .eq("id", membership[0].venue_id)
      .single();

    if (venueError) throw venueError;
    return venue;
  }
};

(function () {
  const db = window.LiveDB1;
  const ui = window.LiveUI1;
  const cfg = db.cfg;

  async function requireRole1(allowedRoles) {
    try {
      const session = await db.getSession();
      if (!session) {
        window.location.href = '/login.html';
        return null;
      }
      const profile = await db.loadProfile();
      if (!profile) throw new Error('No profile found for this user.');
      const role = profile.role;
      const allowed = allowedRoles.includes(role);
      if (!allowed) throw new Error(`Access denied for role: ${role}`);
      const currentVenue = profile.venue_id || cfg.venueId;
      if (currentVenue && currentVenue !== cfg.venueId) {
        console.warn('Profile venue_id differs from config venueId.', currentVenue, cfg.venueId);
      }
      return { session, profile };
    } catch (err) {
      ui.flash(err.message || 'Authorization failed', 'error');
      throw err;
    }
  }

  async function bootLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;
    ui.fillShell();
    ui.setConnection(true, 'Supabase Ready');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      const password = form.password.value;
      try {
        await db.signIn(email, password);
        const profile = await db.loadProfile();
        if (!profile) throw new Error('Logged in, but profile is missing.');
        const isModerator = cfg.moderatorRoles.includes(profile.role);
        window.location.href = isModerator ? cfg.defaultRouteForModerator : cfg.defaultRouteForVenue;
      } catch (err) {
        ui.flash(err.message || 'Login failed', 'error');
      }
    });
  }

  async function bootProtectedShell() {
    ui.fillShell();
    const logout = document.getElementById('logout-button');
    if (logout) {
      logout.addEventListener('click', async () => {
        await db.signOut();
        window.location.href = '/login.html';
      });
    }
    const me = document.getElementById('current-user');
    if (me) {
      try {
        const profile = await db.loadProfile();
        me.textContent = profile?.full_name || profile?.email || 'Signed in';
      } catch (_) {}
    }
  }

  window.LiveAuth = { requireRole, bootLogin, bootProtectedShell };
})();

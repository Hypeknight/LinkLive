window.LinkdNNav = {
  owner() { return `<nav class="app-nav">
    <a href="/owner/dashboard.html">Dashboard</a>
    <a href="/owner/profile.html">Profile</a>
    <a href="/owner/venues.html">Venues</a>
    <a href="/owner/workers.html">Workers</a>
    <a href="/owner/billing.html">Billing</a>
    <a href="/owner/messaging.html">Messaging</a>
    <a href="/auth/login.html" id="logoutOwner">Logout</a>
    </nav>`; },
  admin() { return `<nav class="app-nav">
    <a href="/admin/dashboard.html">Dashboard</a>
    <a href="/live/moderator/scheduling.html">Showtime</a>
    <a href="/admin/owners.html">Owners</a>
    <a href="/admin/venues.html">Venues</a>
    <a href="/admin/workers.html">Workers</a>
    <a href="/admin/billing.html">Billing</a>
    <a href="/admin/metrics.html">Metrics</a>
    <a href="/admin/incidents.html">Incidents</a>
    <a href="/auth/login.html" id="logoutAdmin">Logout</a>
    </nav>`; },
  venue() { return `<nav class="app-nav">
    <a href="/venue/dashboard.html">Venue Dashboard</a>
    <a href="../owner/dashboard.html">Home</a>
    <a href="../live/venue/rooms.html">Showtime</a>
    <a href="/venue/settings.html">Settings</a>
    <!-- <a href="/live/ops.html">LiveOps</a> -->
    <a href="/venue/workers.html">Workers</a>
    <a href="/venue/metrics.html">Metrics</a>
    <!-- <a href="/venue/device-setup.html">Device Setup</a> -->
    <!-- <a href="/venue/local-controls.html">Local Controls</a> -->
    <a href="/venue/venue-view.html">Club View</a>
    <a href="/auth/login.html" id="logoutVenue">Logout</a></nav>`; },
  live() { return `<nav class="app-nav"><a href="/live/rooms.html">Rooms</a><a href="/live/schedules.html">Schedules</a><a href="/live/patron-pulse.html">Patron Pulse</a><a href="/live/ops.html">Ops</a></nav>`; }
};
window.addEventListener('click', async (e) => {
  if (e.target && ['logoutOwner','logoutAdmin','logoutVenue'].includes(e.target.id)) {
    e.preventDefault();
    try { await window.LinkdNAuthLive?.signOut(); } catch {}
    location.href = '/auth/login.html';
  }
}
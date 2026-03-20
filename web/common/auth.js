/*window.LinkdNV2Auth = (() => {
  function sb() {
    if (!window.LinkdNV2Supabase) throw new Error('Supabase client not initialized.');
    return window.LinkdNV2Supabase.getClient();
  }
  async function signIn(email, password) {
    return sb().auth.signInWithPassword({ email, password });
  }
  async function signUp(payload) {
    return sb().auth.signUp({ email: payload.email, password: payload.password });
  }
  async function getUser() {
    const { data } = await sb().auth.getUser();
    return data.user;
  }
  async function signOut() {
    return sb().auth.signOut();
  }
  return { signIn, signUp, getUser, signOut };
})();
*/
(function () {
  const db = window.LiveDB;

  async function getSession() {
    const { data, error } = await db.client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function getUser() {
    const { data, error } = await db.client.auth.getUser();
    if (error) throw error;
    return data.user;
  }

  async function getProfile() {
    const user = await getUser();
    if (!user) return null;

    const { data, error } = await db.client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return data;
  }

  async function requireAuth() {
    const session = await getSession();
    if (!session) {
      window.location.href = '/login.html';
      throw new Error('You must be logged in.');
    }
    return session;
  }

  async function requireRole(allowedRoles = []) {
    await requireAuth();

    const profile = await getProfile();
    if (!profile) {
      throw new Error('Profile not found for this user.');
    }

    if (!allowedRoles.includes(profile.role)) {
      throw new Error(`Access denied for role: ${profile.role}`);
    }

    return profile;
  }

  async function bootProtectedShell() {
    const profile = await getProfile();

    const nameEl = document.querySelector('[data-user-name]');
    const roleEl = document.querySelector('[data-user-role]');

    if (nameEl) nameEl.textContent = profile?.full_name || profile?.email || 'User';
    if (roleEl) roleEl.textContent = profile?.role || 'unknown';
  }

  async function signOut() {
    const { error } = await db.client.auth.signOut();
    if (error) throw error;
    window.location.href = '/login.html';
  }

  window.LiveAuth = {
    getSession,
    getUser,
    getProfile,
    requireAuth,
    requireRole,
    bootProtectedShell,
    signOut
  };
})();
window.LinkdNAuthLive = (() => {
  function supabase() { return window.LinkdNSupabase.getClient(); }

  async function signUp({ email, password, display_name, role='owner' }) {
    const sb = supabase();
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    if (data.user) {
      const { error: profileError } = await sb.from('profiles').upsert({
        id: data.user.id,
        role,
        display_name,
        email,
        active: true
      });
      if (profileError) throw profileError;
      if (role === 'owner') {
        await sb.from('owner_settings').upsert({ owner_profile_id: data.user.id });
      }
    }
    return data;
  }

  async function signIn({ email, password }) {
    const { data, error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await supabase().auth.signOut();
    if (error) throw error;
  }

  async function getUser() {
    const { data, error } = await supabase().auth.getUser();
    if (error) throw error;
    return data.user;
  }

  async function getProfile() {
    const user = await getUser();
    if (!user) return null;
    const sb = supabase();
    const { data: profile, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (error) throw error;
    return profile;
  }

  async function requireRole(roles) {
    const profile = await getProfile();
    if (!profile) {
      location.href = '/auth/login.html';
      return null;
    }
    if (roles && !roles.includes(profile.role)) {
      location.href = '/owner/dashboard.html';
      return null;
    }
    return profile;
  }

  return { signUp, signIn, signOut, getUser, getProfile, requireRole };
})();

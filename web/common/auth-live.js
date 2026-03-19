window.LinkdNAuthLive = (() => {
  function getSupabase() {
    if (!window.LinkdNSupabase) throw new Error('LinkdNSupabase is not initialized.');
    return window.LinkdNSupabase.getClient();
  }
  async function signUp({ email, password, display_name, role = 'owner' }) {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    const user = data.user;
    if (user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id, role, display_name, email, active: true
      });
      if (profileError) throw profileError;
    }
    return data;
  }
  async function signIn({ email, password }) {
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error; return data;
  }
  async function signOut() {
    const { error } = await getSupabase().auth.signOut(); if (error) throw error;
  }
  async function getUser() {
    const { data, error } = await getSupabase().auth.getUser(); if (error) throw error; return data.user;
  }
  async function getProfile() {
    const supabase = getSupabase();
    const user = await getUser();
    if (!user) return null;
    let { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!data) {
      const { error: insertError } = await supabase.from('profiles').insert({
        id: user.id, role: 'owner', email: user.email, display_name: user.email?.split('@')[0] || 'New User', active: true
      });
      if (insertError) throw insertError;
      const retry = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (retry.error) throw retry.error;
      data = retry.data;
    }
    return data;
  }
  return { signUp, signIn, signOut, getUser, getProfile };
})();

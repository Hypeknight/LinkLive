window.LinkdNV2Auth = (() => {
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

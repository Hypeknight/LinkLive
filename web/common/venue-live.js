window.LinkdNVenueLive = (() => {
  function getSupabase() {
    if (!window.LinkdNSupabase) throw new Error("LinkdNSupabase is not loaded.");
    return window.LinkdNSupabase.getClient();
  }

  function getSelectedVenueId() {
    return localStorage.getItem("linkdn_selected_venue_id") || "";
  }

  async function requireProfile() {
    if (!window.LinkdNAuthLive) throw new Error("LinkdNAuthLive is not loaded.");
    const profile = await LinkdNAuthLive.getProfile();
    if (!profile) {
      location.href = "/auth/login.html";
      return null;
    }
    return profile;
  }

  async function getVenueForCurrentUser() {
    const supabase = getSupabase();
    const profile = await requireProfile();
    if (!profile) return null;

    const selectedVenueId = getSelectedVenueId();

    if (selectedVenueId) {
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq("id", selectedVenueId)
        .maybeSingle();

      if (error) throw error;
      if (data) return data;
    }

    if (["owner", "venue_owner"].includes(profile.role)) {
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq("owner_profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      return data && data.length ? data[0] : null;
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("venue_workers")
      .select("venue_id")
      .eq("profile_id", profile.id)
      .eq("active", true)
      .limit(1);

    if (membershipError) throw membershipError;
    if (!memberships || !memberships.length) return null;

    const { data: venue, error: venueError } = await supabase
      .from("venues")
      .select("*")
      .eq("id", memberships[0].venue_id)
      .single();

    if (venueError) throw venueError;
    return venue;
  }

  async function getOrCreateLocalControlState(venueId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("venue_local_control_state")
      .select("*")
      .eq("venue_id", venueId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;

    const payload = {
      venue_id: venueId,
      room_slug: "central-battle-room",
      camera_enabled: true,
      microphone_enabled: true,
      local_controls_locked: false,
      current_show_mode: "idle"
    };

    const { data: created, error: createError } = await supabase
      .from("venue_local_control_state")
      .insert(payload)
      .select()
      .single();

    if (createError) throw createError;
    return created;
  }

  async function updateLocalControlState(venueId, patch) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("venue_local_control_state")
      .update(patch)
      .eq("venue_id", venueId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function getRooms() {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async function getRoomBySlug(slug) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async function getRoomSchedule(roomId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("schedules")
      .select("*")
      .eq("room_id", roomId)
      .order("sort_order", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function getOpenPoll(roomId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("patron_polls")
      .select("*, patron_poll_options(*)")
      .eq("room_id", roomId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async function castVote(pollId, optionId, voterSessionId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("patron_votes")
      .insert({
        poll_id: pollId,
        option_id: optionId,
        voter_session_id: voterSessionId
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  function getOrCreateVoterSession() {
    let id = localStorage.getItem("linkdn_voter_session_id");
    if (!id) {
      id = "vote_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("linkdn_voter_session_id", id);
    }
    return id;
  }

  return {
    getSupabase,
    requireProfile,
    getVenueForCurrentUser,
    getOrCreateLocalControlState,
    updateLocalControlState,
    getRooms,
    getRoomBySlug,
    getRoomSchedule,
    getOpenPoll,
    castVote,
    getOrCreateVoterSession
  };
})();

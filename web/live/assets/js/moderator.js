(function () {
  const db = window.LiveDB;
  const ui = window.LiveUI;
  const auth = window.LiveAuth;

  const state = {
    profile: null,
    rooms: [],
    memberships: [],
    schedules: [],
    pulses: [],
    prompts: [],
    showStates: [],
    messages: [],
    venues: [],
  };

  function esc(v) {
    return ui?.esc ? ui.esc(v) : String(v ?? '');
  }

  function fmt(v) {
    return ui?.fmtDate ? ui.fmtDate(v) : (v || '—');
  }

  function flash(msg, type = 'info') {
    if (ui?.flash) ui.flash(msg, type);
  }

  async function loadProfile() {
    await auth.requireRole(db.cfg.moderatorRoles || ['admin', 'moderator', 'ops']);
    state.profile = await auth.getProfile();

    const currentUser = document.getElementById('current-user');
    if (currentUser) currentUser.textContent = state.profile?.display_name || state.profile?.email || '';

    document.querySelectorAll('[data-app-name]').forEach(el => {
      el.textContent = 'Linkd’N Live';
    });
  }

  async function refreshAll() {
    const [
      roomsRes,
      membershipsRes,
      schedulesRes,
      pulseRes,
      promptsRes,
      showRes,
      msgRes,
      venuesRes
    ] = await Promise.all([
      db.client.from('rooms').select('*').order('created_at', { ascending: true }),
      db.client.from('room_venues').select('*').order('joined_at', { ascending: true }),
      db.client.from('schedules').select('*').order('starts_at', { ascending: true }),
      db.client.from('patron_pulse').select('*').order('created_at', { ascending: false }).limit(300),
      db.client.from('pulse_prompts').select('*').order('created_at', { ascending: false }).limit(200),
      db.client.from('show_state').select('*'),
      db.client.from('production_messages').select('*').order('created_at', { ascending: false }).limit(200),
      db.client.from('venues').select('*')
    ]);

    [roomsRes, membershipsRes, schedulesRes, pulseRes, promptsRes, showRes, msgRes, venuesRes].forEach(r => {
      if (r.error) throw r.error;
    });

    state.rooms = roomsRes.data || [];
    state.memberships = membershipsRes.data || [];
    state.schedules = schedulesRes.data || [];
    state.pulses = pulseRes.data || [];
    state.prompts = promptsRes.data || [];
    state.showStates = showRes.data || [];
    state.messages = msgRes.data || [];
    state.venues = venuesRes.data || [];

    renderPage();
  }

  function roomTitle(roomId) {
    return state.rooms.find(r => r.id === roomId)?.title || '—';
  }

  function roomMemberships(roomId) {
    return state.memberships.filter(m => m.room_id === roomId && !m.left_at);
  }

  function roomSchedule(roomId) {
    return state.schedules.filter(s => s.room_id === roomId);
  }

  function roomPulses(roomId) {
    return state.pulses.filter(p => p.room_id === roomId);
  }

  function roomPrompt(roomId) {
    return state.prompts.find(p => p.room_id === roomId && p.status === 'live') || null;
  }

  function roomShowState(roomId) {
    return state.showStates.find(s => s.room_id === roomId) || null;
  }

  function roomMessages(roomId) {
    return state.messages.filter(m => m.room_id === roomId);
  }

  function venueName(venueId) {
    return state.venues.find(v => String(v.id) === String(venueId))?.name || String(venueId || '—');
  }

  function avgPulseForRoom(roomId) {
    const rows = roomPulses(roomId);
    return rows.length
      ? Math.round(rows.reduce((a, b) => a + Number(b.pulse_score || 0), 0) / rows.length)
      : 0;
  }

  function avgEnergyForRoom(roomId) {
    const rows = roomPulses(roomId);
    return rows.length
      ? Math.round(rows.reduce((a, b) => a + Number(b.energy_level || 0), 0) / rows.length)
      : 0;
  }

  function parsePulseOptions(raw) {
    return String(raw || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map((label, idx) => ({
        id: String(idx + 1),
        option_text: label
      }));
  }

  function bindLogout() {
    document.getElementById('logout-button')?.addEventListener('click', async () => {
      await auth.signOut();
    });
  }

  function renderPage() {
    const page = document.body.dataset.page;
    if (page === 'moderator-rooms') renderRoomsPage();
    if (page === 'moderator-scheduling') renderSchedulingPage();
  }

  function renderRoomsPage() {
    renderRoomAdminTable();
    renderManageRoomSelect();
    bindRoomForm();
    bindPulseForm();
    bindMessageForm();
    bindShowStateForm();
  }

  function renderRoomAdminTable() {
    const tbody = document.getElementById('moderator-rooms-table-body');
    if (!tbody) return;

    tbody.innerHTML = state.rooms.map(r => {
      const members = roomMemberships(r.id);
      const liveCount = members.filter(m => m.is_broadcasting).length;

      return `
        <tr>
          <td>${esc(r.title)}</td>
          <td>${esc(r.zone || '—')}</td>
          <td>${esc(r.status || 'scheduled')}</td>
          <td>${members.length}/5</td>
          <td>${liveCount}</td>
          <td class="actions">
            <button type="button" data-edit-room="${r.id}">Edit</button>
            <button type="button" data-manage-room="${r.id}">Manage</button>
            <button type="button" class="danger" data-delete-room="${r.id}">Delete</button>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6">No rooms found.</td></tr>';

    tbody.querySelectorAll('[data-edit-room]').forEach(btn => {
      btn.onclick = () => {
        const room = state.rooms.find(r => r.id === btn.dataset.editRoom);
        const form = document.getElementById('room-form');
        if (!room || !form) return;

        form.dataset.editingId = room.id;
        form.title.value = room.title || '';
        if (form.slug) form.slug.value = room.slug || '';
        form.zone.value = room.zone || '';
        form.capacity.value = room.capacity || 0;
        form.status.value = room.status || 'scheduled';
        if (form.notes) form.notes.value = room.notes || '';
        if (form.is_active) form.is_active.checked = !!room.is_active;

        const titleEl = document.getElementById('room-form-title');
        if (titleEl) titleEl.textContent = 'Edit Room';
      };
    });

    tbody.querySelectorAll('[data-manage-room]').forEach(btn => {
      btn.onclick = () => {
        const select = document.getElementById('manage-room-id');
        if (!select) return;
        select.value = btn.dataset.manageRoom;
        renderManageRoomPanel(btn.dataset.manageRoom);
      };
    });

    tbody.querySelectorAll('[data-delete-room]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this room?')) return;
        try {
          const { error } = await db.client.from('rooms').delete().eq('id', btn.dataset.deleteRoom);
          if (error) throw error;
          flash('Room deleted.');
          await refreshAll();
        } catch (err) {
          flash(err.message || 'Unable to delete room.', 'error');
        }
      };
    });
  }

  function renderManageRoomSelect() {
    const select = document.getElementById('manage-room-id');
    if (!select) return;

    const current = select.value;
    select.innerHTML =
      (ui.option ? ui.option('', 'Select room') : '<option value="">Select room</option>') +
      state.rooms.map(r =>
        ui.option
          ? ui.option(r.id, r.title, r.id === current)
          : `<option value="${esc(r.id)}">${esc(r.title)}</option>`
      ).join('');

    if (!select.dataset.bound) {
      select.dataset.bound = '1';
      select.addEventListener('change', () => renderManageRoomPanel(select.value));
    }

    if (select.value) renderManageRoomPanel(select.value);
  }

  function renderManageRoomPanel(roomId) {
    const summary = document.getElementById('manage-room-summary');
    const venuesBody = document.getElementById('manage-room-venues');
    const pulseBox = document.getElementById('manage-room-pulse');
    const msgBody = document.getElementById('manage-room-messages');
    const scheduleBody = document.getElementById('manage-room-schedule');

    const room = state.rooms.find(r => r.id === roomId);
    const members = roomMemberships(roomId);
    const prompt = roomPrompt(roomId);
    const roomPulseEntries = roomPulses(roomId);
    const avgPulse = avgPulseForRoom(roomId);
    const avgEnergy = avgEnergyForRoom(roomId);
    const show = roomShowState(roomId);

    if (summary) {
      summary.innerHTML = room
        ? `
          <div><strong>Room:</strong> ${esc(room.title)}</div>
          <div><strong>Status:</strong> ${esc(room.status || 'scheduled')}</div>
          <div><strong>Zone:</strong> ${esc(room.zone || '—')}</div>
          <div><strong>Capacity:</strong> ${esc(room.capacity || 0)}</div>
          <div><strong>Tonight Avg Pulse:</strong> ${avgPulse}%</div>
          <div><strong>Tonight Avg Energy:</strong> ${avgEnergy}%</div>
          <div><strong>Current Phase:</strong> ${esc(show?.event_type || show?.current_segment || '—')}</div>
        `
        : '<p>Select a room to manage.</p>';
    }

    if (venuesBody) {
      venuesBody.innerHTML = members.length
        ? members.map(m => `
            <tr>
              <td>${esc(venueName(m.venue_id))}</td>
              <td>${esc(m.status || 'connected')}</td>
              <td>${m.is_broadcasting ? 'Live' : 'Idle'}</td>
              <td>${fmt(m.joined_at)}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="4">No connected venues.</td></tr>';
    }

    if (pulseBox) {
      pulseBox.innerHTML = prompt
        ? `
          <div><strong>Prompt:</strong> ${esc(prompt.prompt_text)}</div>
          <div><strong>CTA:</strong> ${esc(prompt.cta_type || 'vote')}</div>
          <div><strong>Type:</strong> ${esc(prompt.prompt_type || 'pulse')}</div>
          <div><strong>Status:</strong> ${esc(prompt.status || 'live')}</div>
          <div><strong>Ends:</strong> ${fmt(prompt.ends_at)}</div>
          <div><strong>Show Results:</strong> ${prompt.show_results_after_close ? 'Yes' : 'No'}</div>
          <div><strong>Responses Tonight:</strong> ${roomPulseEntries.length}</div>
        `
        : '<p>No live pulse prompt for this room.</p>';
    }

    if (msgBody) {
      const msgs = roomMessages(roomId);
      msgBody.innerHTML = msgs.length
        ? msgs.map(m => `
            <tr>
              <td>${esc(m.from_role || 'system')}</td>
              <td>${esc(m.body || '')}</td>
              <td>${fmt(m.created_at)}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="3">No room messages.</td></tr>';
    }

    if (scheduleBody) {
      const items = roomSchedule(roomId);
      scheduleBody.innerHTML = items.length
        ? items.map(s => `
            <tr>
              <td>${esc(s.segment_title || s.title || 'Segment')}</td>
              <td>${fmt(s.starts_at || s.start_at)}</td>
              <td>${fmt(s.end_at)}</td>
              <td>${esc(s.segment_type || s.status || 'segment')}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="4">No schedule for this room.</td></tr>';
    }

    const pulseForm = document.getElementById('pulse-form');
    if (pulseForm && pulseForm.room_id) {
      pulseForm.room_id.value = roomId || '';
    }

    const messageForm = document.getElementById('room-message-form');
    if (messageForm && messageForm.room_id) {
      messageForm.room_id.value = roomId || '';
    }

    const showStateForm = document.getElementById('show-state-form');
    if (showStateForm && showStateForm.room_id) {
      showStateForm.room_id.value = roomId || '';
      if (show) {
        if (showStateForm.current_segment) showStateForm.current_segment.value = show.current_segment || '';
        if (showStateForm.current_round) showStateForm.current_round.value = show.current_round || '';
        if (showStateForm.event_type) showStateForm.event_type.value = show.event_type || '';
      }
    }
  }

  function bindRoomForm() {
    const form = document.getElementById('room-form');
    if (!form || form.dataset.bound) return;

    form.dataset.bound = '1';

    form.addEventListener('submit', async e => {
      e.preventDefault();

      const payload = {
        title: form.title.value.trim(),
        slug: form.slug ? (form.slug.value.trim() || null) : null,
        zone: form.zone.value.trim() || null,
        capacity: Number(form.capacity.value || 0),
        status: form.status.value,
        notes: form.notes ? (form.notes.value.trim() || null) : null,
        is_active: form.is_active ? !!form.is_active.checked : true,
        created_by: state.profile?.id || null
      };

      try {
        if (form.dataset.editingId) {
          const { error } = await db.client.from('rooms').update(payload).eq('id', form.dataset.editingId);
          if (error) throw error;
          flash('Room updated.');
        } else {
          const { error } = await db.client.from('rooms').insert(payload);
          if (error) throw error;
          flash('Room created.');
        }

        form.reset();
        form.dataset.editingId = '';
        const titleEl = document.getElementById('room-form-title');
        if (titleEl) titleEl.textContent = 'Add Room';
        await refreshAll();
      } catch (err) {
        flash(err.message || 'Unable to save room.', 'error');
      }
    });

    document.getElementById('room-form-reset')?.addEventListener('click', () => {
      form.reset();
      form.dataset.editingId = '';
      const titleEl = document.getElementById('room-form-title');
      if (titleEl) titleEl.textContent = 'Add Room';
    });
  }

  function bindPulseForm() {
    const form = document.getElementById('pulse-form');
    if (!form || form.dataset.bound) return;

    form.dataset.bound = '1';

    form.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const optionSet = parsePulseOptions(form.option_labels?.value || '');

        const payload = {
          room_id: form.room_id.value,
          created_by: state.profile.id,
          prompt_text: form.prompt_text.value.trim(),
          prompt_type: form.prompt_type.value,
          cta_type: form.cta_type.value,
          status: 'live',
          allow_comments: !!form.allow_comments?.checked,
          allow_votes: form.cta_type.value === 'vote',
          allow_hype: !!form.allow_hype?.checked,
          show_results_after_close: !!form.show_results_after_close?.checked,
          results_visible_until: form.results_visible_until?.value
            ? new Date(form.results_visible_until.value).toISOString()
            : null,
          ends_at: form.ends_at?.value
            ? new Date(form.ends_at.value).toISOString()
            : null,
          option_set_json: optionSet
        };

        const { error } = await db.client.from('pulse_prompts').insert(payload);
        if (error) throw error;

        flash('Live pulse launched.');
        form.reset();
        await refreshAll();
      } catch (err) {
        flash(err.message || 'Unable to launch pulse.', 'error');
      }
    });

    document.getElementById('close-live-pulse')?.addEventListener('click', async () => {
      const roomId = form.room_id?.value;
      if (!roomId) {
        flash('Select a room first.', 'error');
        return;
      }

      try {
        const prompt = roomPrompt(roomId);
        if (!prompt) {
          flash('No live pulse prompt for this room.', 'error');
          return;
        }

        const { error } = await db.client
          .from('pulse_prompts')
          .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
            closed_by: state.profile.id
          })
          .eq('id', prompt.id);

        if (error) throw error;

        flash('Live pulse closed.');
        await refreshAll();
      } catch (err) {
        flash(err.message || 'Unable to close pulse prompt.', 'error');
      }
    });
  }

  function bindMessageForm() {
    const form = document.getElementById('room-message-form');
    if (!form || form.dataset.bound) return;

    form.dataset.bound = '1';

    form.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const payload = {
          room_id: form.room_id.value,
          profile_id: state.profile.id,
          venue_id: null,
          from_role: 'moderator',
          body: form.body.value.trim()
        };

        const { error } = await db.client.from('production_messages').insert(payload);
        if (error) throw error;

        form.body.value = '';
        flash('Message sent.');
        await refreshAll();
      } catch (err) {
        flash(err.message || 'Unable to send message.', 'error');
      }
    });
  }

  function bindShowStateForm() {
    const form = document.getElementById('show-state-form');
    if (!form || form.dataset.bound) return;

    form.dataset.bound = '1';

    form.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const payload = {
          room_id: form.room_id.value,
          current_segment: form.current_segment?.value?.trim() || null,
          current_round: form.current_round?.value?.trim() || null,
          event_type: form.event_type?.value?.trim() || null,
          updated_at: new Date().toISOString()
        };

        const { error } = await db.client.from('show_state').upsert(payload, { onConflict: 'room_id' });
        if (error) throw error;

        flash('Show state updated.');
        await refreshAll();
      } catch (err) {
        flash(err.message || 'Unable to update show state.', 'error');
      }
    });
  }

  function renderSchedulingPage() {
    renderScheduleTable();
    renderScheduleRoomSelect();
    bindScheduleForm();
  }

  function renderScheduleTable() {
    const tbody = document.getElementById('moderator-schedule-table-body');
    if (!tbody) return;

    tbody.innerHTML = state.schedules.map(s => `
      <tr>
        <td>${esc(roomTitle(s.room_id))}</td>
        <td>${esc(s.segment_title || s.title || 'Segment')}</td>
        <td>${fmt(s.starts_at || s.start_at)}</td>
        <td>${fmt(s.end_at)}</td>
        <td>${esc(s.segment_type || s.status || 'segment')}</td>
        <td class="actions">
          <button type="button" data-edit-schedule="${s.id}">Edit</button>
          <button type="button" class="danger" data-delete-schedule="${s.id}">Delete</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6">No schedule items found.</td></tr>';

    tbody.querySelectorAll('[data-edit-schedule]').forEach(btn => {
      btn.onclick = () => {
        const item = state.schedules.find(s => s.id === btn.dataset.editSchedule);
        const form = document.getElementById('schedule-form');
        if (!item || !form) return;

        form.dataset.editingId = item.id;
        if (form.room_id) form.room_id.value = item.room_id || '';
        if (form.segment_title) form.segment_title.value = item.segment_title || item.title || '';
        if (form.segment_type) form.segment_type.value = item.segment_type || '';
        if (form.description) form.description.value = item.description || '';
        if (form.lead_name) form.lead_name.value = item.lead_name || '';
        if (form.starts_at) form.starts_at.value = item.starts_at ? new Date(item.starts_at).toISOString().slice(0, 16) : '';
        if (form.end_at) form.end_at.value = item.end_at ? new Date(item.end_at).toISOString().slice(0, 16) : '';

        const titleEl = document.getElementById('schedule-form-title');
        if (titleEl) titleEl.textContent = 'Edit Schedule Item';
      };
    });

    tbody.querySelectorAll('[data-delete-schedule]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this schedule item?')) return;
        try {
          const { error } = await db.client.from('schedules').delete().eq('id', btn.dataset.deleteSchedule);
          if (error) throw error;
          flash('Schedule item deleted.');
          await refreshAll();
        } catch (err) {
          flash(err.message || 'Unable to delete schedule item.', 'error');
        }
      };
    });
  }

  function renderScheduleRoomSelect() {
    const select = document.getElementById('schedule-room-filter');
    const roomSelect = document.querySelector('#schedule-form [name="room_id"]');

    if (select) {
      const current = select.value;
      select.innerHTML =
        (ui.option ? ui.option('', 'All rooms') : '<option value="">All rooms</option>') +
        state.rooms.map(r => ui.option
          ? ui.option(r.id, r.title, r.id === current)
          : `<option value="${esc(r.id)}">${esc(r.title)}</option>`
        ).join('');

      if (!select.dataset.bound) {
        select.dataset.bound = '1';
        select.addEventListener('change', () => {
          const roomId = select.value;
          const tbody = document.getElementById('moderator-schedule-table-body');
          if (!tbody) return;

          const rows = roomId ? state.schedules.filter(s => s.room_id === roomId) : state.schedules;
          tbody.innerHTML = rows.map(s => `
            <tr>
              <td>${esc(roomTitle(s.room_id))}</td>
              <td>${esc(s.segment_title || s.title || 'Segment')}</td>
              <td>${fmt(s.starts_at || s.start_at)}</td>
              <td>${fmt(s.end_at)}</td>
              <td>${esc(s.segment_type || s.status || 'segment')}</td>
              <td class="actions">
                <button type="button" data-edit-schedule="${s.id}">Edit</button>
                <button type="button" class="danger" data-delete-schedule="${s.id}">Delete</button>
              </td>
            </tr>
          `).join('') || '<tr><td colspan="6">No schedule items found.</td></tr>';
        });
      }
    }

    if (roomSelect) {
      const current = roomSelect.value;
      roomSelect.innerHTML =
        (ui.option ? ui.option('', 'Select room') : '<option value="">Select room</option>') +
        state.rooms.map(r => ui.option
          ? ui.option(r.id, r.title, r.id === current)
          : `<option value="${esc(r.id)}">${esc(r.title)}</option>`
        ).join('');
    }
  }

  function bindScheduleForm() {
    const form = document.getElementById('schedule-form');
    if (!form || form.dataset.bound) return;

    form.dataset.bound = '1';

    form.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const payload = {
          room_id: form.room_id.value || null,
          segment_title: form.segment_title?.value?.trim() || null,
          segment_type: form.segment_type?.value?.trim() || null,
          description: form.description?.value?.trim() || null,
          lead_name: form.lead_name?.value?.trim() || null,
          starts_at: form.starts_at?.value ? new Date(form.starts_at.value).toISOString() : null,
          end_at: form.end_at?.value ? new Date(form.end_at.value).toISOString() : null
        };

        if (form.dataset.editingId) {
          const { error } = await db.client.from('schedules').update(payload).eq('id', form.dataset.editingId);
          if (error) throw error;
          flash('Schedule item updated.');
        } else {
          const { error } = await db.client.from('schedules').insert(payload);
          if (error) throw error;
          flash('Schedule item created.');
        }

        form.reset();
        form.dataset.editingId = '';
        const titleEl = document.getElementById('schedule-form-title');
        if (titleEl) titleEl.textContent = 'Add Schedule Item';
        await refreshAll();
      } catch (err) {
        flash(err.message || 'Unable to save schedule item.', 'error');
      }
    });

    document.getElementById('schedule-form-reset')?.addEventListener('click', () => {
      form.reset();
      form.dataset.editingId = '';
      const titleEl = document.getElementById('schedule-form-title');
      if (titleEl) titleEl.textContent = 'Add Schedule Item';
    });
  }

  async function boot() {
    try {
      await loadProfile();
      bindLogout();
      ui?.setConnection?.(true, 'Connected');
      await refreshAll();

      [
        'rooms',
        'room_venues',
        'schedules',
        'patron_pulse',
        'pulse_prompts',
        'show_state',
        'production_messages',
        'venues'
      ].forEach(t => db.subscribe(t, refreshAll));
    } catch (err) {
      console.error(err);
      ui?.setConnection?.(false, 'Error');
      flash(err.message || 'Moderator page failed to load.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch(err => {
      console.error(err);
      flash(err.message || 'Moderator page failed to load.', 'error');
    });
  });
})();
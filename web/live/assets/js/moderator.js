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

  function setConnection(ok, label) {
    if (ui?.setConnection) ui.setConnection(ok, label);
  }

  async function loadProfile() {
    await auth.requireRole(db.cfg.moderatorRoles || ['admin', 'moderator', 'ops']);
    state.profile = await auth.getProfile();

    const currentUser = document.getElementById('current-user');
    if (currentUser) {
      currentUser.textContent = state.profile?.display_name || state.profile?.email || '';
    }

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
      db.client.from('room_venues').select('*').is('left_at', null).order('joined_at', { ascending: true }),
      db.client.from('schedules').select('*').order('starts_at', { ascending: true }),
      db.client.from('patron_pulse').select('*').order('created_at', { ascending: false }).limit(200),
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
    return state.memberships.filter(m => m.room_id === roomId);
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

  function timezoneHint(room) {
    return room?.zone || 'Local venue time';
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
        form.slug.value = room.slug || '';
        form.zone.value = room.zone || '';
        form.capacity.value = room.capacity || 0;
        form.status.value = room.status || 'scheduled';
        form.notes.value = room.notes || '';
        form.is_active.checked = !!room.is_active;

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
      summary.innerHTML = room ? `
        <div class="stat-box"><strong>${esc(room.title)}</strong><span>Room</span></div>
        <div class="stat-box"><strong>${members.length}/5</strong><span>Connected Venues</span></div>
        <div class="stat-box"><strong>${members.filter(m => m.is_broadcasting).length}</strong><span>Live Feeds</span></div>
        <div class="stat-box"><strong>${avgPulse}%</strong><span>Pulse Score</span></div>
        <div class="stat-box"><strong>${avgEnergy}</strong><span>Hype Meter</span></div>
        <div class="stat-box"><strong>${esc(show?.event_type || '—')}</strong><span>Current Phase</span></div>
      ` : '<p>Select a room to manage production.</p>';
    }

    if (venuesBody) {
      venuesBody.innerHTML = members.map(m => `
        <tr>
          <td>${esc(venueName(m.venue_id))}</td>
          <td>${esc(m.status || 'connected')}</td>
          <td>${m.is_broadcasting ? 'Live' : 'Idle'}</td>
          <td class="actions">
            <button type="button" data-toggle-feed="${m.id}">
              ${m.is_broadcasting ? 'Stop Feed' : 'Start Feed'}
            </button>
            <button type="button" class="danger" data-kick-venue="${m.id}">Disconnect</button>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="4">No connected venues.</td></tr>';

      venuesBody.querySelectorAll('[data-toggle-feed]').forEach(btn => {
        btn.onclick = async () => {
          try {
            const member = members.find(m => m.id === btn.dataset.toggleFeed);
            if (!member) return;

            const { error } = await db.client
              .from('room_venues')
              .update({
                is_broadcasting: !member.is_broadcasting,
                status: member.is_broadcasting ? 'connected' : 'live',
              })
              .eq('id', btn.dataset.toggleFeed);

            if (error) throw error;
            flash('Feed state updated.');
            await refreshAll();
          } catch (err) {
            flash(err.message || 'Unable to update feed state.', 'error');
          }
        };
      });

      venuesBody.querySelectorAll('[data-kick-venue]').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm('Disconnect this venue from the room?')) return;
          try {
            const { error } = await db.client
              .from('room_venues')
              .update({
                left_at: new Date().toISOString(),
                status: 'removed',
                is_broadcasting: false
              })
              .eq('id', btn.dataset.kickVenue);

            if (error) throw error;
            flash('Venue disconnected.');
            await refreshAll();
          } catch (err) {
            flash(err.message || 'Unable to disconnect venue.', 'error');
          }
        };
      });
    }

    if (pulseBox) {
      pulseBox.innerHTML = prompt
        ? `
          <h4>${esc(prompt.prompt_text)}</h4>
          <p>Type: ${esc(prompt.prompt_type || 'vote')}</p>
          <p>Status: ${esc(prompt.status || 'live')}</p>
          <p>Ends: ${fmt(prompt.ends_at)}</p>
          <p>Entries: ${roomPulseEntries.length}</p>
        `
        : '<p>No live pulse prompt for this room.</p>';
    }

    if (msgBody) {
      msgBody.innerHTML = roomMessages(roomId).map(m => `
        <tr>
          <td>${esc(m.from_role)}</td>
          <td>${esc(m.body)}</td>
          <td>${fmt(m.created_at)}</td>
        </tr>
      `).join('') || '<tr><td colspan="3">No room messages.</td></tr>';
    }

    if (scheduleBody) {
      scheduleBody.innerHTML = roomSchedule(roomId).map(s => `
        <tr>
          <td>${esc(s.segment_title)}</td>
          <td>${esc(s.segment_type || 'segment')}</td>
          <td>${fmt(s.starts_at)}</td>
          <td>${fmt(s.end_at)}</td>
        </tr>
      `).join('') || '<tr><td colspan="4">No room schedule yet.</td></tr>';
    }

    const pulseForm = document.getElementById('pulse-form');
    const msgForm = document.getElementById('moderator-message-form');
    const showForm = document.getElementById('show-state-form');

    if (pulseForm) pulseForm.room_id.value = roomId || '';
    if (msgForm) msgForm.room_id.value = roomId || '';

    if (showForm) {
      showForm.room_id.value = roomId || '';
      showForm.current_segment.value = show?.current_segment || '';
      showForm.current_round.value = show?.current_round || '';
      showForm.event_type.value = show?.event_type || 'rotation';
      showForm.remaining_seconds.value = show?.remaining_seconds ?? 0;
      showForm.portal_open.checked = !!show?.portal_open;
      showForm.timer_running.checked = !!show?.timer_running;
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
        slug: form.slug.value.trim() || null,
        zone: form.zone.value.trim() || null,
        capacity: Number(form.capacity.value || 0),
        status: form.status.value,
        notes: form.notes.value.trim() || null,
        is_active: !!form.is_active.checked,
        created_by: state.profile.id,
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
        if (titleEl) titleEl.textContent = 'Create Room';

        await refreshAll();
      } catch (err) {
        flash(err.message || 'Unable to save room.', 'error');
      }
    });

    document.getElementById('room-form-reset')?.addEventListener('click', () => {
      form.reset();
      form.dataset.editingId = '';
      const titleEl = document.getElementById('room-form-title');
      if (titleEl) titleEl.textContent = 'Create Room';
    });
  }

  function bindPulseForm() {
    const form = document.getElementById('pulse-form');
    if (!form || form.dataset.bound) return;

    form.dataset.bound = '1';

    form.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const payload = {
          room_id: form.room_id.value,
          created_by: state.profile.id,
          prompt_text: form.prompt_text.value.trim(),
          prompt_type: form.prompt_type.value,
          status: 'live',
          allow_comments: !!form.allow_comments.checked,
          allow_votes: true,
          allow_hype: !!form.allow_hype.checked,
          ends_at: form.ends_at.value ? new Date(form.ends_at.value).toISOString() : null,
        };

        const { error } = await db.client.from('pulse_prompts').insert(payload);
        if (error) throw error;

        flash('Pulse prompt sent to room.');
        form.reset();
        await refreshAll();
      } catch (err) {
        flash(err.message || 'Unable to create pulse prompt.', 'error');
      }
    });

    document.getElementById('close-live-pulse')?.addEventListener('click', async () => {
      const roomId = form.room_id.value;
      if (!roomId) {
        flash('Select a room first.', 'error');
        return;
      }

      try {
        const livePrompt = roomPrompt(roomId);
        if (!livePrompt) {
          flash('No live pulse prompt for this room.', 'error');
          return;
        }

        const { error } = await db.client
          .from('pulse_prompts')
          .update({ status: 'closed' })
          .eq('id', livePrompt.id);

        if (error) throw error;
        flash('Live pulse closed.');
        await refreshAll();
      } catch (err) {
        flash(err.message || 'Unable to close pulse prompt.', 'error');
      }
    });
  }

  function bindMessageForm() {
    const form = document.getElementById('moderator-message-form');
    if (!form || form.dataset.bound) return;

    form.dataset.bound = '1';

    form.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const { error } = await db.client.from('production_messages').insert({
          room_id: form.room_id.value,
          profile_id: state.profile.id,
          venue_id: null,
          from_role: 'moderator',
          body: form.body.value.trim(),
        });

        if (error) throw error;

        flash('Message sent to room.');
        form.reset();
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
          current_segment: form.current_segment.value.trim() || null,
          current_round: form.current_round.value.trim() || null,
          portal_open: !!form.portal_open.checked,
          timer_running: !!form.timer_running.checked,
          remaining_seconds: Number(form.remaining_seconds.value || 0),
          event_type: form.event_type.value,
          updated_at: new Date().toISOString(),
        };

        const { error } = await db.client
          .from('show_state')
          .upsert(payload, { onConflict: 'room_id' });

        if (error) throw error;

        flash('Production state updated.');
        await refreshAll();
      } catch (err) {
        flash(err.message || 'Unable to update production state.', 'error');
      }
    });

    document.getElementById('production-override-stop')?.addEventListener('click', async () => {
      try {
        const roomId = form.room_id.value;
        if (!roomId) {
          flash('Select a room first.', 'error');
          return;
        }

        const { error: stateError } = await db.client
          .from('show_state')
          .upsert({
            room_id: roomId,
            portal_open: false,
            timer_running: false,
            event_type: 'stopped',
            current_segment: 'Override Stop',
            updated_at: new Date().toISOString()
          }, { onConflict: 'room_id' });

        if (stateError) throw stateError;

        const { error: memberError } = await db.client
          .from('room_venues')
          .update({
            is_broadcasting: false,
            status: 'connected'
          })
          .eq('room_id', roomId)
          .is('left_at', null);

        if (memberError) throw memberError;

        flash('Production override applied. All feeds stopped.');
        await refreshAll();
      } catch (err) {
        flash(err.message || 'Unable to apply override.', 'error');
      }
    });
  }

  function renderSchedulingPage() {
    renderScheduleTable();
    bindScheduleForm();
  }

  function renderScheduleTable() {
    const tbody = document.getElementById('schedule-table-body');
    if (!tbody) return;

    tbody.innerHTML = state.schedules.map(s => `
      <tr>
        <td>${esc(roomTitle(s.room_id))}</td>
        <td>${esc(s.segment_title)}</td>
        <td>${esc(s.segment_type || 'segment')}</td>
        <td>${fmt(s.starts_at)}</td>
        <td>${fmt(s.end_at)}</td>
        <td>${esc(timezoneHint(state.rooms.find(r => r.id === s.room_id) || {}))}</td>
        <td class="actions">
          <button type="button" data-edit-schedule="${s.id}">Edit</button>
          <button type="button" class="danger" data-delete-schedule="${s.id}">Delete</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7">No schedule segments found.</td></tr>';

    tbody.querySelectorAll('[data-edit-schedule]').forEach(btn => {
      btn.onclick = () => {
        const row = state.schedules.find(s => s.id === btn.dataset.editSchedule);
        const form = document.getElementById('schedule-form');
        if (!row || !form) return;

        form.dataset.editingId = row.id;
        form.room_id.value = row.room_id || '';
        form.segment_title.value = row.segment_title || '';
        form.segment_type.value = row.segment_type || 'segment';
        form.description.value = row.description || '';
        form.starts_at.value = row.starts_at ? new Date(row.starts_at).toISOString().slice(0, 16) : '';
        form.end_at.value = row.end_at ? new Date(row.end_at).toISOString().slice(0, 16) : '';
        form.sort_order.value = row.sort_order ?? 0;
        form.lead_name.value = row.lead_name || '';

        const titleEl = document.getElementById('schedule-form-title');
        if (titleEl) titleEl.textContent = 'Edit Schedule Segment';
      };
    });

    tbody.querySelectorAll('[data-delete-schedule]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this schedule segment?')) return;
        try {
          const { error } = await db.client.from('schedules').delete().eq('id', btn.dataset.deleteSchedule);
          if (error) throw error;
          flash('Schedule segment deleted.');
          await refreshAll();
        } catch (err) {
          flash(err.message || 'Unable to delete schedule segment.', 'error');
        }
      };
    });
  }

  function bindScheduleForm() {
    const form = document.getElementById('schedule-form');
    const roomSelect = document.getElementById('schedule-room-id');
    if (!form) return;

    if (roomSelect) {
      roomSelect.innerHTML =
        (ui.option ? ui.option('', 'Select room') : '<option value="">Select room</option>') +
        state.rooms.map(r =>
          ui.option
            ? ui.option(r.id, `${r.title} (${r.zone || 'Local'})`)
            : `<option value="${esc(r.id)}">${esc(r.title)}</option>`
        ).join('');
    }

    if (form.dataset.bound) return;
    form.dataset.bound = '1';

    form.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const selectedRoom = state.rooms.find(r => r.id === form.room_id.value);

        const payload = {
          room_id: form.room_id.value,
          segment_title: form.segment_title.value.trim(),
          segment_type: form.segment_type.value,
          description: form.description.value.trim() || null,
          starts_at: form.starts_at.value ? new Date(form.starts_at.value).toISOString() : null,
          end_at: form.end_at.value ? new Date(form.end_at.value).toISOString() : null,
          sort_order: Number(form.sort_order.value || 0),
          lead_name: form.lead_name.value.trim() || null,
          venue_id: selectedRoom?.venue_id || null,
        };

        if (form.dataset.editingId) {
          const { error } = await db.client.from('schedules').update(payload).eq('id', form.dataset.editingId);
          if (error) throw error;
          flash('Schedule segment updated.');
        } else {
          const { error } = await db.client.from('schedules').insert(payload);
          if (error) throw error;
          flash('Schedule segment created.');
        }

        form.reset();
        form.dataset.editingId = '';
        const titleEl = document.getElementById('schedule-form-title');
        if (titleEl) titleEl.textContent = 'Create Schedule Segment';

        await refreshAll();
      } catch (err) {
        flash(err.message || 'Unable to save schedule segment.', 'error');
      }
    });

    document.getElementById('schedule-form-reset')?.addEventListener('click', () => {
      form.reset();
      form.dataset.editingId = '';
      const titleEl = document.getElementById('schedule-form-title');
      if (titleEl) titleEl.textContent = 'Create Schedule Segment';
    });

    document.querySelectorAll('[data-quick-segment]').forEach(btn => {
      btn.addEventListener('click', () => {
        form.segment_title.value = btn.dataset.quickSegment;
        form.segment_type.value = btn.dataset.segmentType || 'segment';
      });
    });
  }

  async function boot() {
    try {
      setConnection(false, 'Connecting');
      await loadProfile();
      bindLogout();
      await refreshAll();
      setConnection(true, 'Connected');

      ['rooms', 'room_venues', 'schedules', 'patron_pulse', 'pulse_prompts', 'show_state', 'production_messages']
        .forEach(t => db.subscribe(t, refreshAll));
    } catch (err) {
      console.error(err);
      setConnection(false, 'Error');
      flash(err.message || 'Moderator live pages failed to load.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
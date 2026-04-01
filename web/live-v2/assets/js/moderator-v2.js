(function () {
  const U = window.LinkdNV2Utils;
  const C = window.LinkdNV2Client;
  const Opportunity = window.LinkdNV2OpportunityService;
  const auth = window.LiveAuth;

  const state = {
    profile: null,
    rooms: [],
    memberships: [],
    schedules: [],
    prompts: [],
    pulses: [],
    opportunities: [],
    venues: [],
    showStates: []
  };

  function roomTitle(roomId) { return state.rooms.find(r => r.id === roomId)?.title || '—'; }
  function venueName(venueId) { return state.venues.find(v => String(v.id) === String(venueId))?.name || String(venueId || '—'); }
  function roomMembers(roomId) { return state.memberships.filter(m => m.room_id === roomId && !m.left_at); }
  function livePrompt(roomId) { return state.prompts.find(p => p.room_id === roomId && p.status === 'live') || null; }
  function showState(roomId) { return state.showStates.find(s => s.room_id === roomId) || null; }

  async function load() {
    await auth.requireRole(window.LiveDB?.cfg?.moderatorRoles || ['admin','moderator','ops']);
    state.profile = await auth.getProfile();
    state.rooms = await C.select('rooms', q => q.order('created_at', { ascending: true }));
    state.memberships = await C.select('room_venues', q => q.order('joined_at', { ascending: true }));
    state.schedules = await C.select('schedules', q => q.order('starts_at', { ascending: true }));
    state.prompts = await C.select('pulse_prompts', q => q.order('created_at', { ascending: false }).limit(200));
    state.pulses = await C.select('patron_pulse', q => q.order('created_at', { ascending: false }).limit(300));
    state.opportunities = await Opportunity.listOpenOpportunities();
    state.venues = await C.select('venues', q => q.order('created_at', { ascending: true }));
    state.showStates = await C.select('show_state', q => q.order('updated_at', { ascending: false }));
    U.setText('current-user', state.profile?.display_name || state.profile?.email || '');
    document.querySelectorAll('[data-app-name]').forEach(el => el.textContent = 'Linkd’N V2');
    window.LiveUI?.setConnection?.(true, 'Connected');
  }

  function parseOptions(raw) {
    return String(raw || '').split(',').map(s => s.trim()).filter(Boolean).map((label, idx) => ({ id: String(idx + 1), option_text: label }));
  }

  function renderRooms() {
    U.setHtml('v2-mod-rooms-body', state.rooms.map(r => {
      const members = roomMembers(r.id);
      const prompt = livePrompt(r.id);
      return `
        <tr>
          <td>${U.esc(r.title)}</td>
          <td>${U.esc(r.zone || '—')}</td>
          <td>${U.esc(r.status || 'open')}</td>
          <td>${members.length}</td>
          <td>${prompt ? U.esc(prompt.cta_type || 'pulse') : '—'}</td>
          <td><button data-manage-room="${r.id}">Manage</button></td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6">No rooms found.</td></tr>');

    const select = U.byId('v2-mod-room-select');
    if (select) {
      const current = select.value;
      select.innerHTML = U.option('', 'Select room') + state.rooms.map(r => U.option(r.id, r.title, r.id === current)).join('');
      if (!select.dataset.bound) {
        select.dataset.bound = '1';
        select.addEventListener('change', () => renderRoomManage(select.value));
      }
    }

    U.byId('v2-mod-rooms-body')?.querySelectorAll('[data-manage-room]').forEach(btn => {
      btn.onclick = () => {
        if (select) select.value = btn.dataset.manageRoom;
        renderRoomManage(btn.dataset.manageRoom);
      };
    });
  }

  function renderRoomManage(roomId) {
    const room = state.rooms.find(r => r.id === roomId);
    const members = roomMembers(roomId);
    const prompt = livePrompt(roomId);
    const show = showState(roomId);
    U.setHtml('v2-mod-room-summary', room ? `
      <div><strong>Room:</strong> ${U.esc(room.title)}</div>
      <div><strong>Status:</strong> ${U.esc(room.status || 'open')}</div>
      <div><strong>Phase:</strong> ${U.esc(show?.current_segment || show?.event_type || '—')}</div>
      <div><strong>Connected Venues:</strong> ${members.length}</div>
    ` : '<div>Select a room to manage.</div>');

    U.setHtml('v2-mod-room-members', members.length ? members.map(m => `
      <tr><td>${U.esc(venueName(m.venue_id))}</td><td>${U.esc(m.status || 'connected')}</td><td>${m.is_broadcasting ? 'Live' : 'Idle'}</td><td>${U.fmt(m.joined_at)}</td></tr>
    `).join('') : '<tr><td colspan="4">No connected venues.</td></tr>');

    U.setHtml('v2-mod-room-prompt', prompt ? `
      <div><strong>Prompt:</strong> ${U.esc(prompt.prompt_text)}</div>
      <div><strong>CTA:</strong> ${U.esc(prompt.cta_type || 'vote')}</div>
      <div><strong>Status:</strong> ${U.esc(prompt.status || 'live')}</div>
      <div><strong>Ends:</strong> ${U.fmt(prompt.ends_at)}</div>
    ` : '<div>No live pulse prompt.</div>');

    const pulseForm = U.byId('v2-mod-pulse-form');
    if (pulseForm?.room_id) pulseForm.room_id.value = roomId || '';
    const showForm = U.byId('v2-mod-show-form');
    if (showForm?.room_id) showForm.room_id.value = roomId || '';
  }

  function bindPulseForm() {
    const form = U.byId('v2-mod-pulse-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';

    form.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await C.insert('pulse_prompts', {
          room_id: form.room_id.value,
          created_by: state.profile.id,
          prompt_text: form.prompt_text.value.trim(),
          prompt_type: form.prompt_type.value,
          cta_type: form.cta_type.value,
          status: 'live',
          allow_comments: !!form.allow_comments.checked,
          allow_votes: form.cta_type.value === 'vote',
          allow_hype: !!form.allow_hype.checked,
          show_results_after_close: !!form.show_results_after_close.checked,
          results_visible_until: form.results_visible_until.value ? new Date(form.results_visible_until.value).toISOString() : null,
          ends_at: form.ends_at.value ? new Date(form.ends_at.value).toISOString() : null,
          option_set_json: parseOptions(form.option_labels.value)
        });
        U.flash('Live pulse launched.');
        form.reset();
        await boot();
      } catch (err) { U.flash(err.message || 'Unable to launch pulse.', 'error'); }
    });

    U.byId('v2-mod-close-pulse')?.addEventListener('click', async () => {
      try {
        const roomId = form.room_id.value;
        const prompt = livePrompt(roomId);
        if (!prompt) throw new Error('No live pulse prompt for this room.');
        await C.update('pulse_prompts', {
          status: 'closed',
          closed_at: new Date().toISOString(),
          closed_by: state.profile.id
        }, { id: prompt.id });
        U.flash('Live pulse closed.');
        await boot();
      } catch (err) { U.flash(err.message || 'Unable to close pulse.', 'error'); }
    });
  }

  function bindShowForm() {
    const form = U.byId('v2-mod-show-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';
    form.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await C.upsert('show_state', {
          room_id: form.room_id.value,
          current_segment: form.current_segment.value.trim() || null,
          current_round: form.current_round.value.trim() || null,
          event_type: form.event_type.value.trim() || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'room_id' });
        U.flash('Show state updated.');
        await boot();
      } catch (err) { U.flash(err.message || 'Unable to update show state.', 'error'); }
    });
  }

  function renderScheduling() {
    const filter = U.byId('v2-mod-schedule-room-filter');
    if (filter) {
      const current = filter.value;
      filter.innerHTML = U.option('', 'All rooms') + state.rooms.map(r => U.option(r.id, r.title, r.id === current)).join('');
    }
    const roomId = filter?.value || '';
    const rows = roomId ? state.schedules.filter(s => s.room_id === roomId) : state.schedules;
    U.setHtml('v2-mod-schedule-body', rows.map(s => `
      <tr>
        <td>${U.esc(roomTitle(s.room_id))}</td>
        <td>${U.esc(s.segment_title || 'Segment')}</td>
        <td>${U.fmt(s.starts_at)}</td>
        <td>${U.fmt(s.end_at)}</td>
        <td>${U.esc(s.segment_type || 'segment')}</td>
      </tr>
    `).join('') || '<tr><td colspan="5">No schedule rows found.</td></tr>');

    const roomSelect = document.querySelector('#v2-mod-schedule-form [name="room_id"]');
    if (roomSelect) roomSelect.innerHTML = U.option('', 'Select room') + state.rooms.map(r => U.option(r.id, r.title)).join('');
  }

  function bindScheduleForm() {
    const form = U.byId('v2-mod-schedule-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';
    form.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await C.insert('schedules', {
          room_id: form.room_id.value,
          segment_title: form.segment_title.value.trim(),
          segment_type: form.segment_type.value.trim() || null,
          description: form.description.value.trim() || null,
          lead_name: form.lead_name.value.trim() || null,
          starts_at: form.starts_at.value ? new Date(form.starts_at.value).toISOString() : null,
          end_at: form.end_at.value ? new Date(form.end_at.value).toISOString() : null
        });
        U.flash('Schedule item created.');
        form.reset();
        await boot();
      } catch (err) { U.flash(err.message || 'Unable to save schedule item.', 'error'); }
    });
  }

  function renderOversight() {
    U.setHtml('v2-mod-overview', state.rooms.map(r => {
      const members = roomMembers(r.id);
      const prompt = livePrompt(r.id);
      return `
        <div class="v2-feed-item">
          <div><strong>${U.esc(r.title)}</strong></div>
          <div class="v2-dim">${members.length} connected • ${prompt ? `Pulse: ${U.esc(prompt.cta_type || 'live')}` : 'No live pulse'}</div>
        </div>
      `;
    }).join('') || '<div class="v2-feed-item">No room data.</div>');
  }

  function renderOpportunities() {
    U.setHtml('v2-mod-opportunities-body', state.opportunities.map(o => `
      <tr>
        <td>${U.esc(roomTitle(o.room_id))}</td>
        <td>${U.esc(venueName(o.source_venue_id))}</td>
        <td>${U.esc(venueName(o.target_venue_id))}</td>
        <td>${U.esc(o.opportunity_type || 'opportunity')}</td>
        <td>${U.esc(o.status || 'suggested')}</td>
      </tr>
    `).join('') || '<tr><td colspan="5">No opportunities yet.</td></tr>');
  }

  function bindShared() {
    U.byId('logout-button')?.addEventListener('click', async () => auth.signOut());
    U.byId('v2-mod-schedule-room-filter')?.addEventListener('change', renderScheduling);
  }

  async function boot() {
    await load();
    bindShared();

    const page = document.body.dataset.page;
    if (page === 'v2-mod-rooms') { renderRooms(); bindPulseForm(); bindShowForm(); }
    if (page === 'v2-mod-scheduling') { renderScheduling(); bindScheduleForm(); }
    if (page === 'v2-mod-oversight') renderOversight();
    if (page === 'v2-mod-opportunities') renderOpportunities();
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch(err => U.flash(err.message || 'Moderator V2 failed to load.', 'error'));
  });
})();

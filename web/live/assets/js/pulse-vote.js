(function () {
  const db = window.LiveDB;
  const ui = window.LiveUI || {};

  const state = {
    roomId: null,
    venueId: null,
    promptId: null,
    venue: null,
    room: null,
    prompt: null,
    pulseRows: [],
    comments: [],
    verified: false,
    presenceSessionId: null,
    timerHandle: null,
  };

  function esc(v) {
    return ui.esc ? ui.esc(v) : String(v ?? '');
  }

  function fmt(v) {
    if (ui.fmtDate) return ui.fmtDate(v);
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  function qs() {
    return new URLSearchParams(window.location.search);
  }

  function formatSeconds(total) {
    const safe = Math.max(0, Number(total || 0));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function getGuestSessionKey() {
    return `linkdn_guest_presence_${state.venueId || 'unknown'}`;
  }

  function getVoteSessionKey(promptId) {
    return `linkdn_vote_${promptId}`;
  }

  function getStoredPresence() {
    try {
      return JSON.parse(localStorage.getItem(getGuestSessionKey()) || 'null');
    } catch (_) {
      return null;
    }
  }

  function storePresence(data) {
    localStorage.setItem(getGuestSessionKey(), JSON.stringify(data));
  }

  function markPromptVoted(promptId) {
    sessionStorage.setItem(getVoteSessionKey(promptId), '1');
  }

  function hasPromptVoted(promptId) {
    return sessionStorage.getItem(getVoteSessionKey(promptId)) === '1';
  }

  function showNotice(text, isError = false) {
    const el = document.getElementById('pv-notice');
    if (!el) return;
    el.textContent = text;
    el.style.background = isError ? '#7f1d1d' : '#1e293b';
  }

  function readParams() {
    const p = qs();
    state.roomId = p.get('room') || '';
    state.venueId = p.get('venue') || '';
    state.promptId = p.get('prompt') || '';
  }

  async function loadCore() {
    const venueRes = state.venueId
      ? await db.client.from('venues').select('*').eq('id', state.venueId).maybeSingle()
      : { data: null, error: null };

    const roomRes = state.roomId
      ? await db.client.from('rooms').select('*').eq('id', state.roomId).maybeSingle()
      : { data: null, error: null };

    if (venueRes.error) throw venueRes.error;
    if (roomRes.error) throw roomRes.error;

    state.venue = venueRes.data || null;
    state.room = roomRes.data || null;

    const promptQuery = db.client
      .from('pulse_prompts')
      .select('*')
      .eq('room_id', state.roomId)
      .eq('status', 'live')
      .order('created_at', { ascending: false })
      .limit(1);

    const pulseQuery = db.client
      .from('patron_pulse')
      .select('*')
      .eq('room_id', state.roomId)
      .order('created_at', { ascending: false })
      .limit(50);

    const [promptRes, pulseRes] = await Promise.all([promptQuery.maybeSingle(), pulseQuery]);

    if (promptRes.error) throw promptRes.error;
    if (pulseRes.error) throw pulseRes.error;

    state.prompt = promptRes.data || null;
    state.pulseRows = pulseRes.data || [];

    if (!state.promptId && state.prompt?.id) {
      state.promptId = state.prompt.id;
    }
  }

  function renderHeader() {
    const venueName = document.getElementById('pv-venue-name');
    const roomName = document.getElementById('pv-room-name');
    const phase = document.getElementById('pv-phase');

    if (venueName) venueName.textContent = state.venue?.name || 'Venue';
    if (roomName) roomName.textContent = state.room?.title || 'Room';
    if (phase) phase.textContent = state.prompt?.prompt_type || 'Waiting';
  }

  function renderPrompt() {
    const textEl = document.getElementById('pv-prompt-text');
    const metaEl = document.getElementById('pv-prompt-meta');

    if (textEl) textEl.textContent = state.prompt?.prompt_text || 'No active pulse prompt.';
    if (metaEl) {
      metaEl.textContent = state.prompt
        ? `${state.prompt.prompt_type || 'vote'} • ${state.prompt.status || 'live'}`
        : 'Waiting for live pulse…';
    }

    renderTimer();
  }

  function renderTimer() {
    const timerEl = document.getElementById('pv-timer');
    if (!timerEl) return;

    if (state.timerHandle) {
      clearInterval(state.timerHandle);
      state.timerHandle = null;
    }

    if (!state.prompt?.ends_at) {
      timerEl.textContent = '—';
      return;
    }

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(state.prompt.ends_at).getTime() - Date.now()) / 1000)
      );
      timerEl.textContent = formatSeconds(remaining);
      if (remaining <= 0 && state.timerHandle) {
        clearInterval(state.timerHandle);
        state.timerHandle = null;
      }
    };

    tick();
    state.timerHandle = setInterval(tick, 1000);
  }

  function renderVoteActions() {
    const host = document.getElementById('pv-vote-actions');
    const status = document.getElementById('pv-vote-status');
    if (!host) return;

    const locked = !state.verified;
    const voted = state.promptId ? hasPromptVoted(state.promptId) : false;

    if (status) {
      if (locked) {
        status.textContent = 'Verify presence at the venue before voting.';
      } else if (voted) {
        status.textContent = 'You already voted in this pulse during this session.';
      } else {
        status.textContent = 'Vote once per pulse per verified session.';
      }
    }

    const defaultOptions = ['Venue A', 'Venue B', 'Freestyle', 'Dance Battle'];

    host.innerHTML = defaultOptions.map((label, idx) => `
      <button
        class="vote-btn"
        data-vote="${idx + 1}"
        ${locked || voted ? 'disabled' : ''}
        type="button"
      >
        ${esc(label)}
      </button>
    `).join('');

    host.querySelectorAll('[data-vote]').forEach(btn => {
      btn.onclick = async () => {
        try {
          if (!state.verified) throw new Error('Presence not verified.');
          if (!state.promptId) throw new Error('No active pulse prompt.');
          if (hasPromptVoted(state.promptId)) throw new Error('You already voted in this pulse.');

          // Placeholder for backend-enforced vote insert later
          markPromptVoted(state.promptId);
          renderVoteActions();
          showNotice('Vote received.');
        } catch (err) {
          showNotice(err.message || 'Vote failed.', true);
        }
      };
    });
  }

  function renderHype() {
    const host = document.getElementById('pv-hype-stats');
    if (!host) return;

    const venueRows = state.pulseRows.filter(p => String(p.venue_id) === String(state.venueId));
    const roomRows = state.pulseRows.filter(p => String(p.room_id) === String(state.roomId));

    const avg = (rows, key) =>
      rows.length ? Math.round(rows.reduce((a, b) => a + Number(b[key] || 0), 0) / rows.length) : 0;

    const venueHype = avg(venueRows, 'energy_level');
    const roomHype = avg(roomRows, 'pulse_score');
    const cityHype = venueHype;

    host.innerHTML = `
      <div class="mini-stat"><strong>${venueHype}%</strong><span>Venue</span></div>
      <div class="mini-stat"><strong>${roomHype}%</strong><span>Room</span></div>
      <div class="mini-stat"><strong>${cityHype}%</strong><span>City</span></div>
    `;
  }

  function renderComments() {
    const host = document.getElementById('pv-comments');
    if (!host) return;

    host.innerHTML = `
      <div class="comment-item">
        Comments will appear here once comment storage is connected.
      </div>
    `;
  }

  function renderOtherPulses() {
    const host = document.getElementById('pv-other-pulses');
    if (!host) return;

    const items = state.pulseRows.slice(0, 5);
    host.innerHTML = items.length
      ? items.map(p => `
          <div class="comment-item">
            <strong>Pulse:</strong> ${esc(p.pulse_score)} |
            <strong>Energy:</strong> ${esc(p.energy_level)} |
            <strong>Crowd:</strong> ${esc(p.crowd_count)}
            <div class="comment-time">${fmt(p.created_at)}</div>
          </div>
        `).join('')
      : `<div class="comment-item">No additional pulse data yet.</div>`;
  }

  function bindCommentSubmit() {
    const btn = document.getElementById('pv-comment-submit');
    const input = document.getElementById('pv-comment-input');
    if (!btn || !input) return;

    btn.onclick = async () => {
      try {
        if (!state.verified) throw new Error('Verify presence before commenting.');
        if (!input.value.trim()) throw new Error('Enter a comment first.');

        // Placeholder until pulse_comments table + insert policy is live
        input.value = '';
        showNotice('Comment received.');
      } catch (err) {
        showNotice(err.message || 'Comment failed.', true);
      }
    };
  }

  function bindDjRequestSubmit() {
    const btn = document.getElementById('pv-dj-request-submit');
    const input = document.getElementById('pv-dj-request-input');
    if (!btn || !input) return;

    btn.onclick = async () => {
      try {
        if (!state.verified) throw new Error('Verify presence before sending DJ requests.');
        if (!input.value.trim()) throw new Error('Enter a request first.');

        // Placeholder until dj_requests table + insert policy is live
        input.value = '';
        showNotice('DJ request received.');
      } catch (err) {
        showNotice(err.message || 'DJ request failed.', true);
      }
    };
  }

  function evaluatePresence() {
    const stored = getStoredPresence();
    const statusEl = document.getElementById('pv-checkin-status');

    const valid =
      stored &&
      String(stored.venueId) === String(state.venueId) &&
      stored.expiresAt &&
      new Date(stored.expiresAt).getTime() > Date.now();

    state.verified = !!valid;
    state.presenceSessionId = valid ? stored.presenceSessionId || null : null;

    if (statusEl) {
      statusEl.textContent = valid ? 'Venue verified' : 'Venue verification required';
    }

    if (!valid) {
      const nextUrl = `${location.origin}/public/pulse-checkin.html?room=${encodeURIComponent(state.roomId || '')}&venue=${encodeURIComponent(state.venueId || '')}${state.promptId ? `&prompt=${encodeURIComponent(state.promptId)}` : ''}`;
      showNotice(`You must verify you’re at the venue before voting, commenting, or sending DJ requests. Go to: ${nextUrl}`, true);
    } else {
      showNotice('Verified at venue. You can participate in this live pulse.');
    }
  }

  async function bootVotePage() {
    readParams();
    await loadCore();
    renderHeader();
    evaluatePresence();
    renderPrompt();
    renderVoteActions();
    renderHype();
    renderComments();
    renderOtherPulses();
    bindCommentSubmit();
    bindDjRequestSubmit();
  }

  function bootCheckinPage() {
    const submit = document.getElementById('pc-submit');
    const input = document.getElementById('pc-code');
    const status = document.getElementById('pc-status');
    if (!submit || !input || !status) return;

    const params = qs();
    const roomId = params.get('room') || '';
    const venueId = params.get('venue') || '';
    const promptId = params.get('prompt') || '';

    submit.onclick = async () => {
      const code = input.value.trim();
      if (!code) {
        status.textContent = 'Enter a code first.';
        return;
      }

      // Placeholder verification logic.
      // Replace this with backend token/code validation.
      if (code.length < 4) {
        status.textContent = 'Code is invalid.';
        return;
      }

      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      storePresence({
        venueId,
        roomId,
        promptId,
        codeUsed: code,
        expiresAt,
        presenceSessionId: `local-${Date.now()}`
      });

      status.textContent = 'Presence verified. Redirecting…';

      const nextUrl = `${location.origin}/public/pulse-vote.html?room=${encodeURIComponent(roomId)}&venue=${encodeURIComponent(venueId)}${promptId ? `&prompt=${encodeURIComponent(promptId)}` : ''}`;
      window.location.href = nextUrl;
    };
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (document.body.dataset.publicPage === 'pulse-checkin') {
        bootCheckinPage();
        return;
      }

      await bootVotePage();
    } catch (err) {
      showNotice(err.message || 'Public pulse page failed to load.', true);
    }
  });
})();
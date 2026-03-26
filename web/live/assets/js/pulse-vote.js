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
    lastClosedPrompt: null,
    pulseRows: [],
    comments: [],
    question: null,
    questionAnswers: [],
    verified: false,
    presenceSessionId: null,
    presenceSessionToken: null,
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

  function getGuestSessionKey(venueId = null) {
    return `linkdn_guest_presence_${venueId || state.venueId || 'unknown'}`;
  }

  function getVoteSessionKey(promptId) {
    return `linkdn_vote_${promptId}`;
  }

  function getQuestionSessionKey(questionId) {
    return `linkdn_question_${questionId}`;
  }

  function getStoredPresence(venueId = null) {
    try {
      return JSON.parse(localStorage.getItem(getGuestSessionKey(venueId)) || 'null');
    } catch (_) {
      return null;
    }
  }

  function storePresence(data) {
    localStorage.setItem(getGuestSessionKey(data?.venueId), JSON.stringify(data));
  }

  function clearPresence() {
    localStorage.removeItem(getGuestSessionKey());
  }

  function markPromptVoted(promptId) {
    if (!promptId) return;
    sessionStorage.setItem(getVoteSessionKey(promptId), '1');
  }

  function hasPromptVoted(promptId) {
    if (!promptId) return false;
    return sessionStorage.getItem(getVoteSessionKey(promptId)) === '1';
  }

  function markQuestionAnswered(questionId) {
    if (!questionId) return;
    sessionStorage.setItem(getQuestionSessionKey(questionId), '1');
  }

  function hasQuestionAnswered(questionId) {
    if (!questionId) return false;
    return sessionStorage.getItem(getQuestionSessionKey(questionId)) === '1';
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

  function randomGuestSessionToken() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function nowMs() {
    return Date.now();
  }

  function isPromptLive(prompt) {
    if (!prompt) return false;
    if (prompt.status !== 'live') return false;
    if (prompt.ends_at && new Date(prompt.ends_at).getTime() <= nowMs()) return false;
    return true;
  }

  function getPromptOptions(prompt) {
    if (!prompt) return [];
    if (Array.isArray(prompt.option_set_json)) return prompt.option_set_json;
    if (typeof prompt.option_set_json === 'string') {
      try {
        const parsed = JSON.parse(prompt.option_set_json);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  }

  async function loadCheckinContext() {
    const params = qs();
    const roomId = params.get('room') || '';
    const venueId = params.get('venue') || '';

    let venue = null;
    let room = null;

    if (venueId) {
      const venueRes = await db.client.from('venues').select('*').eq('id', venueId).maybeSingle();
      if (venueRes.error) throw venueRes.error;
      venue = venueRes.data || null;
    }

    if (roomId) {
      const roomRes = await db.client.from('rooms').select('*').eq('id', roomId).maybeSingle();
      if (roomRes.error) throw roomRes.error;
      room = roomRes.data || null;
    }

    return { venue, room };
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

    const closedPromptQuery = db.client
      .from('pulse_prompts')
      .select('*')
      .eq('room_id', state.roomId)
      .eq('status', 'closed')
      .eq('show_results_after_close', true)
      .order('closed_at', { ascending: false })
      .limit(1);

    const pulseQuery = db.client
      .from('patron_pulse')
      .select('*')
      .eq('room_id', state.roomId)
      .order('created_at', { ascending: false })
      .limit(150);

    const commentsQuery = db.client
      .from('pulse_comments')
      .select('*')
      .eq('room_id', state.roomId)
      .order('created_at', { ascending: false })
      .limit(50);

    const questionQuery = db.client
      .from('general_questions')
      .select('*')
      .eq('is_active', true)
      .or(`room_id.eq.${state.roomId},venue_id.eq.${state.venueId}`)
      .order('created_at', { ascending: false })
      .limit(1);

    const [promptRes, closedPromptRes, pulseRes, commentsRes, questionRes] = await Promise.all([
      promptQuery.maybeSingle(),
      closedPromptQuery.maybeSingle(),
      pulseQuery,
      commentsQuery,
      questionQuery.maybeSingle()
    ]);

    if (promptRes.error) throw promptRes.error;
    if (closedPromptRes.error) throw closedPromptRes.error;
    if (pulseRes.error) throw pulseRes.error;
    if (commentsRes.error) throw commentsRes.error;

    state.prompt = promptRes.data || null;
    state.lastClosedPrompt = closedPromptRes.data || null;
    state.pulseRows = pulseRes.data || [];
    state.comments = commentsRes.data || [];

    if (questionRes.error) {
      console.warn('general_questions lookup failed:', questionRes.error);
      state.question = null;
    } else {
      state.question = questionRes.data || null;
    }

    if (!state.promptId && state.prompt?.id) {
      state.promptId = state.prompt.id;
    }

    if (state.question?.id) {
      const questionOptionsRes = await db.client
        .from('general_question_options')
        .select('*')
        .eq('question_id', state.question.id)
        .order('sort_order', { ascending: true });

      if (!questionOptionsRes.error) {
        state.questionAnswers = questionOptionsRes.data || [];
      } else {
        state.questionAnswers = [];
      }
    } else {
      state.questionAnswers = [];
    }
  }

  function renderHeader() {
    const venueName = document.getElementById('pv-venue-name');
    const roomName = document.getElementById('pv-room-name');
    const phase = document.getElementById('pv-phase');
    const sessionExpiry = document.getElementById('pv-session-expiry');

    if (venueName) venueName.textContent = state.venue?.name || 'Venue';
    if (roomName) roomName.textContent = state.room?.title || 'Room';
    if (phase) phase.textContent = state.prompt?.prompt_type || state.lastClosedPrompt?.prompt_type || 'Waiting';

    const stored = getStoredPresence(state.venueId);
    if (sessionExpiry) {
      if (stored?.expiresAt) {
        sessionExpiry.textContent = `Session until ${new Date(stored.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      } else {
        sessionExpiry.textContent = 'Session inactive';
      }
    }
  }

  function renderTimer() {
    const timerEl = document.getElementById('pv-timer');
    if (!timerEl) return;

    if (state.timerHandle) {
      clearInterval(state.timerHandle);
      state.timerHandle = null;
    }

    if (!isPromptLive(state.prompt) || !state.prompt?.ends_at) {
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
        renderPromptShell();
      }
    };

    tick();
    state.timerHandle = setInterval(tick, 1000);
  }

  function renderPromptShell() {
    const textEl = document.getElementById('pv-prompt-text');
    const metaEl = document.getElementById('pv-prompt-meta');
    const resultsWrap = document.getElementById('pv-last-results');
    const resultsBody = document.getElementById('pv-last-results-body');

    if (isPromptLive(state.prompt)) {
      if (textEl) textEl.textContent = state.prompt?.prompt_text || 'Live pulse';
      if (metaEl) metaEl.textContent = `${state.prompt?.cta_type || state.prompt?.prompt_type || 'pulse'} • live`;
      if (resultsWrap) resultsWrap.classList.add('hidden');
      renderTimer();
      renderPulseCta();
      return;
    }

    if (state.lastClosedPrompt && state.lastClosedPrompt.show_results_after_close) {
      if (textEl) textEl.textContent = 'Latest Pulse Closed';
      if (metaEl) metaEl.textContent = state.lastClosedPrompt.prompt_text || 'Results visible after close';
      if (resultsWrap) resultsWrap.classList.remove('hidden');
      if (resultsBody) {
        resultsBody.innerHTML = `
          <div class="feed-item">
            <div><strong>Prompt:</strong> ${esc(state.lastClosedPrompt.prompt_text || 'Pulse')}</div>
            <div class="feed-time">Closed ${fmt(state.lastClosedPrompt.closed_at || state.lastClosedPrompt.updated_at || state.lastClosedPrompt.created_at)}</div>
          </div>
        `;
      }
      document.getElementById('pv-pulse-cta-wrap')?.classList.add('hidden');
      if (textEl) document.getElementById('pv-timer').textContent = '—';
      return;
    }

    if (textEl) textEl.textContent = 'No active pulse prompt.';
    if (metaEl) metaEl.textContent = 'Waiting for the next live pulse…';
    document.getElementById('pv-pulse-cta-wrap')?.classList.add('hidden');
    if (resultsWrap) resultsWrap.classList.add('hidden');
    renderTimer();
  }

  function renderPulseCta() {
    const wrap = document.getElementById('pv-pulse-cta-wrap');
    const status = document.getElementById('pv-pulse-cta-status');
    const host = document.getElementById('pv-pulse-cta-actions');
    if (!wrap || !status || !host) return;

    if (!isPromptLive(state.prompt)) {
      wrap.classList.add('hidden');
      host.innerHTML = '';
      status.textContent = '';
      return;
    }

    wrap.classList.remove('hidden');

    const ctaType = String(state.prompt.cta_type || state.prompt.prompt_type || 'vote').toLowerCase();
    const locked = !state.verified;
    const responded = state.promptId ? hasPromptVoted(state.promptId) : false;

    if (ctaType === 'comment') {
      status.textContent = locked ? 'Verify presence before responding.' : (responded ? 'You already responded to this pulse.' : 'Comment on this pulse while it is live.');
      host.innerHTML = `
        <div class="pulse-cta-wrap">
          <textarea id="pv-live-comment-input" rows="3" placeholder="Respond to the live pulse..." ${locked || responded ? 'disabled' : ''}></textarea>
          <button id="pv-live-comment-submit" class="btn primary" ${locked || responded ? 'disabled' : ''} type="button">Send Live Comment</button>
        </div>
      `;

      document.getElementById('pv-live-comment-submit')?.addEventListener('click', async () => {
        const input = document.getElementById('pv-live-comment-input');
        if (!input?.value.trim()) return showNotice('Enter a comment first.', true);

        try {
          const { error } = await db.client.from('pulse_comments').insert({
            prompt_id: state.promptId || null,
            venue_id: state.venueId,
            room_id: state.roomId || null,
            presence_session_id: state.presenceSessionId,
            body: input.value.trim()
          });
          if (error) throw error;

          markPromptVoted(state.promptId);
          input.value = '';
          await loadCore();
          renderComments();
          renderPromptShell();
          showNotice('Live pulse comment received.');
        } catch (err) {
          showNotice(err.message || 'Unable to post live pulse comment.', true);
        }
      });

      return;
    }

    if (ctaType === 'yell') {
      status.textContent = locked ? 'Verify presence before responding.' : (responded ? 'You already responded to this pulse.' : 'Send a quick crowd reaction before the timer ends.');
      host.innerHTML = `
        <div class="pulse-cta-wrap">
          <button class="pulse-cta-btn" data-yell="crowd_erupting" ${locked || responded ? 'disabled' : ''} type="button">Crowd Going Crazy</button>
          <button class="pulse-cta-btn" data-yell="run_it_back" ${locked || responded ? 'disabled' : ''} type="button">Run It Back</button>
          <button class="pulse-cta-btn" data-yell="venue_takeover" ${locked || responded ? 'disabled' : ''} type="button">Our Venue Taking Over</button>
        </div>
      `;

      host.querySelectorAll('[data-yell]').forEach(btn => {
        btn.onclick = async () => {
          try {
            const yellType = btn.dataset.yell;
            let pulseScore = 90;
            let energyLevel = 10;

            if (yellType === 'run_it_back') {
              pulseScore = 85;
              energyLevel = 9;
            }

            const { error } = await db.client.from('patron_pulse').insert({
              venue_id: String(state.venueId),
              room_id: state.roomId || null,
              presence_session_id: state.presenceSessionId,
              pulse_score: pulseScore,
              crowd_count: 1,
              energy_level: energyLevel,
              source: 'guest',
              notes: yellType
            });

            if (error) throw error;

            markPromptVoted(state.promptId);
            await loadCore();
            renderTonightStats();
            renderStandings();
            renderPromptShell();
            showNotice('Crowd response sent.');
          } catch (err) {
            showNotice(err.message || 'Unable to send crowd response.', true);
          }
        };
      });

      return;
    }

    const promptOptions = getPromptOptions(state.prompt);
    const options = promptOptions.length
      ? promptOptions.map((opt, idx) => ({
          id: opt.id || String(idx + 1),
          label: opt.option_text || opt.label || String(opt)
        }))
      : [
          { id: '1', label: 'Venue A' },
          { id: '2', label: 'Venue B' },
          { id: '3', label: 'Freestyle' },
          { id: '4', label: 'Dance Battle' }
        ];

    status.textContent = locked
      ? 'Verify presence before voting.'
      : (responded ? 'You already responded to this pulse.' : 'Respond before the timer ends.');

    host.innerHTML = options.map(opt => `
      <button
        class="pulse-cta-btn"
        data-vote="${esc(opt.id)}"
        ${locked || responded ? 'disabled' : ''}
        type="button"
      >
        ${esc(opt.label)}
      </button>
    `).join('');

    host.querySelectorAll('[data-vote]').forEach(btn => {
      btn.onclick = async () => {
        try {
          if (!state.verified) throw new Error('Presence not verified.');
          if (!state.promptId) throw new Error('No active pulse prompt.');
          if (!state.presenceSessionId) throw new Error('No verified guest session found.');
          if (hasPromptVoted(state.promptId)) throw new Error('You already voted in this pulse.');

          const optionId = btn.dataset.vote;

          const { error } = await db.client.from('patron_votes').insert({
            prompt_id: state.promptId,
            poll_id: state.promptId,
            option_id: optionId,
            voter_session_id: state.presenceSessionToken || state.presenceSessionId,
            presence_session_id: state.presenceSessionId
          });

          if (error) throw error;

          markPromptVoted(state.promptId);
          renderPromptShell();
          showNotice('Pulse response received.');
        } catch (err) {
          showNotice(err.message || 'Pulse response failed.', true);
        }
      };
    });
  }

  function serviceDayStartMs(resetTime = '08:30:00') {
    const now = new Date();
    const [h, m, s] = resetTime.split(':').map(n => Number(n || 0));
    const start = new Date(now);
    start.setHours(h, m, s || 0, 0);

    if (now.getTime() < start.getTime()) {
      start.setDate(start.getDate() - 1);
    }
    return start.getTime();
  }

  function tonightRows(rows) {
    const resetTime = state.venue?.reset_time_local || '08:30:00';
    const boundary = serviceDayStartMs(resetTime);
    return rows.filter(r => new Date(r.created_at).getTime() >= boundary);
  }

  function averageValue(rows, key) {
    return rows.length
      ? Math.round(rows.reduce((a, b) => a + Number(b[key] || 0), 0) / rows.length)
      : 0;
  }

  function renderTonightStats() {
    const host = document.getElementById('pv-tonight-stats');
    if (!host) return;

    const tonight = tonightRows(state.pulseRows);
    const venueRows = tonight.filter(p => String(p.venue_id) === String(state.venueId));
    const roomRows = tonight.filter(p => String(p.room_id) === String(state.roomId));

    const venueTonight = averageValue(venueRows, 'energy_level');
    const roomTonight = averageValue(roomRows, 'pulse_score');
    const cityTonight = venueTonight;

    host.innerHTML = `
      <div class="stat"><strong>${venueTonight}%</strong><span>Venue Tonight</span></div>
      <div class="stat"><strong>${roomTonight}%</strong><span>Room Tonight</span></div>
      <div class="stat"><strong>${cityTonight}%</strong><span>City Tonight</span></div>
    `;
  }

  function renderAverageStats() {
    const host = document.getElementById('pv-average-stats');
    if (!host) return;

    const venueRows = state.pulseRows.filter(p => String(p.venue_id) === String(state.venueId));
    const roomRows = state.pulseRows.filter(p => String(p.room_id) === String(state.roomId));

    const venueAvg = averageValue(venueRows, 'energy_level');
    const roomAvg = averageValue(roomRows, 'pulse_score');
    const cityAvg = venueAvg;

    host.innerHTML = `
      <div class="stat"><strong>${venueAvg}%</strong><span>Venue Average</span></div>
      <div class="stat"><strong>${roomAvg}%</strong><span>Room Average</span></div>
      <div class="stat"><strong>${cityAvg}%</strong><span>City Average</span></div>
    `;
  }

  function computeStandings() {
    const tonight = tonightRows(state.pulseRows);
    const venueMap = new Map();

    for (const row of tonight) {
      const key = String(row.venue_id || '');
      if (!key) continue;

      if (!venueMap.has(key)) {
        venueMap.set(key, {
          venue_id: key,
          venue_name: key === String(state.venueId) ? (state.venue?.name || 'Your Venue') : key,
          score: 0,
          entries: 0,
        });
      }

      const item = venueMap.get(key);
      item.score += Number(row.pulse_score || 0) + Number(row.energy_level || 0);
      item.entries += 1;
    }

    return Array.from(venueMap.values())
      .sort((a, b) => b.score - a.score)
      .map((row, idx) => ({ ...row, rank: idx + 1 }));
  }

  function renderStandings() {
    const host = document.getElementById('pv-standings');
    if (!host) return;

    const standings = computeStandings();
    const maxScore = Math.max(...standings.map(s => s.score), 1);

    host.innerHTML = standings.length
      ? standings.map(row => `
          <div class="standing-item">
            <div class="standing-top">
              <div>
                <div class="standing-rank">#${row.rank}</div>
                <div>${esc(row.venue_name)}</div>
              </div>
              <div>${row.score} pts</div>
            </div>
            <div class="bar">
              <div style="width:${Math.max(6, Math.round((row.score / maxScore) * 100))}%"></div>
            </div>
            <div class="feed-time">${row.entries} tonight</div>
          </div>
        `).join('')
      : `<div class="standing-item">Tonight’s standings will appear as venues interact.</div>`;
  }

  function renderComments() {
    const host = document.getElementById('pv-comments');
    if (!host) return;

    const tonight = tonightRows(state.comments);

    host.innerHTML = tonight.length
      ? tonight.map(c => `
          <div class="feed-item">
            <div>${esc(c.body || c.comment || '')}</div>
            <div class="feed-time">${fmt(c.created_at)}</div>
          </div>
        `).join('')
      : `<div class="feed-item">No comments yet tonight.</div>`;
  }

  function renderQuestions() {
    const textEl = document.getElementById('pv-question-text');
    const metaEl = document.getElementById('pv-question-meta');
    const host = document.getElementById('pv-question-actions');
    if (!textEl || !metaEl || !host) return;

    const locked = !state.verified;
    const answered = state.question?.id ? hasQuestionAnswered(state.question.id) : false;

    if (!state.question) {
      textEl.textContent = 'No general question right now.';
      metaEl.textContent = 'System, venue, and room prompts can appear here.';
      host.innerHTML = `<button class="question-btn" disabled>No answer choices yet</button>`;
      return;
    }

    textEl.textContent = state.question.question_text || state.question.title || 'Question';
    metaEl.textContent = answered
      ? 'You already answered this question in this session.'
      : 'Quick response to keep the room interactive.';

    const options = state.questionAnswers.length
      ? state.questionAnswers
      : [
          { id: '1', label: 'Yes' },
          { id: '2', label: 'No' },
          { id: '3', label: 'Maybe' }
        ];

    host.innerHTML = options.map(opt => `
      <button
        class="question-btn"
        data-question-option="${esc(opt.id)}"
        ${locked || answered ? 'disabled' : ''}
        type="button"
      >
        ${esc(opt.option_text || opt.label || opt.id)}
      </button>
    `).join('');

    host.querySelectorAll('[data-question-option]').forEach(btn => {
      btn.onclick = async () => {
        try {
          if (!state.verified) throw new Error('Verify presence before answering questions.');
          if (!state.question?.id) throw new Error('No active question.');
          if (answered || hasQuestionAnswered(state.question.id)) throw new Error('Already answered.');

          const optionId = btn.dataset.questionOption;

          const { error } = await db.client.from('general_question_answers').insert({
            question_id: state.question.id,
            option_id: optionId,
            venue_id: state.venueId,
            room_id: state.roomId || null,
            presence_session_id: state.presenceSessionId
          });

          if (error) throw error;

          markQuestionAnswered(state.question.id);
          await loadCore();
          renderQuestions();
          showNotice('Answer recorded.');
        } catch (err) {
          showNotice(err.message || 'Question answer failed.', true);
        }
      };
    });
  }

  async function submitQuickPulse(kind) {
    try {
      if (!state.verified) throw new Error('Verify presence first.');
      if (!state.presenceSessionId) throw new Error('No verified guest session.');

      let pulseScore = 80;
      let energyLevel = 8;
      let crowdCount = 1;
      let notes = kind;

      if (kind === 'boost') {
        pulseScore = 95;
        energyLevel = 10;
      }
      if (kind === 'run_it_back') {
        pulseScore = 88;
        energyLevel = 9;
      }

      const { error } = await db.client.from('patron_pulse').insert({
        venue_id: String(state.venueId),
        room_id: state.roomId || null,
        presence_session_id: state.presenceSessionId,
        pulse_score: pulseScore,
        crowd_count: crowdCount,
        energy_level: energyLevel,
        source: 'guest',
        notes
      });

      if (error) throw error;

      await loadCore();
      renderTonightStats();
      renderAverageStats();
      renderStandings();
      showNotice(kind === 'boost' ? 'Venue boost sent.' : 'Run-it-back pulse sent.');
    } catch (err) {
      showNotice(err.message || 'Unable to send quick pulse.', true);
    }
  }

  function bindCommentSubmit() {
    const btn = document.getElementById('pv-comment-submit');
    const input = document.getElementById('pv-comment-input');
    if (!btn || !input) return;

    btn.onclick = async () => {
      try {
        if (!state.verified) throw new Error('Verify presence before commenting.');
        if (!input.value.trim()) throw new Error('Enter a comment first.');
        if (!state.presenceSessionId) throw new Error('No verified guest session found.');

        const { error } = await db.client.from('pulse_comments').insert({
          prompt_id: state.promptId || null,
          venue_id: state.venueId,
          room_id: state.roomId || null,
          presence_session_id: state.presenceSessionId,
          body: input.value.trim()
        });

        if (error) throw error;

        input.value = '';
        await loadCore();
        renderComments();
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
        if (!state.presenceSessionId) throw new Error('No verified guest session found.');

        const { error } = await db.client.from('dj_requests').insert({
          venue_id: state.venueId,
          room_id: state.roomId || null,
          presence_session_id: state.presenceSessionId,
          request_text: input.value.trim()
        });

        if (error) throw error;

        input.value = '';
        await loadCore();
        showNotice('DJ request received.');
      } catch (err) {
        showNotice(err.message || 'DJ request failed.', true);
      }
    };
  }

  function evaluatePresence() {
    const stored = getStoredPresence(state.venueId);
    const statusEl = document.getElementById('pv-checkin-status');

    const valid =
      stored &&
      String(stored.venueId) === String(state.venueId) &&
      stored.expiresAt &&
      new Date(stored.expiresAt).getTime() > Date.now();

    state.verified = !!valid;
    state.presenceSessionId = valid ? stored.presenceSessionId || null : null;
    state.presenceSessionToken = valid ? stored.sessionToken || null : null;

    if (statusEl) {
      statusEl.textContent = valid ? 'Venue verified' : 'Venue verification required';
    }

    if (!valid) {
      clearPresence();
      const nextUrl = `${location.origin}/public/pulse-checkin.html?room=${encodeURIComponent(state.roomId || '')}&venue=${encodeURIComponent(state.venueId || '')}${state.promptId ? `&prompt=${encodeURIComponent(state.promptId)}` : ''}`;
      window.location.href = nextUrl;
      return false;
    }

    showNotice('Verified at venue. You can participate in tonight’s live experience.');
    return true;
  }

  function leaveVenueSession() {
    try {
      clearPresence();
      if (state.promptId) sessionStorage.removeItem(getVoteSessionKey(state.promptId));
      if (state.question?.id) sessionStorage.removeItem(getQuestionSessionKey(state.question.id));

      window.location.href = `${location.origin}/public/pulse-checkin.html?room=${encodeURIComponent(state.roomId || '')}&venue=${encodeURIComponent(state.venueId || '')}${state.promptId ? `&prompt=${encodeURIComponent(state.promptId)}` : ''}`;
    } catch (err) {
      showNotice(err.message || 'Unable to leave venue session.', true);
    }
  }

  function bindMobileActions() {
    document.getElementById('pv-leave-session')?.addEventListener('click', leaveVenueSession);
    document.getElementById('pv-hype-boost')?.addEventListener('click', () => submitQuickPulse('boost'));
    document.getElementById('pv-run-it-back')?.addEventListener('click', () => submitQuickPulse('run_it_back'));

    document.getElementById('pv-scroll-live')?.addEventListener('click', () => {
      document.getElementById('pv-live-now-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('pv-scroll-social')?.addEventListener('click', () => {
      document.getElementById('pv-social-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('pv-scroll-questions')?.addEventListener('click', () => {
      document.getElementById('pv-questions-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function bootVotePage() {
    readParams();
    await loadCore();
    renderHeader();

    const ok = evaluatePresence();
    if (!ok) return;

    renderPromptShell();
    renderTonightStats();
    renderAverageStats();
    renderStandings();
    renderComments();
    renderQuestions();
    bindCommentSubmit();
    bindDjRequestSubmit();
    bindMobileActions();
  }

  async function bootCheckinPage() {
    const submit = document.getElementById('pc-submit');
    const input = document.getElementById('pc-code');
    const status = document.getElementById('pc-status');
    if (!submit || !input || !status) return;

    const params = qs();
    const roomId = params.get('room') || '';
    const venueId = params.get('venue') || '';
    const promptId = params.get('prompt') || '';

    state.roomId = roomId;
    state.venueId = venueId;
    state.promptId = promptId;

    try {
      const ctx = await loadCheckinContext();
      if (ctx.venue || ctx.room) {
        status.innerHTML = `
          <div><strong>Venue:</strong> ${esc(ctx.venue?.name || 'Unknown')}</div>
          <div><strong>Room:</strong> ${esc(ctx.room?.title || 'Unknown')}</div>
          <div style="margin-top:8px;">Enter the venue code shown on screen.</div>
        `;
      }
    } catch (err) {
      status.textContent = err.message || 'Unable to load venue details.';
    }

    submit.onclick = async () => {
      const code = input.value.trim().toUpperCase();

      if (!venueId) {
        status.textContent = 'Missing venue in QR/check-in link.';
        return;
      }

      if (!code) {
        status.textContent = 'Enter a code first.';
        return;
      }

      submit.disabled = true;

      try {
        const nowIso = new Date().toISOString();

        status.textContent = 'Checking code…';

        const { data: codeRows, error: codeError } = await db.client
          .from('venue_checkin_codes')
          .select('*')
          .eq('venue_id', venueId)
          .eq('is_active', true)
          .eq('code', code)
          .gt('expires_at', nowIso)
          .order('created_at', { ascending: false })
          .limit(5);

        if (codeError) {
          console.error('venue_checkin_codes lookup error:', codeError);
          throw new Error(`Code lookup failed: ${codeError.message}`);
        }

        if (!codeRows || !codeRows.length) {
          status.textContent = 'Code is invalid, expired, or for a different venue.';
          return;
        }

        const codeRow = codeRows[0];

        status.textContent = 'Code valid. Creating guest session…';

        const sessionToken = randomGuestSessionToken();
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

        const insertPayload = {
          venue_id: venueId,
          room_id: roomId || null,
          prompt_id: promptId || null,
          session_token: sessionToken,
          verification_method: 'venue_code',
          verified_code_id: codeRow.id,
          expires_at: expiresAt,
          user_agent: navigator.userAgent || null
        };

        const { data: sessionRow, error: sessionError } = await db.client
          .from('guest_presence_sessions')
          .insert(insertPayload)
          .select()
          .single();

        if (sessionError) {
          console.error('guest_presence_sessions insert error:', sessionError, insertPayload);
          throw new Error(`Session creation failed: ${sessionError.message}`);
        }

        storePresence({
          venueId,
          roomId,
          promptId,
          expiresAt,
          presenceSessionId: sessionRow.id,
          sessionToken
        });

        status.textContent = 'Presence verified. Redirecting…';

        const nextUrl = `${location.origin}/public/pulse-vote.html?room=${encodeURIComponent(roomId)}&venue=${encodeURIComponent(venueId)}${promptId ? `&prompt=${encodeURIComponent(promptId)}` : ''}`;
        window.location.href = nextUrl;
      } catch (err) {
        console.error('Check-in verification failed:', err);
        status.textContent = err.message || 'Verification failed.';
      } finally {
        submit.disabled = false;
      }
    };
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (document.body.dataset.publicPage === 'pulse-checkin') {
        await bootCheckinPage();
        return;
      }

      await bootVotePage();
    } catch (err) {
      showNotice(err.message || 'Public pulse page failed to load.', true);
    }
  });
})();
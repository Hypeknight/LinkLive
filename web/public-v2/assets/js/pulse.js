(function () {
  const U = window.LinkdNV2Utils;
  const C = window.LinkdNV2Client;
  const Session = window.LinkdNV2SessionService;
  const Pulse = window.LinkdNV2PulseService;

  const state = {
    venueId: null,
    roomId: null,
    promptId: null,
    venue: null,
    room: null,
    prompt: null,
    pulses: [],
    comments: [],
    question: null,
    questionOptions: [],
    presence: null,
    timerHandle: null
  };

  function voteKey(promptId) { return `linkdn_v2_vote_${promptId}`; }
  function questionKey(questionId) { return `linkdn_v2_question_${questionId}`; }
  function hasVoted(promptId) { return sessionStorage.getItem(voteKey(promptId)) === '1'; }
  function markVoted(promptId) { sessionStorage.setItem(voteKey(promptId), '1'); }
  function hasAnswered(questionId) { return sessionStorage.getItem(questionKey(questionId)) === '1'; }
  function markAnswered(questionId) { sessionStorage.setItem(questionKey(questionId), '1'); }

  async function load() {
    const params = U.qs();
    state.venueId = params.get('venue') || '';
    state.roomId = params.get('room') || '';
    state.promptId = params.get('prompt') || '';
    state.presence = Session.getStoredPresence(state.venueId);

    if (!Session.hasActivePresence(state.venueId)) {
      const next = new URL(`${location.origin}/public-v2/checkin.html`);
      next.searchParams.set('venue', state.venueId);
      if (state.roomId) next.searchParams.set('room', state.roomId);
      if (state.promptId) next.searchParams.set('prompt', state.promptId);
      location.href = next.toString();
      return;
    }

    const [venue, room, prompt, pulses, comments, question] = await Promise.all([
      state.venueId ? C.maybeSingle('venues', q => q.eq('id', state.venueId)) : null,
      state.roomId ? C.maybeSingle('rooms', q => q.eq('id', state.roomId)) : null,
      state.roomId ? Pulse.getActivePrompt(state.roomId) : null,
      state.roomId ? Pulse.listRoomPulseRows(state.roomId, 200) : [],
      state.roomId ? Pulse.listRoomComments(state.roomId, 50) : [],
      state.roomId ? C.maybeSingle('general_questions', q => q.eq('room_id', state.roomId).eq('is_active', true).order('created_at', { ascending: false }).limit(1)) : null
    ]);

    state.venue = venue;
    state.room = room;
    state.prompt = prompt;
    state.pulses = pulses;
    state.comments = comments;
    state.question = question;

    if (state.question?.id) {
      state.questionOptions = await C.select('general_question_options', q => q.eq('question_id', state.question.id).order('sort_order', { ascending: true }));
    }
  }

  function renderHeader() {
    U.setText('v2-pulse-venue', state.venue?.name || 'Venue');
    U.setText('v2-pulse-room', state.room?.title || 'Room');
    U.setText('v2-pulse-checkin', 'Venue verified');
    if (state.presence?.expiresAt) {
      U.setText('v2-pulse-session', `Session until ${new Date(state.presence.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    }
  }

  function renderPrompt() {
    const prompt = state.prompt;
    U.setText('v2-prompt-text', prompt?.prompt_text || 'No active pulse prompt.');
    U.setText('v2-prompt-meta', prompt ? `${prompt.cta_type || prompt.prompt_type || 'pulse'} • ${prompt.status || 'live'}` : 'Waiting for next pulse…');

    clearInterval(state.timerHandle);
    const timer = U.byId('v2-prompt-timer');
    if (!timer) return;
    if (!prompt?.ends_at) {
      timer.textContent = '—';
      return;
    }

    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(prompt.ends_at).getTime() - Date.now()) / 1000));
      timer.textContent = U.formatCountdown(left);
      if (left <= 0) clearInterval(state.timerHandle);
    };
    tick();
    state.timerHandle = setInterval(tick, 1000);
  }

  function renderStandings() {
    const tonight = Pulse.tonightRows(state.pulses, state.venue?.reset_time_local || '08:30:00');
    const standings = Pulse.computeStandings(tonight, state.venue?.name, state.venueId);
    U.setHtml('v2-standings', standings.length ? standings.map(s => `
      <div class="v2-feed-item">
        <div><strong>#${s.rank}</strong> ${U.esc(s.venue_name)}</div>
        <div class="v2-dim">${s.score} pts • ${s.entries} tonight</div>
      </div>
    `).join('') : '<div class="v2-feed-item">Standings will appear as the room interacts tonight.</div>');
  }

  function renderComments() {
    const tonight = Pulse.tonightRows(state.comments, state.venue?.reset_time_local || '08:30:00');
    U.setHtml('v2-comments', tonight.length ? tonight.map(c => `
      <div class="v2-feed-item">
        <div>${U.esc(c.body || '')}</div>
        <div class="v2-dim">${U.fmt(c.created_at)}</div>
      </div>
    `).join('') : '<div class="v2-feed-item">No comments yet tonight.</div>');
  }

  function renderQuestion() {
    const text = U.byId('v2-question-text');
    const actions = U.byId('v2-question-actions');
    if (!text || !actions) return;

    if (!state.question) {
      text.textContent = 'No general question right now.';
      actions.innerHTML = '<button disabled>No answer choices yet</button>';
      return;
    }

    text.textContent = state.question.question_text || 'Question';
    const answered = hasAnswered(state.question.id);
    actions.innerHTML = (state.questionOptions.length ? state.questionOptions : [{ id: '1', option_text: 'Yes' }, { id: '2', option_text: 'No' }])
      .map(opt => `<button data-answer="${U.esc(opt.id)}" ${answered ? 'disabled' : ''}>${U.esc(opt.option_text || opt.label || opt.id)}</button>`).join('');

    actions.querySelectorAll('[data-answer]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await C.insert('general_question_answers', {
            question_id: state.question.id,
            option_id: btn.dataset.answer,
            venue_id: state.venueId,
            room_id: state.roomId || null,
            presence_session_id: state.presence.presenceSessionId
          });
          markAnswered(state.question.id);
          U.flash('Answer recorded.');
          await load();
          renderQuestion();
        } catch (err) {
          U.flash(err.message || 'Answer failed.', 'error');
        }
      };
    });
  }

  function renderCta() {
    const wrap = U.byId('v2-cta-wrap');
    if (!wrap) return;
    const prompt = state.prompt;
    if (!prompt || (prompt.ends_at && new Date(prompt.ends_at).getTime() <= Date.now())) {
      wrap.innerHTML = '<div class="v2-feed-item">No active pulse response is required right now.</div>';
      return;
    }

    const cta = String(prompt.cta_type || 'vote').toLowerCase();
    const responded = hasVoted(prompt.id);
    if (cta === 'comment') {
      wrap.innerHTML = `
        <textarea id="v2-live-comment" rows="3" placeholder="Respond to the live pulse..." ${responded ? 'disabled' : ''}></textarea>
        <button id="v2-live-comment-submit" ${responded ? 'disabled' : ''}>Send Live Comment</button>
      `;
      U.byId('v2-live-comment-submit')?.addEventListener('click', async () => {
        try {
          const body = U.byId('v2-live-comment')?.value?.trim();
          if (!body) throw new Error('Enter a comment first.');
          await Pulse.sendComment({
            promptId: prompt.id,
            venueId: state.venueId,
            roomId: state.roomId,
            presenceSessionId: state.presence.presenceSessionId,
            body
          });
          markVoted(prompt.id);
          await load();
          renderCta();
          renderComments();
          U.flash('Live pulse comment sent.');
        } catch (err) {
          U.flash(err.message || 'Comment failed.', 'error');
        }
      });
      return;
    }

    if (cta === 'yell') {
      wrap.innerHTML = `
        <button data-yell="crowd_erupting" ${responded ? 'disabled' : ''}>Crowd Going Crazy</button>
        <button data-yell="run_it_back" ${responded ? 'disabled' : ''}>Run It Back</button>
        <button data-yell="venue_takeover" ${responded ? 'disabled' : ''}>Our Venue Taking Over</button>
      `;
      wrap.querySelectorAll('[data-yell]').forEach(btn => {
        btn.onclick = async () => {
          try {
            await Pulse.sendQuickPulse({
              venueId: state.venueId,
              roomId: state.roomId,
              presenceSessionId: state.presence.presenceSessionId,
              notes: btn.dataset.yell,
              pulseScore: btn.dataset.yell === 'run_it_back' ? 85 : 90,
              energyLevel: btn.dataset.yell === 'run_it_back' ? 9 : 10,
              crowdCount: 1
            });
            markVoted(prompt.id);
            await load();
            renderStandings();
            renderCta();
            U.flash('Crowd response sent.');
          } catch (err) {
            U.flash(err.message || 'Response failed.', 'error');
          }
        };
      });
      return;
    }

    const options = Array.isArray(prompt.option_set_json) && prompt.option_set_json.length
      ? prompt.option_set_json
      : [{ id: '1', option_text: 'Yes' }, { id: '2', option_text: 'No' }];

    wrap.innerHTML = options.map(opt => `<button data-vote="${U.esc(opt.id || opt.option_text || opt)}" ${responded ? 'disabled' : ''}>${U.esc(opt.option_text || opt.label || opt)}</button>`).join('');
    wrap.querySelectorAll('[data-vote]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await Pulse.sendVote({
            promptId: prompt.id,
            optionId: btn.dataset.vote,
            presenceSessionId: state.presence.presenceSessionId,
            voterSessionId: state.presence.sessionToken || state.presence.presenceSessionId
          });
          markVoted(prompt.id);
          renderCta();
          U.flash('Vote received.');
        } catch (err) {
          U.flash(err.message || 'Vote failed.', 'error');
        }
      };
    });
  }

  function bindSocial() {
    U.byId('v2-comment-submit')?.addEventListener('click', async () => {
      try {
        const body = U.byId('v2-comment-input')?.value?.trim();
        if (!body) throw new Error('Enter a comment first.');
        await Pulse.sendComment({
          promptId: state.prompt?.id || null,
          venueId: state.venueId,
          roomId: state.roomId,
          presenceSessionId: state.presence.presenceSessionId,
          body
        });
        U.byId('v2-comment-input').value = '';
        await load();
        renderComments();
        U.flash('Comment received.');
      } catch (err) {
        U.flash(err.message || 'Comment failed.', 'error');
      }
    });

    U.byId('v2-dj-submit')?.addEventListener('click', async () => {
      try {
        const text = U.byId('v2-dj-input')?.value?.trim();
        if (!text) throw new Error('Enter a request first.');
        await Pulse.sendDjRequest({
          venueId: state.venueId,
          roomId: state.roomId,
          presenceSessionId: state.presence.presenceSessionId,
          requestText: text
        });
        U.byId('v2-dj-input').value = '';
        U.flash('DJ request received.');
      } catch (err) {
        U.flash(err.message || 'DJ request failed.', 'error');
      }
    });

    U.byId('v2-leave-session')?.addEventListener('click', () => {
      Session.clearPresence(state.venueId);
      const next = new URL(`${location.origin}/public-v2/checkin.html`);
      next.searchParams.set('venue', state.venueId);
      if (state.roomId) next.searchParams.set('room', state.roomId);
      if (state.promptId) next.searchParams.set('prompt', state.promptId);
      location.href = next.toString();
    });
  }

  async function boot() {
    await load();
    renderHeader();
    renderPrompt();
    renderStandings();
    renderComments();
    renderQuestion();
    renderCta();
    bindSocial();
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch(err => U.flash(err.message || 'Pulse page failed to load.', 'error'));
  });
})();

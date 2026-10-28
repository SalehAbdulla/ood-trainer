/* IT7006 OOD midterm trainer — frontend logic */
'use strict';

const $ = (id) => document.getElementById(id);
const KEYS = ['1', '2', '3', '4', '5', '6'];

const S = {
  q: null,               // current question payload
  answered: false,
  loading: false,        // guards against concurrent loads
  session: { answered: 0, correct: 0 },
  shown: [],             // this session's pages: [{ q, r }] where r = answer payload
  idx: -1,               // which page is on screen
};

// After answering, hold the verdict for this long, then fade to the next question.
const AUTO_ADVANCE_MS = 2500;

// How long the card takes to fade out before the next question swaps in. This
// also drives the CSS transition (via --fade-ms), so the two cannot drift apart.
const FADE_MS = 120;
try {
  if (document.documentElement) {
    document.documentElement.style.setProperty('--fade-ms', FADE_MS + 'ms');
  }
} catch (e) { /* a stubbed DOM in the tests has no documentElement */ }

/* ------------------------------------------------------------------ api */
// Two backends, one UI:
//   * server mode - the optional local server.py; progress in progress.json
//   * static mode - no server (e.g. GitHub Pages); progress in localStorage,
//                   served by the srs.js engine in this page
// We probe once for a server and fall back to the in-browser engine. On a
// static host that probe is the one 404 you may see in the network tab.
const MODE = { static: false, probed: false };

async function probe() {
  if (MODE.probed) return;
  MODE.probed = true;
  try {
    // relative, so a project site under /<repo>/ stays inside the project
    const res = await fetch('api/status', { cache: 'no-store' });
    MODE.static = !res.ok;
  } catch (e) {
    MODE.static = true;
  }
}

async function api(path, body) {
  await probe();
  if (MODE.static) {
    if (typeof SRS === 'undefined') {
      throw new Error('No server is reachable and srs.js is not loaded.');
    }
    return SRS.handle(path, body);
  }
  const opts = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : {};
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// A browser cannot write files, so "snapshot" and "export" become downloads.
function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* --------------------------------------------------------------- render */
function fmtPct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

async function refreshStatus() {
  const st = await api('/api/status');
  $('countdown').textContent =
    `${st.days_to_exam} day${st.days_to_exam === 1 ? '' : 's'} to exam · ${st.exam_label}`;
  $('countdown').classList.toggle('hot', st.days_to_exam <= 2);
  $('s-due').textContent = st.due;
  $('s-waiting').textContent = st.waiting;
  $('s-mastered').textContent = `${st.mastered} / ${st.total}`;
  $('s-archived').textContent = st.archived;
  $('s-untouched').textContent = st.untouched;
  // Coverage bar: green = mastered, blue = answered and still in rotation, the
  // grey track = untouched. Unlike the mastery figure this moves the moment you
  // answer anything, which is the point of it.
  const share = (n) => `${fmtPct(n, st.total)}%`;
  $('p-mastered').style.width = share(st.mastered);
  $('p-answered').style.width = share(st.archived - st.mastered);
  $('p-answered-n').textContent = st.archived;
  $('p-total').textContent = st.total;
  $('p-mastered-n').textContent = st.mastered;
  $('p-pct').textContent = share(st.archived);
  $('p-pct').classList.toggle('done', st.total > 0 && st.archived >= st.total);
  return st;
}

function refreshSession() {
  const { answered, correct } = S.session;
  $('s-session').textContent = `${correct} / ${answered}`;
  $('s-acc').textContent = answered ? fmtPct(correct, answered) + '%' : '—';
}

/* --------------------------------------------------------------- router */
// Views are addressed by the URL hash, so the browser Back button works, a
// reload keeps you where you were, and each view is linkable/bookmarkable.
const VIEWS = {
  quiz: 'view-quiz',
  exam: 'view-exam',
  dashboard: 'view-dash',
  archive: 'view-archive',
};

function currentRoute() {
  const h = (location.hash || '').replace(/^#\/?/, '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(VIEWS, h) ? h : 'quiz';
}

function applyRoute(route) {
  for (const [name, id] of Object.entries(VIEWS)) $(id).hidden = name !== route;
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.route === route);
  });
  document.title = route === 'quiz'
    ? 'IT7006 OOD · Midterm Trainer'
    : `IT7006 OOD · ${route[0].toUpperCase()}${route.slice(1)}`;
  if (route === 'dashboard') renderDashboard();
  if (route === 'archive') renderArchive();
  if (route === 'exam') examEnter();
  if (route === 'quiz') resumeQuiz();
}

// If the quiz is sitting on the "nothing due" screen, something may have come
// due while we were on another view - pick it up straight away.
function resumeQuiz() {
  if ($('card').hidden) loadQuestion();
}

function goTo(route) {
  const r = Object.prototype.hasOwnProperty.call(VIEWS, route) ? route : 'quiz';
  if (currentRoute() === r) applyRoute(r);   // same hash: hashchange will not fire
  else location.hash = r;                    // fires hashchange -> applyRoute
}

window.addEventListener('hashchange', () => applyRoute(currentRoute()));

/* ----------------------------------------------------------- countdown */
let tickTimer = null;
let nextDueMs = null;

function stopCountdown() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  nextDueMs = null;
}

function fmtClock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Counts down to the next scheduled review and then pulls the question in
// automatically, so you never have to sit there refreshing the page.
function startCountdown(iso) {
  stopCountdown();
  const el = $('countdown-big');
  if (!iso) { el.textContent = '—'; el.classList.remove('ready'); return; }
  nextDueMs = new Date(iso).getTime();
  const tick = () => {
    const left = nextDueMs - Date.now();
    if (left <= 0) {
      el.textContent = 'due now';
      el.classList.add('ready');
      stopCountdown();
      loadQuestion();
      return;
    }
    el.classList.remove('ready');
    el.textContent = fmtClock(left);
  };
  tick();
  tickTimer = setInterval(tick, 1000);
}


/* ----------------------------------------------------------- load a Q */
async function loadQuestion() {
  if (S.loading) return;          // never run two loads at once
  S.loading = true;
  try {
    cancelAdvance();
    const qs = new URLSearchParams();
    if ($('week').value) qs.set('week', $('week').value);
    if ($('all').checked) qs.set('all', '1');

    const q = await api('/api/question?' + qs.toString());

    if (q.done) {
      S.q = null;
      stopCountdown();
      $('card').hidden = true;
      $('pager').hidden = true;
      $('empty').hidden = false;
      $('empty-title').textContent = 'Nothing due right now.';
      if (q.next_due) {
        $('empty-msg').textContent =
          'Your next review is scheduled. The countdown above will load the question automatically.';
        startCountdown(q.next_due);
      } else {
        $('empty-msg').textContent =
          'Nothing scheduled either. Tick "Ignore due times" and press Start to sweep everything unmastered.';
        startCountdown(null);
      }
      await refreshStatus();
      return;
    }

    stopCountdown();
    S.shown.push({ q, r: null });   // new page at the end of the session history
    S.idx = S.shown.length - 1;
    renderPage();
    await refreshStatus();
  } finally {
    S.loading = false;
  }
}
/* ------------------------------------------------------- auto-advance */
// The verdict holds for AUTO_ADVANCE_MS, then the card fades and the next
// question loads. Anything that means "I am reading" cancels it: the Stay
// button, hovering the reveal panel, or pressing a key.
let advanceTimer = null;

function cancelAdvance() {
  if (advanceTimer) { clearInterval(advanceTimer); advanceTimer = null; }
  const el = $('advance-hint');
  if (el) { el.hidden = true; el.textContent = ''; }
}

function scheduleAdvance() {
  cancelAdvance();
  const el = $('advance-hint');
  let left = AUTO_ADVANCE_MS;
  const tick = () => {
    left -= 100;
    if (left <= 0) { cancelAdvance(); nextPage(); return; }
    el.textContent = `next in ${(left / 1000).toFixed(1)}s`;
  };
  el.hidden = false;
  tick();
  advanceTimer = setInterval(tick, 100);
}

/* ---------------------------------------------------------- render page */
// Renders whichever page S.idx points at, in either its unanswered or its
// already-answered state, so Prev can re-show a question with its answer.
function renderPage() {
  cancelAdvance();
  const page = S.shown[S.idx];
  if (!page) return;
  const { q, r } = page;
  S.q = q;
  S.answered = !!r;

  $('card').hidden = false;
  $('empty').hidden = true;
  $('pager').hidden = false;

  $('q-week').textContent = `Week ${q.week}`;
  $('q-topic').textContent = q.topic || '—';
  $('q-marks').textContent = `${q.marks} mark${q.marks === 1 ? '' : 's'}`;
  $('q-streak').textContent = `streak ${q.streak}/${q.mastery_streak}`;
  $('q-stage').textContent = `review ${q.stage}/${q.stages}`;
  $('q-id').textContent = `${q.id} · ${q.remaining} left`;
  $('q-stem').textContent = q.stem;

  const opts = $('options');
  opts.innerHTML = '';
  $('open-answer').hidden = q.mode !== 'open';
  $('btn-got').disabled = !!r;
  $('btn-missed').disabled = !!r;

  if (q.mode === 'mcq') {
    q.options.forEach((text, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'option';
      b.dataset.text = text;
      b.innerHTML = `<span class="key">${KEYS[i] || i + 1}</span><span class="txt"></span>`;
      b.querySelector('.txt').textContent = text;
      if (r) {
        b.disabled = true;                       // already answered: locked + coloured
        if (text === r.correct_option) b.classList.add('correct');
        else if (text === r.last_choice) b.classList.add('wrong');
      } else {
        b.addEventListener('click', () => pick(b, text));
      }
      opts.appendChild(b);
    });
  }

  if (r) showResult(r); else hideResult();
  updatePager();
}
function hideResult() {
  $('verdict').hidden = true;
  $('reveal').hidden = true;
}

function showResult(r) {
  const v = $('verdict');
  v.hidden = false;
  v.className = 'verdict ' + (r.correct ? 'good' : 'bad');
  const label = { mastered: 'MASTERED — retired to the archive',
                  archived: 'CORRECT — archived',
                  relearn: 'WRONG — back to the start of the ladder' }[r.outcome];
  v.textContent = r.correct ? `✓ ${label}` : `✗ ${label}`;

  $('r-answer').textContent = r.model_answer;
  const tipWrap = $('r-tip-wrap');
  tipWrap.hidden = !r.tip;
  if (r.tip) $('r-tip').textContent = r.tip;

  $('r-sched').textContent = r.mastered
    ? `mastered after ${r.streak} correct answers · ${r.remaining} left`
    : r.outcome === 'relearn'
      ? `back to Review 1 — returns in ${r.gap_label} (at ${r.due_label}) · ${r.remaining} left`
      : `Review ${r.stage} in ${r.gap_label} (at ${r.due_label}) · `
        + `streak ${r.streak}/${r.mastery_streak} · ${r.remaining} left`;

  $('reveal').hidden = false;
}

/* -------------------------------------------------------------- paging */
function updatePager() {
  const total = S.shown.length;
  const live = S.idx === total - 1;
  $('page-info').textContent =
    `page ${S.idx + 1} / ${total}${live ? ' · live' : ' · reviewing'}`;
  $('btn-prev').disabled = S.idx <= 0;
  $('btn-next-page').textContent = live ? 'Next question →' : 'Next →';
}

function prefersReducedMotion() {
  return window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

async function fadeTo(fn) {
  const card = $('card');
  if (!prefersReducedMotion()) {
    card.classList.add('fading');
    // wait just past the CSS transition, so the card is fully faded before the swap
    await new Promise((res) => setTimeout(res, FADE_MS + 20));
  }
  await fn();
  card.classList.remove('fading');
}

async function nextPage() {
  cancelAdvance();
  if (S.idx < S.shown.length - 1) {          // step forward through history
    S.idx += 1;
    await fadeTo(async () => renderPage());
    return;
  }
  await fadeTo(loadQuestion);                // on the live page -> pull a new one
}

async function prevPage() {
  cancelAdvance();
  if (S.idx <= 0) return;
  S.idx -= 1;
  await fadeTo(async () => renderPage());
}





/* ------------------------------------------------------------ answering */
async function pick(btn, text) {
  if (S.answered || !S.q) return;
  btn.classList.add('picked');
  await grade({ id: S.q.id, choice: text });
}

async function selfMark(correct) {
  if (S.answered || !S.q) return;
  await grade({ id: S.q.id, correct });
}

async function grade(body) {
  const page = S.shown[S.idx];
  if (!page) return;
  let r;
  try {
    r = await api('/api/answer', body);
  } catch (e) {
    alert('Could not save: ' + e.message);
    return;
  }
  page.r = r;                     // remember it so Prev can re-show this answer
  S.session.answered += 1;
  if (r.correct) S.session.correct += 1;
  refreshSession();
  renderPage();                   // re-renders locked, coloured, with the reveal
  await refreshStatus();
  scheduleAdvance();              // hold the verdict, then fade to the next question
}


/* -------------------------------------------------------------- keyboard */
document.addEventListener('keydown', (e) => {
  if (e.target.matches('select, input, textarea')) return;

  // a running exam owns the keyboard: 1-4 answer, arrows move between questions
  if (EXAM.running && !$('view-exam').hidden) {
    if (KEYS.includes(e.key)) {
      const btns = [...$('exam-options').querySelectorAll('.option')];
      const b = btns[KEYS.indexOf(e.key)];
      if (b) { e.preventDefault(); examPick(b.dataset.text); }
      return;
    }
    if (e.key === 'ArrowLeft') { e.preventDefault(); examMove(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); examMove(1); return; }
    return;
  }

  if (!S.q) return;

  // any key stops the auto-advance, except Enter/Space which advance explicitly
  if (advanceTimer && e.key !== 'Enter' && e.key !== ' ') { cancelAdvance(); return; }

  if (!S.answered && S.q.mode === 'mcq' && KEYS.includes(e.key)) {
    const btns = [...$('options').querySelectorAll('.option')];
    const b = btns[KEYS.indexOf(e.key)];
    if (b && !b.disabled) { e.preventDefault(); pick(b, b.dataset.text); }
    return;
  }
  if (!S.answered && S.q.mode === 'open' && (e.key === 'y' || e.key === 'n')) {
    e.preventDefault();
    selfMark(e.key === 'y');
    return;
  }
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevPage(); return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); nextPage(); return; }
  if (S.answered && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    nextPage();
  }
});

/* ------------------------------------------------------------ dashboard */
async function renderDashboard() {
  const st = await api('/api/status');
  const names = {
    1: 'Programming approaches',
    2: 'OO concepts & design',
    3: 'UML class diagrams',
    4: 'Use case & sequence',
    5: 'Design patterns',
  };
  $('weeks').innerHTML = st.per_week.map((w) => `
    <div class="wrow">
      <div class="name"><b>Week ${w.week}</b> · ${names[w.week] || ''}</div>
      <div class="bar"><span style="width:${fmtPct(w.mastered, w.total)}%"></span></div>
      <div class="num">${w.mastered}/${w.total} · ${w.due} due</div>
    </div>`).join('');

  const weak = await api('/api/weakest?n=12');
  $('weakest').innerHTML = weak.length
    ? weak.map((w) => `<li><b>${w.id}</b> <span class="meta">w${w.week} · lapses ${w.lapses} · streak ${w.streak}</span><br>${escapeHtml(w.stem.slice(0, 130))}${w.stem.length > 130 ? '…' : ''}</li>`).join('')
    : '<li>Nothing outstanding — everything is mastered.</li>';

  const arch = await api('/api/archive?per=1');
  $('archive').innerHTML = arch.counts.all
    ? `<span class="muted">${arch.counts.mastered} mastered · `
      + `${arch.counts.waiting} waiting for a review</span>`
      + (arch.due_now ? ` · <b>${arch.due_now} due now</b>` : '')
    : `<span class="muted">Empty — a question is archived as soon as you answer it,
       and retires after ${st.mastery_streak} correct answers.</span>`;

  await refreshStatus();
}

/* -------------------------------------------------------------- archive */
const ARCH = { page: 1, per: 10, filter: 'all', timer: null };

async function renderArchive() {
  const a = await api(
    `/api/archive?page=${ARCH.page}&per=${ARCH.per}&filter=${ARCH.filter}`);
  ARCH.page = a.page;
  ARCH.filter = a.filter;

  $('arch-ladder').textContent =
    `Ladder: ${a.ladder.map((g, i) => `Review ${i + 1} +${g}`).join(' → ')}`
    + ` → mastered after ${a.mastery_streak} correct answers.`;

  // filter tabs, with live counts
  document.querySelectorAll('#arch-filters .tab').forEach((b) => {
    const f = b.dataset.filter;
    b.classList.toggle('active', f === a.filter);
    const n = a.counts[f];
    b.textContent = `${f[0].toUpperCase()}${f.slice(1)} (${n})`;
  });

  // "N due now" banner, so an expired question is obviously waiting in the quiz
  const due = $('arch-due');
  due.innerHTML = '';
  if (a.due_now > 0) {
    due.hidden = false;
    const span = document.createElement('span');
    span.textContent = `${a.due_now} question${a.due_now === 1 ? '' : 's'} due now`;
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn primary';
    go.textContent = 'Go to quiz →';
    go.addEventListener('click', () => goTo('quiz'));
    due.append(span, go);
  } else {
    due.hidden = true;
  }

  $('arch-rows').innerHTML = a.rows.length
    ? a.rows.map(archRow).join('')
    : '<div class="arch-empty">Nothing here yet — answer some questions first.</div>';

  $('arch-page-info').textContent =
    `page ${a.page} / ${a.pages} · ${a.total} question${a.total === 1 ? '' : 's'}`;
  $('btn-arch-prev').disabled = a.page <= 1;
  $('btn-arch-next').disabled = a.page >= a.pages;
}

// One archive row: the question, the right answer, and what you picked last
// time - with the border green if you got it right and red if you did not.
function archRow(r) {
  const colour = r.last_correct === true ? 'correct'
    : r.last_correct === false ? 'wrong' : 'unseen';
  const when = r.mastered
    ? `mastered · correct ×${r.correct} · lapses ${r.lapses}`
    : `review ${r.stage}/${r.stages} · back ${escapeHtml(r.returns_in)}`
      + ` (at ${escapeHtml(r.due_label)})` + (r.is_due ? ' · DUE NOW' : '');

  const correctAns = r.correct_option
    ? `<div class="ans correct-ans">✔ <b>Correct answer:</b> ${escapeHtml(r.correct_option)}</div>`
    : '';

  const yourAns = r.last_choice
    ? `<div class="ans ${r.last_correct ? 'your-right' : 'your-wrong'}">`
      + `${r.last_correct ? '✔' : '✘'} <b>You answered:</b> ${escapeHtml(r.last_choice)}</div>`
    : `<div class="ans your-none">— no option recorded for your last attempt (`
      + (r.last_correct === true ? 'marked correct'
        : r.last_correct === false ? 'marked wrong' : 'not attempted') + ')</div>';

  return `
    <div class="arch-item ${r.mastered ? 'mastered' : ''} ${colour}${r.is_due ? ' due' : ''}">
      <div class="top">
        <span class="who">${r.id} · w${r.week} · ${escapeHtml(r.topic)}</span>
        <span class="when">${when}</span>
      </div>
      <div class="stem">${escapeHtml(r.stem)}</div>
      ${correctAns}
      ${yourAns}
      <details><summary>Model answer</summary><pre>${escapeHtml(r.model_answer)}</pre></details>
    </div>`;
}

// Keep "returns in ..." ticking and let expired rows flip to DUE NOW while the
// archive is open, so a question that comes due shows up without a refresh.
function startArchiveRefresh() {
  if (ARCH.timer) return;
  ARCH.timer = setInterval(() => {
    if (!$('view-archive').hidden) renderArchive().catch(() => {});
  }, 5000);
}


/* ------------------------------------------------------------------ exam */
// A timed paper: a fixed set of questions drawn from the whole bank, with no
// feedback until you submit. Nothing here touches the revision schedule.
const EXAM = {
  paper: null,        // {count, total_marks, breakdown, questions}
  answers: {},        // question id -> the option text picked
  idx: 0,
  endsAt: 0,
  timer: null,
  running: false,
  last: null,         // summary of the previous paper, for the setup screen
};

async function examStart() {
  const n = Number($('exam-size').value);
  const mins = Number($('exam-mins').value);
  $('btn-exam-start').disabled = true;
  try {
    EXAM.paper = await api(`/api/exam/paper?n=${n}`);
  } catch (e) {
    alert('Could not build a paper: ' + e.message);
    return;
  } finally {
    $('btn-exam-start').disabled = false;
  }
  EXAM.answers = {};
  EXAM.idx = 0;
  EXAM.endsAt = Date.now() + mins * 60000;
  EXAM.running = true;
  $('exam-setup').hidden = true;
  $('exam-result').hidden = true;
  $('exam-run').hidden = false;
  examRender();
  examTick();
  EXAM.timer = setInterval(examTick, 1000);
}

function examTick() {
  if (!EXAM.running) return;
  const left = Math.max(0, EXAM.endsAt - Date.now());
  const s = Math.ceil(left / 1000);
  const el = $('exam-clock');
  el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:`
    + String(s % 60).padStart(2, '0');
  el.classList.toggle('hot', s <= 60);
  if (left <= 0) examSubmit(true);      // time is up: submit whatever we have
}

function examRender() {
  const p = EXAM.paper;
  if (!p) return;
  const q = p.questions[EXAM.idx];
  $('exam-week').textContent = `Week ${q.week}`;
  $('exam-topic').textContent = q.topic || '—';
  $('exam-marks').textContent = `${q.marks} mark${q.marks === 1 ? '' : 's'}`;
  $('exam-pos').textContent = `question ${EXAM.idx + 1} of ${p.count}`;
  $('exam-stem').textContent = q.stem;

  const opts = $('exam-options');
  opts.innerHTML = '';
  const chosen = EXAM.answers[q.id];
  q.options.forEach((text, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'option';
    if (text === chosen) b.classList.add('picked');
    b.dataset.text = text;
    b.innerHTML = `<span class="key">${KEYS[i] || i + 1}</span><span class="txt"></span>`;
    b.querySelector('.txt').textContent = text;
    b.addEventListener('click', () => examPick(text));
    opts.appendChild(b);
  });

  const done = Object.keys(EXAM.answers).length;
  $('exam-progress').textContent = `${done} of ${p.count} answered`;
  $('exam-page').textContent = `${EXAM.idx + 1} / ${p.count}`;
  $('btn-exam-prev').disabled = EXAM.idx <= 0;
  $('btn-exam-next').disabled = EXAM.idx >= p.count - 1;
}

function examPick(text) {
  if (!EXAM.running) return;
  EXAM.answers[EXAM.paper.questions[EXAM.idx].id] = text;
  examRender();
}

function examMove(delta) {
  if (!EXAM.paper) return;
  EXAM.idx = Math.max(0, Math.min(EXAM.paper.count - 1, EXAM.idx + delta));
  examRender();
}


async function examSubmit(auto) {
  if (!EXAM.running || !EXAM.paper) return;
  const unanswered = EXAM.paper.count - Object.keys(EXAM.answers).length;
  if (!auto && unanswered > 0
      && !confirm(`${unanswered} question${unanswered === 1 ? '' : 's'} unanswered. `
        + 'Submit anyway?')) {
    return;
  }
  EXAM.running = false;
  if (EXAM.timer) { clearInterval(EXAM.timer); EXAM.timer = null; }

  const answers = EXAM.paper.questions.map((q) => ({
    id: q.id,
    choice: EXAM.answers[q.id] === undefined ? null : EXAM.answers[q.id],
  }));
  let r;
  try {
    r = await api('/api/exam/mark', { answers });
  } catch (e) {
    alert('Could not mark the paper: ' + e.message);
    return;
  }
  EXAM.last = { score: r.score, total: r.total, percent: r.percent, count: r.count };
  $('exam-run').hidden = true;
  $('exam-result').hidden = false;
  examShowResult(r);
}

function examShowResult(r) {
  const pct = $('exam-pct');
  pct.textContent = `${r.percent}%`;
  pct.className = 'exam-pct '
    + (r.percent >= 60 ? 'good' : r.percent >= 40 ? 'warn' : 'bad');
  $('exam-summary').textContent =
    `${r.score} / ${r.total} marks · ${r.answered} of ${r.count} answered`;

  const by = {};
  for (const x of r.results) {
    by[x.week] = by[x.week] || { got: 0, tot: 0 };
    by[x.week].tot += x.marks;
    if (x.correct) by[x.week].got += x.marks;
  }
  $('exam-breakdown').textContent = 'By week: ' + Object.keys(by).sort()
    .map((w) => `W${w} ${by[w].got}/${by[w].tot}`).join(' · ');

  $('exam-review').innerHTML = r.results.map(examReviewRow).join('');
}

// Reuses the archive row styling, so a review row looks like an archive row:
// green border if you got it, red if you did not, grey if you skipped it.
function examReviewRow(r) {
  const colour = r.correct === true ? 'correct'
    : r.correct === false ? 'wrong' : 'unseen';
  const right = r.correct_option
    ? `<div class="ans correct-ans">✔ <b>Correct answer:</b> ${escapeHtml(r.correct_option)}</div>`
    : '';
  const your = r.your_choice
    ? `<div class="ans ${r.correct ? 'your-right' : 'your-wrong'}">`
      + `${r.correct ? '✔' : '✘'} <b>You answered:</b> ${escapeHtml(r.your_choice)}</div>`
    : '<div class="ans your-none">— you did not answer this one</div>';
  const verdict = r.correct ? 'correct'
    : r.correct === false ? 'wrong' : 'not answered';
  return `
    <div class="arch-item ${colour}">
      <div class="top">
        <span class="who">${r.id} · w${r.week} · ${escapeHtml(r.topic)}</span>
        <span class="when">${r.marks} mark${r.marks === 1 ? '' : 's'} · ${verdict}</span>
      </div>
      <div class="stem">${escapeHtml(r.stem)}</div>
      ${right}
      ${your}
      <details><summary>Model answer</summary><pre>${escapeHtml(r.model_answer)}</pre></details>
    </div>`;
}

function examAbandon() {
  if (!EXAM.running) return;
  if (!confirm('Abandon this paper? Nothing will be recorded.')) return;
  examReset();
}

function examReset() {
  if (EXAM.timer) { clearInterval(EXAM.timer); EXAM.timer = null; }
  EXAM.running = false;
  EXAM.paper = null;
  EXAM.answers = {};
  $('exam-run').hidden = true;
  $('exam-result').hidden = true;
  $('exam-setup').hidden = false;
  examShowLast();
}

function examShowLast() {
  const el = $('exam-last');
  if (!EXAM.last) { el.innerHTML = ''; return; }
  const { score, total, percent, count } = EXAM.last;
  el.innerHTML = `<p class="muted">Last paper: <b>${score} / ${total}</b> marks `
    + `(${percent}%) across ${count} questions.</p>`;
}

// The exam view is self-contained: no fetch on entry, and a paper in progress
// survives navigating away and back (the clock keeps running, as it would in a
// real exam).
function examEnter() {
  examShowLast();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------------------ wire */
async function init() {
  // Decide up front whether a server is present, so nothing races on it.
  await probe();
  $('progress-card').hidden = !MODE.static;
  $('storage-note').textContent = MODE.static
    ? 'Progress is saved in this browser only — nothing leaves your device.'
    : 'Progress is saved in progress.json on this machine.';

  $('btn-start').addEventListener('click', restartQuiz);
  $('week').addEventListener('change', restartQuiz);
  $('all').addEventListener('change', restartQuiz);

  // quiz paging + auto-advance
  $('btn-next').addEventListener('click', nextPage);
  $('btn-next-page').addEventListener('click', nextPage);
  $('btn-prev').addEventListener('click', prevPage);
  $('btn-stay').addEventListener('click', cancelAdvance);
  $('reveal').addEventListener('mouseenter', cancelAdvance);
  $('btn-got').addEventListener('click', () => selfMark(true));
  $('btn-missed').addEventListener('click', () => selfMark(false));

  // nav: every button sets the hash, so Back/Forward and reload all behave
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => goTo(b.dataset.route));
  });
  $('btn-brand').addEventListener('click', () => goTo('quiz'));

  // archive paging + filters
  $('btn-arch-prev').addEventListener('click', () => {
    ARCH.page -= 1;
    renderArchive();
  });
  $('btn-arch-next').addEventListener('click', () => {
    ARCH.page += 1;
    renderArchive();
  });
  document.querySelectorAll('#arch-filters .tab').forEach((b) => {
    b.addEventListener('click', () => {
      ARCH.filter = b.dataset.filter;
      ARCH.page = 1;
      renderArchive();
    });
  });

  // exam mode
  $('btn-exam-start').addEventListener('click', examStart);
  $('btn-exam-submit').addEventListener('click', () => examSubmit(false));
  $('btn-exam-abandon').addEventListener('click', examAbandon);
  $('btn-exam-again').addEventListener('click', examReset);
  $('btn-exam-prev').addEventListener('click', () => examMove(-1));
  $('btn-exam-next').addEventListener('click', () => examMove(1));

  $('btn-arch-write').addEventListener('click', async () => {
    try {
      const r = await api('/api/archive/write', {});
      if (r.download) downloadText(r.download.name, r.download.text);
      else alert('Snapshot written to\n' + r.path);
    } catch (e) {
      alert('Could not save the snapshot: ' + e.message);
    }
  });

  // progress.json export / import - the bridge to the Python CLI and a backup
  $('btn-export').addEventListener('click', () => {
    const r = SRS.exportState();
    downloadText(r.download.name, r.download.text);
  });
  $('btn-import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      await SRS.importState(await file.text());
      S.shown = [];
      S.idx = -1;
      alert('Progress imported from ' + file.name);
      await renderDashboard();
      await loadQuestion();
    } catch (e) {
      alert('Could not import that file: ' + e.message);
    } finally {
      ev.target.value = '';
    }
  });

  $('btn-reset').addEventListener('click', async () => {
    if (!confirm('Wipe ALL progress and start over? This cannot be undone.')) return;
    await api('/api/reset', { yes: true });
    S.session = { answered: 0, correct: 0 };
    S.shown = [];
    S.idx = -1;
    refreshSession();
    await renderDashboard();
    await loadQuestion();
  });

  refreshSession();
  loadQuestion();
  applyRoute(currentRoute());
  startArchiveRefresh();
}

// Start a fresh session history (used when the week filter changes or Start
// is pressed), then pull the first question.
function restartQuiz() {
  cancelAdvance();
  S.shown = [];
  S.idx = -1;
  goTo('quiz');
  loadQuestion();
}

document.addEventListener('DOMContentLoaded', init);


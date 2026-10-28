/* IT7006 OOD trainer - the spaced-repetition engine, running in the browser.
 *
 * This is a faithful port of the scheduling logic in srs.py, so the hosted
 * static site and the Python CLI share one question bank and one state format.
 * They are interchangeable: export progress.json from the site and srs.py
 * reads it, or import a CLI progress.json into the site.
 *
 * The UI only ever talks to SRS.handle(path, body), which mirrors the /api/*
 * routes of the optional local server.py. app.js uses whichever is available.
 */
'use strict';

const SRS = (() => {
  /* ---- constants (kept in step with srs.py) ---------------------------- */
  const EXAM_DATE = '2026-11-01';
  const WEEKS = [1, 2, 3, 4, 5];
  const DEFAULT_INTERVALS = [5, 15, 60, 1440];
  const DEFAULT_MASTERY_STREAK = 5;
  const STATE_VERSION = 3;
  const STORAGE_KEY = 'it7006-ood-progress';
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ---- time ------------------------------------------------------------ */
  // Python truncates to the second, so match it or timestamps drift apart.
  function now() {
    return new Date(Math.floor(Date.now() / 1000) * 1000);
  }

  // Naive local ISO, matching datetime.isoformat(): 2026-10-28T14:32:00
  function isoLocal(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
      + `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  // Accepts a legacy 'YYYY-MM-DD' or a full local ISO datetime.
  // NB: new Date('2026-10-28') is parsed as UTC midnight, which can shift the
  // day, so the date-only form is extended before parsing.
  function parseDue(value) {
    if (!value) return null;
    let text = String(value);
    if (text.length === 10) text += 'T00:00:00';
    const d = new Date(text);
    return isNaN(d.getTime()) ? null : d;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function daysToExam() {
    const t = new Date();
    const exam = parseDue(EXAM_DATE);
    const a = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
    const b = Date.UTC(exam.getFullYear(), exam.getMonth(), exam.getDate());
    return Math.round((b - a) / 86400000);
  }

  function humanizeMinutes(mins) {
    mins = Math.round(mins);
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const m = mins % 60;
    if (hours < 24) return `${hours} h` + (m ? ` ${m} min` : '');
    const days = Math.floor(hours / 24);
    const h = hours % 24;
    return `${days} d` + (h ? ` ${h} h` : '');
  }

  function hhmm(d) {
    return String(d.getHours()).padStart(2, '0') + ':'
      + String(d.getMinutes()).padStart(2, '0');
  }

  function dueLabel(value) {
    const due = parseDue(value);
    if (!due) return '—';
    return sameDay(due, new Date()) ? hhmm(due)
      : `${WEEKDAYS[due.getDay()]} ${hhmm(due)}`;
  }

  function timeUntil(value, nowDt) {
    const due = parseDue(value);
    if (!due) return '—';
    const delta = (due - (nowDt || now())) / 60000;
    return delta <= 0 ? 'due now' : 'in ' + humanizeMinutes(delta);
  }

  /* ---- question bank --------------------------------------------------- */
  let bank = null;
  let bankPromise = null;

  async function loadBank() {
    if (bank) return bank;
    if (!bankPromise) {
      bankPromise = (async () => {
        const merged = {};
        for (const week of WEEKS) {
          const res = await fetch(`bank/week${week}.json`, { cache: 'no-cache' });
          if (!res.ok) continue;                    // a missing week is not fatal
          const data = await res.json();
          for (const q of data.questions || []) {
            merged[q.id] = Object.assign({}, q, {
              week: data.week || week,
              week_title: data.title || '',
            });
          }
        }
        if (!Object.keys(merged).length) throw new Error('question bank is empty');
        bank = merged;
        return bank;
      })();
    }
    return bankPromise;
  }

  /* ---- state ----------------------------------------------------------- */
  function blankItem() {
    return {
      streak: 0, correct: 0, wrong: 0, lapses: 0,
      due: isoLocal(now()), last: null,
      last_choice: null, last_correct: null,
      mastered: false, notes: [],
    };
  }

  function blankState() {
    return {
      version: STATE_VERSION,
      exam_date: EXAM_DATE,
      intervals_minutes: DEFAULT_INTERVALS.slice(),
      mastery_streak: DEFAULT_MASTERY_STREAK,
      items: {},
    };
  }

  // Mirrors srs.load_state(): refuses a NEWER file, upgrades an older one, and
  // backfills last_choice / last_correct so the archive can colour every row.
  function normaliseState(raw) {
    const st = raw && typeof raw === 'object' ? raw : blankState();
    const fileVersion = st.version || 1;
    if (fileVersion > STATE_VERSION) {
      throw new Error(
        `This browser holds progress in format v${fileVersion}, but this build `
        + `understands v${STATE_VERSION}. Refusing to load it rather than `
        + `silently downgrade your progress.`);
    }
    if (fileVersion < 2 || st.intervals_days) {
      st.intervals_minutes = DEFAULT_INTERVALS.slice();
      st.mastery_streak = DEFAULT_MASTERY_STREAK;
    } else {
      if (!st.intervals_minutes) st.intervals_minutes = DEFAULT_INTERVALS.slice();
      if (!st.mastery_streak) st.mastery_streak = DEFAULT_MASTERY_STREAK;
    }
    delete st.intervals_days;
    st.version = STATE_VERSION;
    st.exam_date = st.exam_date || EXAM_DATE;
    if (!st.items) st.items = {};

    for (const item of Object.values(st.items)) {
      if (!('last_choice' in item)) item.last_choice = null;
      if (!('last_correct' in item)) {
        // Infer from the counters: a live streak means the last answer was
        // correct, a reset streak with wrongs on record means it was not.
        if (item.mastered || (item.streak || 0) > 0) item.last_correct = true;
        else if ((item.wrong || 0) > 0) item.last_correct = false;
        else item.last_correct = null;
      }
    }
    return st;
  }

  let state = null;

  function loadState() {
    if (state) return state;
    let raw = null;
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      if (text) raw = JSON.parse(text);
    } catch (e) {
      console.warn('could not read saved progress, starting fresh:', e);
    }
    state = normaliseState(raw);
    return state;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
    } catch (e) {
      console.warn('could not save progress (storage full or blocked):', e);
    }
  }


  /* ---- the ladder ------------------------------------------------------ */
  function intervalFor(streak, intervals) {
    const idx = Math.min(Math.max(streak, 1) - 1, intervals.length - 1);
    return intervals[idx];
  }

  function stageOf(streak, intervals) {
    return Math.min(Math.max(streak, 1), intervals.length);
  }

  function applyGrade(item, correct, st, nowDt, choice) {
    nowDt = nowDt || now();
    const intervals = st.intervals_minutes;
    item.last_correct = !!correct;
    item.last_choice = choice === undefined ? null : choice;

    let outcome, gap;
    if (correct) {
      item.correct += 1;
      item.streak += 1;
      item.last = isoLocal(nowDt);
      if (item.streak >= st.mastery_streak) {
        item.mastered = true;
        item.due = null;
        outcome = 'mastered';
        gap = null;
      } else {
        gap = intervalFor(item.streak, intervals);
        item.due = isoLocal(new Date(nowDt.getTime() + gap * 60000));
        outcome = 'archived';
      }
    } else {
      // a mistake sends the question back to the start of the ladder
      item.wrong += 1;
      item.lapses += 1;
      item.streak = 0;
      item.mastered = false;
      item.last = isoLocal(nowDt);
      gap = intervals[0];
      item.due = isoLocal(new Date(nowDt.getTime() + gap * 60000));
      outcome = 'relearn';
    }
    return {
      outcome, gap_minutes: gap, due: item.due, streak: item.streak,
      stage: stageOf(item.streak, intervals),
    };
  }

  function isDue(item, nowDt) {
    if (item.mastered) return false;
    const due = parseDue(item.due);
    if (due === null) return true;
    return due <= (nowDt || now());
  }

  function select(st, bk, week, includeAll) {
    const nowDt = now();
    const rows = [];
    for (const qid of Object.keys(bk)) {
      const q = bk[qid];
      if (week && q.week !== week) continue;
      const item = st.items[qid];
      if (!item || item.mastered) continue;
      if (!includeAll && !isDue(item, nowDt)) continue;
      rows.push([qid, item]);
    }
    // weakest first: never-seen, then most-lapsed, then lowest streak
    rows.sort((a, b) => {
      const ac = a[1].correct > 0 ? 1 : 0, bc = b[1].correct > 0 ? 1 : 0;
      if (ac !== bc) return ac - bc;
      if (a[1].lapses !== b[1].lapses) return b[1].lapses - a[1].lapses;
      if (a[1].streak !== b[1].streak) return a[1].streak - b[1].streak;
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });
    return rows;
  }

  function nextDue(st, bk, week) {
    const nowDt = now();
    let soonest = null;
    for (const qid of Object.keys(bk)) {
      const q = bk[qid];
      if (week && q.week !== week) continue;
      const item = st.items[qid];
      if (!item || item.mastered || isDue(item, nowDt)) continue;
      const due = parseDue(item.due);
      if (due && (soonest === null || due < soonest)) soonest = due;
    }
    return soonest;
  }

  function sync(st, bk) {
    let added = 0;
    for (const qid of Object.keys(bk)) {
      if (!st.items[qid]) { st.items[qid] = blankItem(); added += 1; }
    }
    return added;
  }

  /* ---- payload builders (mirror server.py) ----------------------------- */
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function examLabel() {
    const d = parseDue(EXAM_DATE);
    return `${WEEKDAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} `
      + `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  function clampInt(value, dflt, low, high) {
    const n = parseInt(value, 10);
    if (isNaN(n)) return dflt;
    return Math.max(low, Math.min(high, n));
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function statusPayload(st, bk) {
    const nowDt = now();
    const items = Object.values(st.items);
    return {
      exam_date: EXAM_DATE,
      exam_label: examLabel(),
      now_label: hhmm(nowDt),
      days_to_exam: daysToExam(),
      total: Object.keys(bk).length,
      untouched: items.filter((i) => i.correct === 0 && i.wrong === 0).length,
      mastered: items.filter((i) => i.mastered).length,
      waiting: items.filter((i) => !i.mastered && !isDue(i, nowDt)).length,
      // everything you have answered at least once - the same set the archive
      // page lists, so this always matches its "All" tab
      archived: items.filter((i) => (i.correct || 0) + (i.wrong || 0) > 0).length,
      due: select(st, bk).length,
      mastery_streak: st.mastery_streak,
      stages: st.intervals_minutes.length,
      ladder: st.intervals_minutes.map(humanizeMinutes),
      next_due: (() => { const n = nextDue(st, bk); return n ? isoLocal(n) : null; })(),
      next_due_in: (() => { const n = nextDue(st, bk); return n ? timeUntil(n, nowDt) : null; })(),
      per_week: WEEKS.map((week) => ({
        week,
        total: Object.values(bk).filter((q) => q.week === week).length,
        mastered: Object.keys(bk).filter((qid) =>
          bk[qid].week === week && (st.items[qid] || {}).mastered).length,
        due: select(st, bk, week).length,
      })),
      storage: 'browser',
    };
  }

  function questionPayload(st, bk, qs) {
    const nowDt = now();
    const week = qs.get('week') ? Number(qs.get('week')) : null;
    const includeAll = qs.get('all') === '1';
    const rows = select(st, bk, week, includeAll);
    if (!rows.length) {
      const nxt = nextDue(st, bk, week);
      return {
        done: true,
        next_due: nxt ? isoLocal(nxt) : null,
        next_due_in: nxt ? timeUntil(nxt, nowDt) : null,
      };
    }
    const qid = rows[0][0], item = rows[0][1], q = bk[qid], mcq = q.mcq;
    const payload = {
      id: qid, week: q.week, topic: q.topic || '', marks: q.marks || 1,
      stem: (mcq && mcq.stem) || q.q,
      streak: item.streak,
      stage: stageOf(item.streak, st.intervals_minutes),
      stages: st.intervals_minutes.length,
      mastery_streak: st.mastery_streak,
      remaining: rows.length,
      mode: mcq ? 'mcq' : 'open',
      pool: includeAll ? 'all' : 'due',
    };
    // Options are shuffled per request, exactly as the server does.
    if (mcq) payload.options = shuffle(mcq.options.slice());
    return payload;
  }

  function answerPayload(st, bk, body) {
    const qid = body.id;
    const q = bk[qid];
    if (!q) throw new Error(`unknown question: ${qid}`);
    const mcq = q.mcq;
    if (mcq) {
      if (body.choice === undefined) throw new Error("mcq question needs a 'choice'");
    } else if (body.correct === undefined) {
      throw new Error("open question needs 'correct'");
    }
    const correct = mcq ? body.choice === mcq.options[mcq.answer] : !!body.correct;
    const nowDt = now();
    if (!st.items[qid]) st.items[qid] = blankItem();
    const item = st.items[qid];
    const summary = applyGrade(item, correct, st, nowDt, mcq ? body.choice : null);
    saveState();
    return {
      id: qid, correct,
      correct_option: mcq ? mcq.options[mcq.answer] : null,
      model_answer: q.a, tip: q.tip || null,
      outcome: summary.outcome,
      due: summary.due,
      due_label: dueLabel(summary.due),
      returns_in: summary.due ? timeUntil(summary.due, nowDt) : null,
      gap_minutes: summary.gap_minutes,
      gap_label: summary.gap_minutes ? humanizeMinutes(summary.gap_minutes) : null,
      streak: summary.streak,
      stage: summary.stage,
      stages: st.intervals_minutes.length,
      mastery_streak: st.mastery_streak,
      mastered: item.mastered,
      last_choice: item.last_choice,
      last_correct: item.last_correct,
      remaining: select(st, bk).length,
    };
  }

  function archiveRows(st, bk, nowDt) {
    nowDt = nowDt || now();
    const waiting = [], mastered = [];
    for (const qid of Object.keys(bk).sort()) {
      const q = bk[qid];
      const item = st.items[qid];
      if (!item || (item.correct === 0 && item.wrong === 0)) continue;   // not archived yet
      const mcq = q.mcq;
      const row = {
        id: qid, week: q.week, topic: q.topic || '',
        stem: (mcq && mcq.stem) || q.q,
        question: q.q,
        model_answer: q.a,
        tip: q.tip || null,
        correct_option: mcq ? mcq.options[mcq.answer] : null,
        last_choice: item.last_choice,
        last_correct: item.last_correct,
        streak: item.streak, correct: item.correct,
        wrong: item.wrong, lapses: item.lapses,
        stage: stageOf(item.streak, st.intervals_minutes),
        stages: st.intervals_minutes.length,
        due: item.due,
        due_label: dueLabel(item.due),
        returns_in: timeUntil(item.due, nowDt),
        is_due: isDue(item, nowDt),
        mastered: !!item.mastered,
      };
      (item.mastered ? mastered : waiting).push(row);
    }
    waiting.sort((a, b) => (parseDue(a.due) || nowDt) - (parseDue(b.due) || nowDt));
    mastered.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { waiting, mastered };
  }

  function archivePayload(st, bk, qs) {
    const per = clampInt(qs.get('per'), 10, 1, 100);
    const { waiting, mastered } = archiveRows(st, bk);
    let filter = qs.get('filter');
    if (filter !== 'waiting' && filter !== 'mastered') filter = 'all';
    const rows = filter === 'waiting' ? waiting
      : filter === 'mastered' ? mastered : waiting.concat(mastered);
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / per));
    const page = Math.min(clampInt(qs.get('page'), 1, 1, 10000), pages);
    const start = (page - 1) * per;
    return {
      page, per, pages, total,
      counts: {
        all: waiting.length + mastered.length,
        waiting: waiting.length,
        mastered: mastered.length,
      },
      due_now: waiting.filter((r) => r.is_due).length,
      filter,
      rows: rows.slice(start, start + per),
      ladder: st.intervals_minutes.map(humanizeMinutes),
      mastery_streak: st.mastery_streak,
    };
  }

  function weakestPayload(st, bk, qs) {
    const n = clampInt(qs.get('n'), 10, 1, 1000);
    const rows = Object.keys(bk)
      .filter((qid) => !(st.items[qid] || {}).mastered)
      .map((qid) => [qid, st.items[qid] || blankItem()]);
    rows.sort((a, b) => {
      if (a[1].lapses !== b[1].lapses) return b[1].lapses - a[1].lapses;
      if (a[1].streak !== b[1].streak) return a[1].streak - b[1].streak;
      return a[1].correct - b[1].correct;
    });
    return rows.slice(0, n).map(([qid, it]) => {
      const q = bk[qid];
      return {
        id: qid, week: q.week, topic: q.topic || '',
        lapses: it.lapses, streak: it.streak,
        stem: (q.mcq && q.mcq.stem) || q.q,
      };
    });
  }

  /* ---- the archive snapshot, as a downloadable file -------------------- */
  function renderArchiveMarkdown(st, bk) {
    const nowDt = now();
    const { waiting, mastered } = archiveRows(st, bk, nowDt);
    const ladder = st.intervals_minutes
      .map((m, i) => `Review ${i + 1} +${humanizeMinutes(m)}`).join(' -> ') + ' -> mastered';
    const stamp = `${WEEKDAYS[nowDt.getDay()]} ${String(nowDt.getDate()).padStart(2, '0')} `
      + `${MONTHS[nowDt.getMonth()]} ${nowDt.getFullYear()} ${hhmm(nowDt)}`;
    const out = [
      '# Archive', '',
      `Generated ${stamp} by the IT7006 OOD trainer.`, '',
      'Every question you have answered lives here. **Waiting** means you answered it',
      'and it is queued to come back; **mastered** means it has been recalled',
      `correctly ${st.mastery_streak} times and is retired for good.`, '',
      `Ladder: ${ladder}.`, '', '---', '',
      `## Waiting for a review (${waiting.length})`, '',
    ];
    if (!waiting.length) out.push('_Nothing waiting. Answer some questions first._', '');
    for (const r of waiting) {
      out.push(
        `### ${r.id} - Week ${r.week} - ${r.topic}`, '',
        `- Review **${r.stage} of ${r.stages}** - returns **${r.returns_in}** (at ${r.due_label})`,
        `- streak ${r.streak} | correct ${r.correct} | wrong ${r.wrong} | lapses ${r.lapses}`,
        '', '> ' + r.stem.trim().replace(/\s*\n\s*/g, ' '), '',
        `**Correct answer:** ${r.correct_option || r.model_answer}`, '',
        '**Your last answer:** ' + (r.last_choice ? `${r.last_choice} — ` : '')
          + (r.last_correct ? '✔ correct'
            : r.last_correct === false ? '✘ wrong' : 'not recorded')
          + (r.last_choice ? '' : ' _(no option was recorded for this attempt)_'),
        '');
    }
    out.push('---', '', `## Mastered (${mastered.length})`, '');
    if (!mastered.length) {
      out.push(`_Nothing yet - a question retires after ${st.mastery_streak} correct answers._`, '');
    }
    for (const r of mastered) {
      out.push(`- **${r.id}** - Week ${r.week} - ${r.topic} (correct ×${r.correct}, lapses ${r.lapses})`);
    }
    return out.join('\n') + '\n';
  }

  /* ---- the router the UI calls ----------------------------------------- */
  async function ready() {
    const bk = await loadBank();
    const st = loadState();
    // First run in a fresh browser: start tracking every question, otherwise
    // nothing would ever be "due" and the quiz would look empty.
    if (sync(st, bk) > 0) saveState();
    return { st, bk };
  }

  async function handle(path, body) {
    const { st, bk } = await ready();
    const parts = String(path).split('?');
    const route = parts[0];
    const qs = new URLSearchParams(parts[1] || '');
    switch (route) {
      case '/api/status': return statusPayload(st, bk);
      case '/api/question': return questionPayload(st, bk, qs);
      case '/api/answer': return answerPayload(st, bk, body || {});
      case '/api/archive': return archivePayload(st, bk, qs);
      case '/api/weakest': return weakestPayload(st, bk, qs);
      case '/api/reset':
        if (!body || !body.yes) throw new Error('reset needs yes:true');
        state = blankState();
        sync(state, bk);
        saveState();
        return { ok: true };
      case '/api/exam/paper': return examPaper(bk, qs);
      case '/api/exam/mark': return examMark(bk, body || {});
      case '/api/archive/write':
        return {
          ok: true,
          download: { name: 'archive.md', text: renderArchiveMarkdown(st, bk) },
        };
      default:
        throw new Error('unknown route: ' + route);
    }
  }

  /* ---- moving progress in and out -------------------------------------- */
  // A browser cannot write to disk, so the "snapshot" becomes a download. The
  // exported progress.json is byte-compatible with the Python CLI's own file.
  function exportState() {
    return {
      ok: true,
      download: {
        name: 'progress.json',
        text: JSON.stringify(loadState(), null, 2) + '\n',
      },
    };
  }

  async function importState(text) {
    state = normaliseState(JSON.parse(text));   // validates the version too
    const bk = await loadBank();
    sync(state, bk);
    saveState();
    return state;
  }

  function resetLocal() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    state = null;
  }

  /* ---- exam mode ------------------------------------------------------- */
  // A fixed paper drawn from the whole bank and weighted by each week's share
  // of the marks, so it looks like the real paper rather than like the due
  // queue. Answering it does NOT touch the spaced-repetition schedule: an exam
  // is a test, not study, and recording it would distort your intervals.
  function examPaper(bk, qs) {
    const n = clampInt(qs.get('n'), 20, 5, 130);
    const byWeek = {};
    const marksOf = {};
    for (const qid of Object.keys(bk)) {
      const w = bk[qid].week;
      (byWeek[w] = byWeek[w] || []).push(qid);
      marksOf[w] = (marksOf[w] || 0) + (bk[qid].marks || 1);
    }
    const grand = Object.values(marksOf).reduce((a, b) => a + b, 0) || 1;
    const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b);

    // largest-remainder apportionment, capped at each week's pool, then the
    // remainder handed out round-robin so the counts always total exactly n
    const quotas = weeks.map((w) => ({ w, exact: (marksOf[w] / grand) * n, take: 0 }));
    for (const q of quotas) {
      q.take = Math.min(Math.floor(q.exact), byWeek[q.w].length);
    }
    quotas.sort((a, b) => (b.exact % 1) - (a.exact % 1));
    let used = quotas.reduce((a, q) => a + q.take, 0);
    let progressed = true;
    while (used < n && progressed) {
      progressed = false;
      for (const q of quotas) {
        if (used >= n) break;
        if (q.take < byWeek[q.w].length) { q.take += 1; used += 1; progressed = true; }
      }
    }

    const picked = [];
    for (const q of quotas) {
      picked.push(...shuffle(byWeek[q.w].slice()).slice(0, q.take));
    }
    shuffle(picked);

    const questions = picked.map((qid) => {
      const q = bk[qid], mcq = q.mcq;
      return {
        id: qid, week: q.week, topic: q.topic || '', marks: q.marks || 1,
        stem: (mcq && mcq.stem) || q.q,
        options: mcq ? shuffle(mcq.options.slice()) : null,
        mode: mcq ? 'mcq' : 'open',
      };
    });
    return {
      count: questions.length,
      total_marks: questions.reduce((a, q) => a + q.marks, 0),
      breakdown: quotas.map((q) => ({ week: q.w, count: q.take }))
        .sort((a, b) => a.week - b.week),
      questions,
    };
  }

  // Marks a whole paper in one go, so nothing is revealed while the clock runs.
  function examMark(bk, body) {
    const answers = (body && body.answers) || [];
    const results = [];
    let score = 0, total = 0;
    for (const a of answers) {
      const q = bk[a.id];
      if (!q) continue;
      const mcq = q.mcq;
      const marks = q.marks || 1;
      total += marks;
      const answered = a.choice !== undefined && a.choice !== null;
      // an unanswered question is not the same as a wrong one, so leave it null
      const correct = (mcq && answered) ? a.choice === mcq.options[mcq.answer] : null;
      if (correct) score += marks;
      results.push({
        id: a.id, week: q.week, topic: q.topic || '', marks,
        stem: (mcq && mcq.stem) || q.q,
        question: q.q,
        your_choice: mcq && answered ? a.choice : null,
        correct_option: mcq ? mcq.options[mcq.answer] : null,
        correct, answered,
        model_answer: q.a,
        tip: q.tip || null,
      });
    }
    return {
      score, total,
      percent: total ? Math.round((score / total) * 100) : 0,
      answered: results.filter((r) => r.answered).length,
      count: results.length,
      results,
    };
  }

  return {
    // what app.js needs
    handle, ready, exportState, importState, resetLocal,
    // exposed for the test suite and for poking at it in the console
    STATE_VERSION, STORAGE_KEY, EXAM_DATE, WEEKS,
    loadBank, loadState, saveState, blankState, blankItem, normaliseState,
    applyGrade, isDue, select, nextDue, sync, intervalFor, stageOf,
    humanizeMinutes, dueLabel, timeUntil, parseDue, isoLocal, daysToExam,
    archiveRows, renderArchiveMarkdown, examLabel,
    statusPayload, questionPayload, answerPayload, archivePayload, weakestPayload,
    examPaper, examMark,
  };
})();




# OOD Trainer — spaced-repetition study app

A dark-mode, keyboard-driven revision app for the **IT7006 Object-Oriented
Design** midterm: 145 questions covering programming approaches, OO concepts,
UML class diagrams, use case and sequence diagrams, and design patterns.

**▶ Open it: <https://salehabdulla.github.io/ood-trainer/>**

No install, no signup, no account. Your progress is saved in your own browser
and never leaves your device.

---

## What it does

It is a spaced-repetition trainer, not a quiz. Every question you answer comes
back on a widening schedule, and a question is only retired once you have
recalled it correctly four times across three gaps:

| Correct answer | Review | Comes back after |
|---|---|---|
| 1st | Review 1 | **+5 minutes** |
| 2nd | Review 2 | **+15 minutes** |
| 3rd | Review 3 | **+1 hour** |
| 4th | — | **mastered** — retired |
| *any wrong answer* | back to the start | **+5 minutes** |

A mistake puts the question straight back on the first rung, so the things you
are worst at come back most often.

**A stat bar sits above every view:** *Due now · Waiting · Mastered · Archived ·
Untouched · Session · Accuracy*. **Archived** is how many questions you have
answered at least once — the same set the Archive tab lists, so the two numbers
always agree. (Waiting and Mastered are the parts of it; neither is the total.)

**A coverage bar sits under it**, showing the whole bank at a glance: green is
mastered, blue is answered and still in rotation, and the grey remainder is
untouched — with `8 of 145 answered · 0 mastered` and a percentage alongside.

It is deliberately **not** a mastery bar. Mastery needs four correct recalls per
question, so a mastery-only bar would sit at 0% while you answered question
after question. This one moves the moment you answer anything, and turns green
at 100% once you have seen every question.

### The quiz

- **Auto-advance.** Answer, the verdict holds for 2.5 s with a `next in 2.4s`
  chip, then the card fades out and the next question fades in. Press **Stay**,
  hover the model answer, or tap any key to cancel and read at your own pace.
- **Pager.** `page 4 / 12 · live` with **← Prev / Next →**. Step back and an
  answered question returns with its verdict, colours and locked options intact.
- **Keyboard first.** `1`–`4` to answer, `←`/`→` to page, `Enter` for the next.
- **Model answer after every question.** MCQ trains recognition; the paper asks
  you to *produce* structured answers. So the full model answer, plus a "where
  the marks are" note, is revealed every time. If you could not have written it
  yourself, that is your real signal — not whether you recognised it.
- **Live countdown.** When nothing is due, a timer counts down to the next
  review and loads it automatically at zero.

### The archive

Every question you have answered, paginated 10 to a page, with
**All / Waiting / Mastered** filters. Each row shows the question, the
**correct answer**, **the option you clicked last time**, and the model answer —
with the **border green if you got it right and red if you got it wrong**.

Rows that have come due are flagged `DUE NOW`, and a banner offers
*"N questions due now → Go to quiz"*. The list re-reads itself every few seconds,
so a question that expires while you are reading is waiting for you on the Quiz
tab.

### The exam

A timed paper, for rehearsing under pressure. Open the **Exam** tab:

- **Choose a size and a clock** — 10 to 145 questions, 15 to 120 minutes.
- **The paper is weighted by marks**, not by question count: each week contributes
  questions in proportion to its share of the bank's 637 marks, so the paper looks like
  the real thing rather than like your due queue.
- **Nothing is revealed while the clock runs.** No verdict, no model answer, no
  colour — you can change an answer as often as you like until you submit.
- **Submit when you are ready**, or the paper submits itself when the clock hits zero.
  Unanswered questions are marked but flagged as *not answered* rather than wrong.
- **The result** gives your score and percentage, a per-week breakdown, and a review of
  every question with your answer, the correct answer and the model answer — green
  border if you got it, red if you did not, grey if you skipped it.
- **Your revision schedule is untouched.** An exam is a test, not study, so nothing is
  recorded against your spaced-repetition intervals.

`1`–`4` answer, `←`/`→` move between questions.

### The dashboard

Per-week progress bars, your 12 weakest questions, an archived summary, and
reset.

---

## Your progress

Progress lives in **your browser's local storage**, under the key
`it7006-ood-progress`. Nothing is sent anywhere — there is no server, no
analytics, no account.

Because it is per-browser, it does **not** follow you between devices, and
clearing your browser's site data will wipe it. So:

- **Export progress.json** (Dashboard → Your progress) downloads your progress
  in exactly the format the bundled Python CLI uses.
- **Import progress.json** loads one back — handy for moving to another device,
  or for restoring a backup.

### The bundled CLI

The repo also ships `srs.py`, a command-line version of the same engine, reading
the same `bank/*.json` and the same `progress.json`. The two are interchangeable:
export from the site, drop it next to `srs.py`, and keep going in the terminal.

```bash
python3 srs.py status               # how much is due, days to the exam
python3 srs.py quiz --week 3        # an interactive quiz session
python3 srs.py next                 # the single next question
python3 srs.py grade w3-05 wrong    # record an answer yourself
python3 srs.py archive              # waiting + mastered, with the answers
python3 srs.py archive --write      # also snapshot it to archive/archive.md
python3 srs.py weakest -n 15        # what you keep getting wrong
python3 srs.py stats                # every question, one line each
```

### Running the web UI locally

The site needs no server, but if you want the server-backed version (progress in
`progress.json` instead of the browser) it is included:

```bash
python3 server.py                   # then open http://127.0.0.1:8765
python3 server.py --port 9000 --no-browser
```

`index.html` works out which backend is available by itself: if a server answers
it uses it, otherwise it runs entirely in the page.

---

## Contents

```
index.html            the app (served by GitHub Pages)
style.css             dark theme
app.js                UI: quiz, pager, archive, dashboard
srs.js                the scheduling engine, in the browser
bank/week1-5.json     145 questions / 637 marks, each with 4 options,
                      a full model answer and a marks tip
srs.py                the CLI (same engine, same state format)
server.py             optional local server for the browser UI
practical/            four UML drill sheets with self-mark checklists
PLAN.md               a suggested revision schedule
```

To run the site locally rather than from the hosted URL, serve the folder over
HTTP — the app fetches `bank/*.json`, which browsers block on `file://`:

```bash
python3 -m http.server 8000     # then open http://127.0.0.1:8000
```

## Notes and limits

- **The answers are in the page.** Because this is a static site, `bank/*.json`
  is downloaded by the browser, so anyone who opens devtools can read the correct
  options. That is the trade-off for having no server. (The optional local server
  does *not* have this property — it keeps the answers server-side.)
- **Not affiliated with any university.** This is a personal revision tool. It
  contains only questions, answers and notes written for it — no lecture slides,
  no exercise sheets and no course solutions.
- **`progress.json` is gitignored.** It is personal. The committed repo starts
  with a clean slate; the app tracks all 145 questions on first run.

## Licence

MIT — see [LICENSE](LICENSE). Use it, fork it, point it at your own course.

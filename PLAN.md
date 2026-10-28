# IT7006 OOD — Midterm Battle Plan

**Exam:** Sunday **1 November 2026** (Assessment Week, Midterm — TBA time/room)
**Today:** Wednesday **28 October 2026** → **4 study days** (Wed, Thu, Fri, Sat)
**Split:** 60% theory (Weeks 1–5) · 40% practical (Use Case, Sequence, Class diagrams in EA)

**Bank size:** 120 questions (W1: 16 · W2: 25 · W3: 29 · W4: 28 · W5: 22)

---

## How the spaced repetition works

Every question is a card with a **streak** counter and a **review stage**.

| After answering… | What happens |
|---|---|
| **Correct** (streak 1) | Archived → back in **5 minutes** (Review 1) |
| **Correct** (streak 2) | Archived → back in **15 minutes** (Review 2) |
| **Correct** (streak 3) | Archived → back in **1 hour** (Review 3) |
| **Correct** (streak 4) | Archived → back in **1 day** (Review 4) |
| **Correct** (streak 5) | **MASTERED** — retired to the archive for good |
| **Wrong** | Straight back to the start of the ladder → due again in **5 minutes** |

So a question only retires after **5 correct answers across four widening gaps**.
That is what makes it stick — and it is all in one day, which is why the ladder
starts in minutes rather than days.

### How a session actually flows

Because the first rungs are minutes, a session is a rhythm rather than a
marathon:

1. **Pass 1** — work through everything due (all 120 the first time). Every
   correct answer is filed to the archive with a 5-minute timer; every mistake
   also comes back in 5 minutes.
2. **Wait 5 minutes.** The web UI counts down on screen and pulls the question
   in automatically; the CLI tells you `next review at 14:47`.
3. **Review 1** — the ones that came back. Correct → 15 minutes. Wrong → 5 again.
4. **Review 2 → 1 hour. Review 3 → 1 day. Review 4 → mastered.**

So a full cycle for one question is roughly: answer → +5 min → +15 min → +1 hr
→ +1 day → retired. Do the passes, and the app tells you when to come back.

Browse the archive any time to see every question you have answered and exactly
when each one returns:

```bash
python3 srs.py archive
```


**Commands you will use every day**

```bash
cd "/Users/salehabdulla/Desktop/Desktop/Desktop/POLYTECHNIC/Semester 7/IT7006 Object Oriented Design (OOD)/midterm_ood"

# the dark-mode MCQ web UI — fastest way to get volume in
python3 server.py            # opens http://127.0.0.1:8765

# or the terminal
python3 srs.py status            # exam countdown + today's workload
python3 srs.py quiz --week 3     # interactive quiz for one week
python3 srs.py quiz              # everything that is due today
python3 srs.py quiz --all        # ignore dates: sweep everything unmastered
python3 srs.py weakest -n 10     # your ten worst questions
python3 srs.py archive           # what you have already mastered
```

**Web UI keyboard:** `1`–`4` to answer · `Enter` for the next question ·
`Dashboard` button for per-week progress, weakest questions and the archive.

---

## Day 0 — Wednesday 28 Oct (today): Foundations

**Target: 41 questions attempted, 2 class diagrams drawn.**

| Block | Time | Do this |
|---|---|---|
| A | 90 min | `python3 srs.py quiz --week 1` → then `--week 2`. Answer **out loud in full sentences**, then reveal. |
| B | 60 min | `practical/01-class-diagram.md` → **Drill 1A** (University/aggregation) and **Drill 1B** (Shopping/composition). Self-mark. |
| C | 30 min | `python3 srs.py weakest -n 10` — re-drill everything you got wrong. |
| D | 15 min | Read the *Relationship Summary* and *How to Choose a Relationship* tables. Say them from memory. |

**Tonight's non-negotiable:** all 41 W1/W2 questions have been attempted at least once.

---

## Day 1 — Thursday 29 Oct: The heavy week (UML class diagrams)

**Target: 29 new questions + all W1/W2 returns.**

| Block | Time | Do this |
|---|---|---|
| A | 45 min | `python3 srs.py quiz` → clear everything that returned from yesterday. |
| B | 100 min | `python3 srs.py quiz --week 3` — the biggest single topic. Draw every relationship symbol on paper as you go. |
| C | 60 min | `practical/01-class-diagram.md` → **Drill 1C** (abstract/polymorphism), **1D** (interfaces), **1E** (full Magic Home class diagram). |
| D | 30 min | Write the *Relationship Summary* table (5 symbols) and the *Abstract vs Interface* table (4 rows) from memory, twice. |

**Tonight's non-negotiable:** you can draw all 5 relationship symbols and state the multiplicity for any association on request.

---

## Day 2 — Friday 30 Oct: Use Case + Sequence

**Target: 28 new questions + all returns.**

| Block | Time | Do this |
|---|---|---|
| A | 45 min | `python3 srs.py quiz` → clear returns (W1, W2 and any W3 from yesterday). |
| B | 80 min | `python3 srs.py quiz --week 4`. Focus on **include vs extend** and the **alt / opt / loop** fragments. |
| C | 75 min | `practical/02-usecase-diagram.md` → **Drill 2A** (Hotel) and **2B** (Hospital). Then `practical/03-sequence-diagram.md` → **Drills 3A–3D** (SMS CRUD). |
| D | 20 min | Say the *include vs extend* 5-row table out loud 3 times, then the *wording decoder* table. |

**Tonight's non-negotiable:** you can name all 4 sequence lifeline stereotypes and explain include vs extend without notes.

---

## Day 3 — Saturday 31 Oct: Patterns + full mock

**Target: 22 new questions + everything not yet mastered.**

| Block | Time | Do this |
|---|---|---|
| A | 60 min | `python3 srs.py quiz --week 5`. Memorise the **pattern picker** table and the **APIE mapping**. |
| B | 60 min | `practical/04-design-patterns.md` → **Drill 4F** (pattern selection) + **4A** (Factory) and **4E** (Observer). |
| C | 90 min | **Full mock:** take your course's Week 6 revision exercises (class + use case, then sequence + patterns) end-to-end, timed, in EA. Compare against the published solutions. |
| D | 45 min | `python3 srs.py quiz --all` — sweep every unmastered question one last time. |
| E | 20 min | `python3 srs.py weakest -n 15` and write out the answers you keep missing, by hand. |

**Tonight's non-negotiable:** zero questions left in `weakest` with more than 1 lapse. Sleep 8 hours.

---

## Exam day — Sunday 1 Nov

**Morning (30 min maximum, no new material):**

1. `python3 srs.py status` — look at the number, not the questions.
2. `python3 srs.py quiz --all -n 20` — a light confidence sweep only.
3. Read these three tables one final time:
   - Relationship symbols (association / aggregation / composition / generalization / dependency)
   - include vs extend
   - The 30-second pattern picker

**Do not learn anything new on exam day.** Consolidation beats cramming at this point.

---

## Exam answer-writing rules

1. **Read the marks.** A 6-mark question needs 6 distinct points, not one long paragraph.
2. **Use the lecturer's exact phrasing.** "A pattern is a design idea, NOT a finished program." "WHO should be responsible for WHAT?" "Open for extension, closed for modification." These are the phrases being marked.
3. **Always justify a relationship or pattern choice.** Name it, state the problem, state the benefit.
4. **Tables score fast.** Wherever a question compares two things (include/extend, abstract/interface, aggregation/composition, use case/sequence), draw a table.
5. **In EA diagrams, label everything** — association names, role names, multiplicities, stereotypes (`«creates»`, `«clones»`). Unlabelled arrows lose marks.
6. **If you run out of time on a diagram**, write the numbered message sequence or the class list in text. Markers give marks for correct content even without the drawing.

---

## Practising with me (Cline)

You don't have to drive the tool yourself. Just say one of these and I will run the session for you:

| You say | What I do |
|---|---|
| "Quiz me on week 3" | I pull the next due W3 question with `next --json`, ask it, wait for your answer, then grade it with `grade <id> correct\|wrong` and tell you the model answer |
| "Start my daily session" | I run `today`, work through everything due, grading as we go |
| "What am I weakest at?" | I run `weakest` and build a focused drill from those questions |
| "Test me on include vs extend" | I ask only the questions tagged to that topic |
| "Show me my progress" | I run `status` and `stats` and explain what to do next |
| "Give me a mock exam" | I assemble a timed paper from the bank: 40% practical (one class, one use case, one sequence, one pattern-selection) + 60% theory |

**When you want volume, use the web UI instead of me** — `python3 server.py`
then answer with `1`–`4` and `Enter`. It is much faster per question than a chat
round-trip, and it writes to the same `progress.json`, so I can still see exactly
where you stand and drill your weak spots afterwards.

**Always answer out loud (or in writing) BEFORE I reveal the model answer.** The act of producing the answer is what builds the memory — reading the model answer alone does nothing. The same applies in the web UI: pick your option *before* looking at the reveal panel.

---

## Progress checklist

Print this or keep it open. Tick as you go.

| Checkpoint | Due by | Done |
|---|---|---|
| W1 + W2 attempted (41 Q) | Wed night | ☐ |
| Drill 1A + 1B self-marked ≥ 8/10 | Wed night | ☐ |
| All W1/W2 returns cleared | Thu morning | ☐ |
| W3 attempted (29 Q) | Thu night | ☐ |
| 5 relationship symbols + abstract-vs-interface table from memory | Thu night | ☐ |
| Drill 1C + 1D + 1E self-marked ≥ 8/10 | Thu night | ☐ |
| W4 attempted (28 Q) | Fri night | ☐ |
| include-vs-extend table from memory | Fri night | ☐ |
| Drill 2A + 2B self-marked ≥ 9/12 | Fri night | ☐ |
| Drills 3A–3D self-marked ≥ 6/8 | Fri night | ☐ |
| W5 attempted (22 Q) | Sat night | ☐ |
| Pattern picker table from memory (all 6) | Sat night | ☐ |
| Drill 4F pattern selection: 5/5 correct | Sat night | ☐ |
| Full Week 6 mock completed and compared | Sat night | ☐ |
| `weakest` shows no question with 2+ lapses | Sat night | ☐ |
| 100+ questions mastered in `archive` | Sat night | ☐ |


#!/usr/bin/env python3
"""
IT7006 Object-Oriented Design - Midterm spaced-repetition trainer.

The rule set ("solve it, archive it, bring it back based on how many times
you solved it"):

    CORRECT  ->  streak + 1. The question is archived and comes back after a
                 gap that grows with the streak:
                     1st correct -> Review 1 -> +5 minutes
                     2nd correct -> Review 2 -> +15 minutes
                     3rd correct -> Review 3 -> +1 hour
                     4th correct -> MASTERED (retired to the archive)
    WRONG    ->  a mistake sends the question back to the start of the ladder,
                 so it is due again in 5 minutes, and a lapse is recorded.

A question with streak >= mastery_streak is MASTERED. Mastered questions never
return to the queue; they live in the archive and can be browsed any time.

The ladder and the threshold are a pair: `intervals_minutes` holds the gaps and
`mastery_streak` is len(intervals) + 1, so that every gap gets used before a
question retires. Change one without the other and the last rung goes unused.

Because the first rungs are minutes, `due` is a full date+time, not a date.

Usage
-----
    python3 study/srs.py sync                 # pull new questions into progress
    python3 study/srs.py status               # exam countdown + what is due now
    python3 study/srs.py today [--week 3]     # what is due right now
    python3 study/srs.py quiz [--week 3] [-n 10]
    python3 study/srs.py next --json          # next due question, machine readable
    python3 study/srs.py grade w3-004 correct [--note "..."]
    python3 study/srs.py stats                # per-question table
    python3 study/srs.py archive [--write]    # archived questions + when they return
    python3 study/srs.py weakest [-n 10]      # most lapsed questions
    python3 study/srs.py reset --yes          # wipe progress

    Add --json to any read-only command for machine-readable output.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta

ROOT = os.path.dirname(os.path.abspath(__file__))
BANK_DIR = os.path.join(ROOT, "bank")
STATE_PATH = os.path.join(ROOT, "progress.json")
ARCHIVE_DIR = os.path.join(ROOT, "archive")

EXAM_DATE = date(2026, 11, 1)

# minutes between reviews, indexed by the streak (1st correct, 2nd, 3rd)
DEFAULT_INTERVALS = [5, 15, 60]
DEFAULT_MASTERY_STREAK = 4          # len(intervals) + 1
STATE_VERSION = 4          # v3 added last_choice / last_correct; v4 shortens the
                           # ladder to three rungs (mastery after 4 corrects)
WEEKS = [1, 2, 3, 4, 5]



def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


# --------------------------------------------------------------------------- #
# storage
# --------------------------------------------------------------------------- #
def load_bank() -> dict:
    """Return {question_id: question_dict} merged from every bank/weekN.json."""
    bank: dict = {}
    if not os.path.isdir(BANK_DIR):
        die(f"question bank folder not found: {BANK_DIR}")
    for week in WEEKS:
        path = os.path.join(BANK_DIR, f"week{week}.json")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        for q in data.get("questions", []):
            q = dict(q)
            q["week"] = data.get("week", week)
            q["week_title"] = data.get("title", "")
            bank[q["id"]] = q
    if not bank:
        die("question bank is empty")
    return bank


def now() -> datetime:
    """Current local time, truncated to the second."""
    return datetime.now().replace(microsecond=0)


def parse_due(value):
    """Accept a legacy 'YYYY-MM-DD' or a full ISO datetime. Returns datetime|None."""
    if not value:
        return None
    text = str(value)
    if len(text) == 10:                       # legacy date-only
        text += "T00:00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def blank_state() -> dict:
    return {
        "version": STATE_VERSION,
        "exam_date": EXAM_DATE.isoformat(),
        "intervals_minutes": list(DEFAULT_INTERVALS),
        "mastery_streak": DEFAULT_MASTERY_STREAK,
        "items": {},
    }


def load_state() -> dict:
    if not os.path.exists(STATE_PATH):
        return blank_state()
    with open(STATE_PATH, encoding="utf-8") as fh:
        state = json.load(fh)

    # Guard against a DOWNGRADE: a stale long-running process (e.g. a web server
    # started before an upgrade) would otherwise read a newer file with old code
    # and quietly write the old format back.
    file_version = state.get("version", 1)
    if file_version > STATE_VERSION:
        die(f"progress.json is format version {file_version} but this code is version "
            f"{STATE_VERSION}. You are running an old copy of srs.py or a stale web "
            f"server - stop it and restart before answering anything.")

    # v1 used day-based intervals and date-only `due`; v2 moved to minutes and
    # full datetimes; v3 added last_choice / last_correct; v4 shortened the
    # ladder from four rungs to three, so mastery takes 4 corrects not 5.
    #
    # The ladder lives in the state file, so an upgrade has to rewrite it - just
    # changing the defaults in this file would leave an existing progress.json
    # still on the old ladder.
    migrated = file_version < STATE_VERSION or "intervals_days" in state
    if file_version < STATE_VERSION or "intervals_days" in state:
        state.pop("intervals_days", None)
        state["version"] = STATE_VERSION
    if file_version < 4 or "intervals_days" in state:
        state["intervals_minutes"] = list(DEFAULT_INTERVALS)
        state["mastery_streak"] = DEFAULT_MASTERY_STREAK
    else:
        state.setdefault("intervals_minutes", list(DEFAULT_INTERVALS))
        state.setdefault("mastery_streak", DEFAULT_MASTERY_STREAK)
    state.setdefault("items", {})

    # v3: every item needs last_choice / last_correct so the archive can show
    # what you picked last time and colour the row accordingly.
    for item in state["items"].values():
        if "last_choice" not in item:
            item["last_choice"] = None       # unknowable for pre-v3 answers
            migrated = True
        if "last_correct" not in item:
            # Infer it from the counters: a live streak means the last answer
            # was correct, and a reset streak with wrongs on record means it
            # was not. Never attempted stays None.
            if item.get("mastered") or item.get("streak", 0) > 0:
                item["last_correct"] = True
            elif item.get("wrong", 0) > 0:
                item["last_correct"] = False
            else:
                item["last_correct"] = None
            migrated = True

    if migrated:
        save_state(state)      # persist the one-time format upgrade immediately
    return state



def save_state(state: dict) -> None:
    """Write progress.json atomically.

    We write to a temp file in the same directory, flush + fsync it to disk,
    then os.replace() it over the real file. os.replace() is atomic on POSIX,
    so an interrupted write (crash, Ctrl-C, full disk, power loss) can never
    leave progress.json half-written or truncated.
    """
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=2, sort_keys=True)
        fh.write("\n")
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, STATE_PATH)


def blank_item(now_dt: datetime | None = None) -> dict:
    return {
        "streak": 0,
        "correct": 0,
        "wrong": 0,
        "lapses": 0,
        "due": (now_dt or now()).isoformat(),
        "last": None,
        "last_choice": None,     # option text picked last time (None if unknown)
        "last_correct": None,    # was that last answer right?
        "mastered": False,
        "notes": [],
    }


# --------------------------------------------------------------------------- #
# scheduling core
# --------------------------------------------------------------------------- #
def interval_for(streak: int, intervals: list) -> int:
    """Minutes until the next review, given the number of consecutive corrects.

    streak 1 -> intervals[0] = Review 1 rung, streak 2 -> intervals[1], etc.
    """
    idx = min(max(streak, 1) - 1, len(intervals) - 1)
    return intervals[idx]


def stage_of(streak: int, intervals: list) -> int:
    """Which review rung (1-based) the item is on or waiting for."""
    return min(max(streak, 1), len(intervals))


def apply_grade(item: dict, correct: bool, state: dict,
                now_dt: datetime | None = None, choice: str | None = None) -> dict:
    """Mutate `item` in place and return a small summary of what happened.

    `choice` is the option text the user picked, when there was one. It is
    recorded so the archive can show what you answered last time.
    """
    now_dt = now_dt or now()
    intervals = state["intervals_minutes"]

    item["last_correct"] = bool(correct)
    item["last_choice"] = choice      # None when the answer was self-marked, so
                                      # the two always describe the same attempt

    if correct:
        item["correct"] += 1
        item["streak"] += 1
        item["last"] = now_dt.isoformat()
        if item["streak"] >= state["mastery_streak"]:
            item["mastered"] = True
            item["due"] = None
            outcome, gap = "mastered", None
        else:
            gap = interval_for(item["streak"], intervals)
            item["due"] = (now_dt + timedelta(minutes=gap)).isoformat()
            outcome = "archived"
    else:
        # a mistake sends the question back to the start of the ladder,
        # so it is due again after the first interval (5 minutes)
        item["wrong"] += 1
        item["lapses"] += 1
        item["streak"] = 0
        item["mastered"] = False
        item["last"] = now_dt.isoformat()
        gap = intervals[0]
        item["due"] = (now_dt + timedelta(minutes=gap)).isoformat()
        outcome = "relearn"

    return {
        "outcome": outcome,
        "gap_minutes": gap,
        "due": item["due"],
        "streak": item["streak"],
        "stage": stage_of(item["streak"], intervals),
    }


def is_due(item: dict, now_dt: datetime | None = None) -> bool:
    if item.get("mastered"):
        return False
    due = parse_due(item.get("due"))
    if due is None:
        return True
    return due <= (now_dt or now())


def select(state: dict, bank: dict, week=None, include_all=False, include_mastered=False):
    """Ordered list of (qid, item) that should be studied now."""
    now_dt = now()
    rows = []
    for qid, q in bank.items():
        if week and q["week"] != week:
            continue
        item = state["items"].get(qid)
        if item is None:
            continue
        if item["mastered"] and not include_mastered:
            continue
        if not include_all and not is_due(item, now_dt):
            continue
        rows.append((qid, item))
    # weakest first: never-seen, then most-lapsed, then lowest streak
    rows.sort(key=lambda r: (r[1]["correct"] > 0, -r[1]["lapses"], r[1]["streak"], r[0]))
    return rows


def next_due(state: dict, bank: dict, week=None) -> datetime | None:
    """When the soonest not-yet-due, not-yet-mastered question comes back."""
    now_dt = now()
    soonest = None
    for qid, q in bank.items():
        if week and q["week"] != week:
            continue
        item = state["items"].get(qid)
        if item is None or item.get("mastered") or is_due(item, now_dt):
            continue
        due = parse_due(item.get("due"))
        if due and (soonest is None or due < soonest):
            soonest = due
    return soonest


def days_to_exam(today: date | None = None) -> int:
    return (EXAM_DATE - (today or date.today())).days



# --------------------------------------------------------------------------- #
# presentation
# --------------------------------------------------------------------------- #
BAR = "-" * 72


def humanize_minutes(mins) -> str:
    """600 -> '10 h', 1440 -> '1 d', 45 -> '45 min'."""
    mins = int(round(mins))
    if mins < 60:
        return f"{mins} min"
    hours, m = divmod(mins, 60)
    if hours < 24:
        return f"{hours} h" + (f" {m} min" if m else "")
    days, h = divmod(hours, 24)
    return f"{days} d" + (f" {h} h" if h else "")


def due_label(due_value) -> str:
    """Absolute label: '14:35' if today, otherwise 'Thu 14:35'."""
    due = parse_due(due_value)
    if due is None:
        return "—"
    if due.date() == date.today():
        return due.strftime("%H:%M")
    return due.strftime("%a %H:%M")


def time_until(due_value, now_dt: datetime | None = None) -> str:
    """Relative label: 'in 4 min', 'in 1 h 20 min', 'due now'."""
    due = parse_due(due_value)
    if due is None:
        return "—"
    delta = (due - (now_dt or now())).total_seconds() / 60.0
    if delta <= 0:
        return "due now"
    return "in " + humanize_minutes(delta)


def fmt_question(q: dict, item: dict, index=None, total=None) -> str:
    head = f"[{index}/{total}] " if index else ""
    tag = "NEW" if item["correct"] == 0 and item["wrong"] == 0 else f"streak {item['streak']}"
    return "\n".join([
        BAR,
        f"{head}{q['id']}   Week {q['week']} - {q.get('topic', '')}   ({tag})",
        f"marks: {q.get('marks', 1)}",
        BAR,
        q["q"].strip(),
    ])


def fmt_answer(q: dict) -> str:
    lines = [BAR, "MODEL ANSWER", BAR, q["a"].strip()]
    if q.get("tip"):
        lines += ["", f"tip: {q['tip']}"]
    return "\n".join(lines)


def sync(state: dict, bank: dict, now_dt: datetime | None = None) -> int:
    """Add any bank question that is not yet tracked. Returns how many added."""
    now_dt = now_dt or now()
    added = 0
    for qid in bank:
        if qid not in state["items"]:
            state["items"][qid] = blank_item(now_dt)
            added += 1
    return added



# --------------------------------------------------------------------------- #
# commands
# --------------------------------------------------------------------------- #
def cmd_sync(args, state, bank):
    added = sync(state, bank)
    save_state(state)
    print(f"bank: {len(bank)} questions | newly tracked: {added} | total tracked: {len(state['items'])}")


def cmd_status(args, state, bank):
    now_dt = now()
    rows = select(state, bank)
    total = len(bank)
    mastered = sum(1 for i in state["items"].values() if i["mastered"])
    untouched = sum(1 for i in state["items"].values() if i["correct"] == 0 and i["wrong"] == 0)
    waiting = sum(1 for i in state["items"].values()
                  if not i["mastered"] and not is_due(i, now_dt))
    d = days_to_exam()
    nxt = next_due(state, bank)
    print(BAR)
    print(f"IT7006 OOD Midterm   exam: {EXAM_DATE:%a %d %b %Y}   ({d} day(s) away)")
    print(f"now: {now_dt:%a %d %b %Y %H:%M}")
    print(BAR)
    print(f"  questions in bank    : {total}")
    print(f"  never attempted      : {untouched}")
    print(f"  mastered (archived)  : {mastered}")
    print(f"  waiting for a review : {waiting}")
    print(f"  DUE RIGHT NOW        : {len(rows)}")
    if not rows and nxt:
        print(f"  next question at     : {due_label(nxt)}  ({time_until(nxt, now_dt)})")
    print(f"  remaining to master  : {total - mastered}")
    print(BAR)
    for week in WEEKS:
        w_rows = select(state, bank, week=week)
        w_total = sum(1 for q in bank.values() if q["week"] == week)
        w_done = sum(1 for qid, q in bank.items()
                     if q["week"] == week and state["items"].get(qid, {}).get("mastered"))
        filled = int(20 * w_done / w_total) if w_total else 0
        print(f"  Week {week}: [{'#' * filled}{'.' * (20 - filled)}] "
              f"{w_done}/{w_total} mastered   due now: {len(w_rows)}")
    print(BAR)
    if args.json:
        print(json.dumps({
            "exam_date": EXAM_DATE.isoformat(), "days_to_exam": d, "total": total,
            "untouched": untouched, "mastered": mastered, "due": len(rows),
            "waiting": waiting, "next_due": nxt.isoformat() if nxt else None,
        }, indent=2))


def cmd_today(args, state, bank):
    now_dt = now()
    rows = select(state, bank, week=args.week, include_all=args.all)
    if args.limit:
        rows = rows[: args.limit]
    if args.json:
        print(json.dumps([{"id": qid, "week": bank[qid]["week"], "topic": bank[qid].get("topic"),
                           "marks": bank[qid].get("marks", 1), "q": bank[qid]["q"],
                           "streak": item["streak"], "lapses": item["lapses"],
                           "due": item["due"], "mastered": item["mastered"],
                           "stage": stage_of(item["streak"], state["intervals_minutes"]),
                           "returns_in": time_until(item["due"], now_dt)}
                          for qid, item in rows], indent=2))
        return
    if not rows:
        nxt = next_due(state, bank, week=args.week)
        print("Nothing due right now.")
        if nxt:
            print(f"  next question comes back at {due_label(nxt)} ({time_until(nxt, now_dt)})")
        else:
            print("  nothing scheduled either - try `quiz --all` for a full sweep.")
        return
    print(f"{len(rows)} question(s) due now")
    for qid, item in rows:
        q = bank[qid]
        stage = stage_of(item["streak"], state["intervals_minutes"])
        print(f"  {qid}  w{q['week']}  review {stage}/{len(state['intervals_minutes'])}  "
              f"streak {item['streak']}  lapses {item['lapses']}  | {q.get('topic', '')}")



def cmd_next(args, state, bank):
    now_dt = now()
    rows = select(state, bank, week=args.week, include_all=args.all)
    if not rows:
        nxt = next_due(state, bank, week=args.week)
        if args.json:
            print(json.dumps({"done": True,
                              "next_due": nxt.isoformat() if nxt else None,
                              "next_due_in": time_until(nxt, now_dt) if nxt else None}))
        elif nxt:
            print(f"Nothing due right now. Next question at "
                  f"{due_label(nxt)} ({time_until(nxt, now_dt)}).")
        else:
            print("Nothing due right now.")
        return
    qid, item = rows[0]
    q = bank[qid]
    if args.json:
        print(json.dumps({"id": qid, "week": q["week"], "topic": q.get("topic"),
                          "marks": q.get("marks", 1), "q": q["q"], "a": q["a"],
                          "tip": q.get("tip"), "streak": item["streak"],
                          "stage": stage_of(item["streak"], state["intervals_minutes"]),
                          "remaining": len(rows)}, indent=2))
        return
    print(fmt_question(q, item))
    print(f"\n({len(rows)} due in total. After answering, record it with:\n"
          f"   python3 study/srs.py grade {qid} correct\n"
          f"   python3 study/srs.py grade {qid} wrong)")


def cmd_show(args, state, bank):
    for qid in args.ids:
        if qid not in bank:
            die(f"unknown question id: {qid}")
        item = state["items"].get(qid, blank_item())
        print(fmt_question(bank[qid], item))
        print()
        print(fmt_answer(bank[qid]))
        print()


def cmd_grade(args, state, bank):
    if args.id not in bank:
        die(f"unknown question id: {args.id}. Run `today` to list valid ids.")
    now_dt = now()
    item = state["items"].setdefault(args.id, blank_item(now_dt))
    correct = args.result.lower() in ("correct", "c", "right", "y", "yes", "1", "true")
    summary = apply_grade(item, correct, state, now_dt)
    if args.note:
        item["notes"].append({"date": now_dt.isoformat(), "note": args.note})
    save_state(state)
    if args.json:
        print(json.dumps({"id": args.id, **summary,
                          "due_label": due_label(summary["due"]),
                          "returns_in": time_until(summary["due"], now_dt)}, indent=2))
        return
    gap = humanize_minutes(summary["gap_minutes"]) if summary["gap_minutes"] else None
    if summary["outcome"] == "mastered":
        print(f"{args.id}: MASTERED after {item['correct']} correct - retired to the archive.")
    elif summary["outcome"] == "archived":
        print(f"{args.id}: correct. Archived - Review {summary['stage']} in {gap} "
              f"(at {due_label(summary['due'])}). streak {summary['streak']}/{state['mastery_streak']}")
    else:
        print(f"{args.id}: wrong. Back to the start of the ladder - due again in {gap} "
              f"(at {due_label(summary['due'])}). lapses: {item['lapses']}")
    print(f"  due right now: {len(select(state, bank))}")




def cmd_quiz(args, state, bank):
    """Interactive self-graded quiz."""
    now_dt = now()
    rows = select(state, bank, week=args.week, include_all=args.all)
    if not rows:
        nxt = next_due(state, bank, week=args.week)
        print("Nothing due right now.")
        if nxt:
            print(f"  next question comes back at {due_label(nxt)} ({time_until(nxt, now_dt)})")
        else:
            print("  nothing scheduled either - run with --all for a full sweep.")
        return
    if args.n:
        rows = rows[: args.n]
    queue = [qid for qid, _ in rows]
    done, total = 0, len(queue)
    print(BAR)
    print(f"QUIZ - {total} question(s)   exam in {days_to_exam()} day(s)")
    print("Enter = reveal answer | y = got it | n = wrong | s = skip | q = quit")
    print(BAR)
    while queue:
        qid = queue.pop(0)
        item = state["items"][qid]
        q = bank[qid]
        done += 1
        print()
        print(fmt_question(q, item, done, total))
        try:
            resp = input("\npress Enter to reveal > ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if resp == "q":
            break
        print()
        print(fmt_answer(q))
        try:
            verdict = input("\ngot it right? [y/n/s] > ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if verdict == "q":
            break
        if verdict == "s":
            print("skipped - still due")
            continue
        correct = verdict in ("y", "yes", "1", "true", "")
        summary = apply_grade(item, correct, state, now())
        gap = humanize_minutes(summary["gap_minutes"]) if summary["gap_minutes"] else None
        if summary["outcome"] == "mastered":
            print("  -> MASTERED - retired to the archive.")
        elif summary["outcome"] == "archived":
            print(f"  -> correct. Review {summary['stage']} in {gap} "
                  f"(at {due_label(summary['due'])}), streak {summary['streak']}/{state['mastery_streak']}")
        else:
            print(f"  -> wrong. Back to the start of the ladder - returns in {gap} "
                  f"(at {due_label(summary['due'])}), lapses {item['lapses']}")
        save_state(state)
    print()
    print(BAR)
    print("session finished.")
    print(f"  mastered total : {sum(1 for i in state['items'].values() if i['mastered'])}/{len(bank)}")
    print(f"  due right now  : {len(select(state, bank))}")
    nxt = next_due(state, bank)
    if nxt:
        print(f"  next review at : {due_label(nxt)} ({time_until(nxt, now())})")
    print(BAR)


def cmd_stats(args, state, bank):
    now_dt = now()
    print(BAR)
    print(f"{'id':<8} {'wk':<3} {'topic':<24} {'str':<4} {'stage':<6} {'ok':<4} "
          f"{'x':<4} {'lapse':<6} returns")
    print(BAR)
    for qid in sorted(bank):
        q = bank[qid]
        if args.week and q["week"] != args.week:
            continue
        item = state["items"].get(qid, blank_item(now_dt))
        if item["mastered"]:
            stage, ret = "-", "MASTERED"
        else:
            stage = f"{stage_of(item['streak'], state['intervals_minutes'])}/{len(state['intervals_minutes'])}"
            ret = time_until(item["due"], now_dt)
        print(f"{qid:<8} {q['week']:<3} {(q.get('topic') or '')[:24]:<24} "
              f"{item['streak']:<4} {stage:<6} {item['correct']:<4} {item['wrong']:<4} "
              f"{item['lapses']:<6} {ret}")
    print(BAR)



def archive_rows(state, bank, week=None, now_dt=None):
    """(waiting, mastered) - waiting items are archived and scheduled to return."""
    now_dt = now_dt or now()
    waiting, mastered = [], []
    for qid in sorted(bank):
        q = bank[qid]
        if week and q["week"] != week:
            continue
        item = state["items"].get(qid)
        if item is None or (item["correct"] == 0 and item["wrong"] == 0):
            continue                      # never attempted: not in the archive yet
        row = {
            "id": qid, "week": q["week"], "topic": q.get("topic", ""),
            "stem": (q.get("mcq") or {}).get("stem") or q["q"],
            "question": q["q"],
            "model_answer": q["a"],
            "tip": q.get("tip"),
            "correct_option": (q["mcq"]["options"][q["mcq"]["answer"]]
                               if q.get("mcq") else None),
            "last_choice": item.get("last_choice"),
            "last_correct": item.get("last_correct"),
            "streak": item["streak"], "correct": item["correct"],
            "wrong": item["wrong"], "lapses": item["lapses"],
            "stage": stage_of(item["streak"], state["intervals_minutes"]),
            "stages": len(state["intervals_minutes"]),
            "due": item["due"],
            "due_label": due_label(item["due"]),
            "returns_in": time_until(item["due"], now_dt),
            "is_due": is_due(item, now_dt),
            "mastered": bool(item["mastered"]),
        }
        (mastered if item["mastered"] else waiting).append(row)
    waiting.sort(key=lambda r: parse_due(r["due"]) or now_dt)
    mastered.sort(key=lambda r: r["id"])
    return waiting, mastered


def render_archive_markdown(state, bank) -> str:
    """A human-readable snapshot of the archive, written to study/archive/."""
    now_dt = now()
    waiting, mastered = archive_rows(state, bank, now_dt=now_dt)
    intervals = state["intervals_minutes"]
    ladder = " -> ".join(f"Review {i + 1} +{humanize_minutes(m)}"
                         for i, m in enumerate(intervals)) + " -> mastered"
    out = [
        "# Archive",
        "",
        f"Generated {now_dt:%a %d %b %Y %H:%M} by `study/srs.py archive --write`.",
        "",
        "Every question you have answered lives here. **Waiting** means you got it",
        "right and it is queued to come back; **mastered** means it has been recalled",
        f"correctly {state['mastery_streak']} times and is retired for good.",
        "",
        f"Ladder: {ladder}.",
        "",
        "---",
        "",
        f"## Waiting for a review ({len(waiting)})",
        "",
    ]
    if not waiting:
        out += ["_Nothing waiting. Answer some questions first._", ""]
    for r in waiting:
        out += [
            f"### {r['id']} - Week {r['week']} - {r['topic']}",
            "",
            f"- Review **{r['stage']} of {r['stages']}** - returns **{r['returns_in']}** "
            f"(at {r['due_label']})",
            f"- streak {r['streak']} | correct {r['correct']} | wrong {r['wrong']} "
            f"| lapses {r['lapses']}",
            "",
            "> " + r["stem"].strip().replace("\n", " "),
            "",
            f"**Correct answer:** {r['correct_option'] or r['model_answer']}",
            "",
            "**Your last answer:** "
            + (f"{r['last_choice']} — " if r["last_choice"] else "")
            + ("✔ correct" if r["last_correct"] else
               "✘ wrong" if r["last_correct"] is False else "not recorded")
            + ("" if r["last_choice"]
               else " _(no option was recorded for this attempt)_"),
            "",
        ]
    out += ["---", "", f"## Mastered ({len(mastered)})", ""]
    if not mastered:
        out += ["_Nothing mastered yet._", ""]
    for r in mastered:
        out += [
            f"### {r['id']} - Week {r['week']} - {r['topic']}",
            "",
            f"- Retired after {r['correct']} correct answers (lapses {r['lapses']})",
            "",
            "> " + r["stem"].strip().replace("\n", " "),
            "",
        ]
    return "\n".join(out) + "\n"


def cmd_archive(args, state, bank):
    now_dt = now()
    waiting, mastered = archive_rows(state, bank, week=args.week, now_dt=now_dt)

    if args.write:
        os.makedirs(ARCHIVE_DIR, exist_ok=True)
        path = os.path.join(ARCHIVE_DIR, "archive.md")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(render_archive_markdown(state, bank))
        print(f"wrote {path}")

    if args.json:
        print(json.dumps({"waiting": waiting, "mastered": mastered}, indent=2))
        return

    intervals = state["intervals_minutes"]
    print(BAR)
    print(f"ARCHIVE   {len(waiting)} waiting for a review | {len(mastered)} mastered")
    print("ladder: " + " -> ".join(
        f"R{i + 1} +{humanize_minutes(m)}" for i, m in enumerate(intervals)) + " -> mastered")
    print(BAR)

    print(f"WAITING FOR A REVIEW ({len(waiting)})")
    if not waiting:
        print("  nothing waiting - answer some questions first.")
    for r in waiting:
        mark = "OK" if r["last_correct"] else ("XX" if r["last_correct"] is False else "--")
        print(f"  [{mark}] {r['id']}  w{r['week']}  review {r['stage']}/{r['stages']}  "
              f"returns {r['returns_in']:<14} (at {r['due_label']})  | {r['topic']}")
        print(f"        Q: {r['stem'].strip().splitlines()[0][:90]}")
        ans = (r["correct_option"] or r["model_answer"]).strip().splitlines()[0]
        print(f"        A: {ans[:90]}")
        if r["last_choice"]:
            print(f"     yours: {r['last_choice'].strip().splitlines()[0][:90]}")

    print(BAR)
    print(f"MASTERED ({len(mastered)})")
    if not mastered:
        print(f"  nothing yet - a question retires after {state['mastery_streak']} correct answers.")
    for r in mastered:
        print(f"  {r['id']}  w{r['week']}  correct x{r['correct']}  lapses {r['lapses']}  "
              f"| {r['topic']}")
    print(BAR)
    print("snapshot the archive to a file with:  python3 study/srs.py archive --write")



def cmd_weakest(args, state, bank):
    rows = [(qid, state["items"][qid]) for qid in bank
            if not state["items"].get(qid, {}).get("mastered")]
    rows.sort(key=lambda r: (-r[1]["lapses"], r[1]["streak"], r[1]["correct"]))
    print(BAR)
    print("WEAKEST - fix these first")
    print(BAR)
    for qid, item in rows[: args.n]:
        q = bank[qid]
        print(f"  {qid}  w{q['week']}  lapses {item['lapses']}  streak {item['streak']}  "
              f"| {q.get('topic', '')}")
        print(f"      {q['q'].strip().splitlines()[0][:100]}")
    print(BAR)


def cmd_reset(args, state, bank):
    if not args.yes:
        die("refusing to wipe progress without --yes")
    save_state(blank_state())
    print("progress reset.")



# --------------------------------------------------------------------------- #
# cli
# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--json", action="store_true",
                        help="machine-readable output (read-only commands)")

    p = argparse.ArgumentParser(prog="srs.py",
                                description="IT7006 OOD midterm spaced-repetition trainer.")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name, fn, help_text, week=True, limit=False):
        s = sub.add_parser(name, help=help_text, parents=[common])
        if week:
            s.add_argument("--week", type=int, choices=WEEKS)
        if limit:
            s.add_argument("--limit", type=int)
        s.set_defaults(func=fn)
        return s

    add("sync", cmd_sync, "pull new bank questions into progress", week=False)

    for name, fn, helptext, extra in [
        ("status", cmd_status, "exam countdown and what is due right now", []),
        ("today", cmd_today, "list what is due right now", ["all"]),
        ("next", cmd_next, "show the next question", ["all"]),
        ("stats", cmd_stats, "full per-question table", []),
        ("archive", cmd_archive, "archived questions and when they return", ["write"]),
        ("weakest", cmd_weakest, "most-lapsed questions first", ["n"]),
    ]:
        s = add(name, fn, helptext, limit=True)
        if "all" in extra:
            s.add_argument("--all", action="store_true",
                           help="ignore due times, include everything unmastered")
        if "n" in extra:
            s.add_argument("-n", type=int, default=10, help="how many to show")
        if "write" in extra:
            s.add_argument("--write", action="store_true",
                           help="also write study/archive/archive.md")

    q = add("quiz", cmd_quiz, "interactive self-graded quiz")
    q.add_argument("-n", type=int, default=0, help="cap the number of questions")
    q.add_argument("--all", action="store_true", help="ignore due dates")

    sh = sub.add_parser("show", help="print question(s) and model answers", parents=[common])
    sh.add_argument("ids", nargs="+")
    sh.set_defaults(func=cmd_show)

    g = sub.add_parser("grade", help="record a result for one question", parents=[common])
    g.add_argument("id")
    g.add_argument("result", help="correct | wrong")
    g.add_argument("--note", default=None, help="what you got wrong")
    g.set_defaults(func=cmd_grade)

    r = sub.add_parser("reset", help="wipe all progress", parents=[common])
    r.add_argument("--yes", action="store_true")
    r.set_defaults(func=cmd_reset)

    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    state = load_state()
    bank = load_bank()
    if args.cmd != "reset" and sync(state, bank):
        save_state(state)
    args.func(args, state, bank)
    return 0


if __name__ == "__main__":
    sys.exit(main())


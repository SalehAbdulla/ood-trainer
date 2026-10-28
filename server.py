#!/usr/bin/env python3
"""
Optional local web server for the IT7006 OOD spaced-repetition trainer.

You do NOT need this to use the trainer - index.html runs entirely in the
browser (that is the copy hosted on GitHub Pages). This server exists for
local use: it reuses srs.py as the scheduling engine and keeps progress in
progress.json, so the browser UI and the CLI share one file.

Run from this folder:
    python3 server.py                      # then open http://127.0.0.1:8765
    python3 server.py --port 9000 --no-browser

Standard library only - no pip install, no framework.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)                 # srs.py sits next to this file

import srs  # noqa: E402  (the shared engine)

LOCK = threading.Lock()
STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
}


def _int(value, default: int, low: int, high: int) -> int:
    """Parse an int query parameter, clamped to [low, high], else `default`."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, n))


# --------------------------------------------------------------------------- #
# payload builders
# --------------------------------------------------------------------------- #
def _state_and_bank():
    """Load both, tracking any bank question that is not in progress yet.

    Without this a fresh clone (or a deleted progress.json) would show zero
    questions as due, because nothing would be in state["items"] to schedule.
    """
    state, bank = srs.load_state(), srs.load_bank()
    if srs.sync(state, bank):
        srs.save_state(state)
    return state, bank


def status_payload() -> dict:
    state, bank = _state_and_bank()
    bank = srs.load_bank()
    now_dt = srs.now()
    rows = srs.select(state, bank)
    mastered = sum(1 for i in state["items"].values() if i["mastered"])
    waiting = sum(1 for i in state["items"].values()
                  if not i["mastered"] and not srs.is_due(i, now_dt))
    per_week = []
    for week in srs.WEEKS:
        total = sum(1 for q in bank.values() if q["week"] == week)
        done = sum(1 for qid, q in bank.items()
                   if q["week"] == week and state["items"].get(qid, {}).get("mastered"))
        per_week.append({
            "week": week,
            "total": total,
            "mastered": done,
            "due": len(srs.select(state, bank, week=week)),
        })
    nxt = srs.next_due(state, bank)
    return {
        "exam_date": srs.EXAM_DATE.isoformat(),
        "exam_label": srs.EXAM_DATE.strftime("%a %d %b %Y"),
        "now_label": now_dt.strftime("%H:%M"),
        "days_to_exam": srs.days_to_exam(),
        "total": len(bank),
        "untouched": sum(1 for i in state["items"].values()
                         if i["correct"] == 0 and i["wrong"] == 0),
        "mastered": mastered,
        "waiting": waiting,
        "due": len(rows),
        "mastery_streak": state["mastery_streak"],
        "stages": len(state["intervals_minutes"]),
        "ladder": [srs.humanize_minutes(m) for m in state["intervals_minutes"]],
        "next_due": nxt.isoformat() if nxt else None,
        "next_due_in": srs.time_until(nxt, now_dt) if nxt else None,
        "per_week": per_week,
    }


def question_payload(state: dict, bank: dict, week=None, include_all=False) -> dict:
    """Build the next question WITHOUT ever leaking the answer."""
    now_dt = srs.now()
    rows = srs.select(state, bank, week=week, include_all=include_all)
    if not rows:
        nxt = srs.next_due(state, bank, week=week)
        return {
            "done": True,
            "next_due": nxt.isoformat() if nxt else None,
            "next_due_in": srs.time_until(nxt, now_dt) if nxt else None,
        }
    qid, item = rows[0]
    q = bank[qid]
    mcq = q.get("mcq")
    payload = {
        "id": qid,
        "week": q["week"],
        "topic": q.get("topic", ""),
        "marks": q.get("marks", 1),
        "stem": (mcq or {}).get("stem") or q["q"],
        "streak": item["streak"],
        "stage": srs.stage_of(item["streak"], state["intervals_minutes"]),
        "stages": len(state["intervals_minutes"]),
        "mastery_streak": state["mastery_streak"],
        "remaining": len(rows),
        "mode": "mcq" if mcq else "open",
        "pool": "all" if include_all else "due",
    }
    if mcq:
        opts = list(mcq["options"])
        random.shuffle(opts)          # order is randomised per request
        payload["options"] = opts     # correct text is NOT identified
    return payload


def answer_payload(qid: str, correct: bool, summary: dict, state: dict, bank: dict) -> dict:
    q = bank[qid]
    mcq = q.get("mcq")
    now_dt = srs.now()
    return {
        "id": qid,
        "correct": correct,
        "correct_option": mcq["options"][mcq["answer"]] if mcq else None,
        "model_answer": q["a"],
        "tip": q.get("tip"),
        "outcome": summary["outcome"],
        "due": summary["due"],
        "due_label": srs.due_label(summary["due"]),
        "returns_in": srs.time_until(summary["due"], now_dt) if summary["due"] else None,
        "gap_minutes": summary["gap_minutes"],
        "gap_label": (srs.humanize_minutes(summary["gap_minutes"])
                      if summary["gap_minutes"] else None),
        "streak": summary["streak"],
        "stage": summary["stage"],
        "stages": len(state["intervals_minutes"]),
        "mastery_streak": state["mastery_streak"],
        "mastered": state["items"][qid]["mastered"],
        "last_choice": state["items"][qid].get("last_choice"),
        "last_correct": state["items"][qid].get("last_correct"),
        "remaining": len(srs.select(state, bank)),
    }



def exam_paper_payload(bank: dict, n: int) -> dict:
    """A fixed paper drawn from the whole bank, weighted by each week's marks.

    Deliberately does NOT touch progress: an exam is a test, not study, and
    recording it would distort the spaced-repetition intervals.
    """
    by_week: dict = {}
    marks_of: dict = {}
    for qid, q in bank.items():
        w = q["week"]
        by_week.setdefault(w, []).append(qid)
        marks_of[w] = marks_of.get(w, 0) + q.get("marks", 1)
    grand = sum(marks_of.values()) or 1
    weeks = sorted(by_week)

    # largest-remainder apportionment, capped at each week's pool, then the
    # remainder handed out round-robin so the counts always total exactly n
    quotas = [{"week": w, "exact": (marks_of[w] / grand) * n, "take": 0} for w in weeks]
    for q in quotas:
        q["take"] = min(int(q["exact"]), len(by_week[q["week"]]))
    quotas.sort(key=lambda q: q["exact"] % 1, reverse=True)
    used = sum(q["take"] for q in quotas)
    progressed = True
    while used < n and progressed:
        progressed = False
        for q in quotas:
            if used >= n:
                break
            if q["take"] < len(by_week[q["week"]]):
                q["take"] += 1
                used += 1
                progressed = True

    picked: list = []
    for q in quotas:
        pool = list(by_week[q["week"]])
        random.shuffle(pool)
        picked.extend(pool[: q["take"]])
    random.shuffle(picked)

    questions = []
    for qid in picked:
        q = bank[qid]
        mcq = q.get("mcq")
        opts = list(mcq["options"]) if mcq else None
        if opts:
            random.shuffle(opts)          # correct text is NOT identified
        questions.append({
            "id": qid, "week": q["week"], "topic": q.get("topic", ""),
            "marks": q.get("marks", 1),
            "stem": (mcq or {}).get("stem") or q["q"],
            "options": opts,
            "mode": "mcq" if mcq else "open",
        })
    return {
        "count": len(questions),
        "total_marks": sum(q["marks"] for q in questions),
        "breakdown": sorted(({"week": q["week"], "count": q["take"]} for q in quotas),
                            key=lambda r: r["week"]),
        "questions": questions,
    }


def exam_mark_payload(bank: dict, body: dict) -> dict:
    """Mark a whole paper in one go, so nothing is revealed while the clock runs."""
    results = []
    score = total = 0
    for a in body.get("answers", []):
        q = bank.get(a.get("id"))
        if not q:
            continue
        mcq = q.get("mcq")
        marks = q.get("marks", 1)
        total += marks
        answered = a.get("choice") is not None
        # an unanswered question is not the same as a wrong one, so leave it None
        correct = ((a.get("choice") == mcq["options"][mcq["answer"]])
                   if (mcq and answered) else None)
        if correct:
            score += marks
        results.append({
            "id": q["id"], "week": q["week"], "topic": q.get("topic", ""),
            "marks": marks,
            "stem": (mcq or {}).get("stem") or q["q"],
            "question": q["q"],
            "your_choice": a.get("choice") if (mcq and answered) else None,
            "correct_option": mcq["options"][mcq["answer"]] if mcq else None,
            "correct": correct, "answered": answered,
            "model_answer": q["a"], "tip": q.get("tip"),
        })
    return {
        "score": score, "total": total,
        "percent": round(score / total * 100) if total else 0,
        "answered": sum(1 for r in results if r["answered"]),
        "count": len(results), "results": results,
    }


# --------------------------------------------------------------------------- #
# request handler
# --------------------------------------------------------------------------- #
class Handler(BaseHTTPRequestHandler):
    server_version = "OODStudy/1.0"

    # ---- plumbing -------------------------------------------------------- #
    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))

    def _send(self, code, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, obj, code=200) -> None:
        self._send(code, json.dumps(obj, indent=2).encode("utf-8"),
                   "application/json; charset=utf-8")

    def _error(self, code, msg) -> None:
        self._json({"error": msg}, code)

    def _body(self) -> dict:
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return {}
        if n <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}

    def _serve_static(self, path: str) -> None:
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        full = os.path.normpath(os.path.join(HERE, rel))
        # never escape the web/ directory
        if not full.startswith(HERE + os.sep):
            return self._error(403, "forbidden")
        if not os.path.isfile(full):
            return self._error(404, f"not found: {rel}")
        ctype = STATIC_TYPES.get(os.path.splitext(full)[1], "application/octet-stream")
        with open(full, "rb") as fh:
            self._send(200, fh.read(), ctype)

    # ---- routes ---------------------------------------------------------- #
    def do_GET(self) -> None:
        u = urlparse(self.path)
        qs = parse_qs(u.query)
        path = u.path

        if path == "/api/status":
            with LOCK:
                return self._json(status_payload())

        if path == "/api/question":
            week = qs.get("week", [None])[0]
            week = int(week) if week and week.isdigit() else None
            include_all = qs.get("all", ["0"])[0] in ("1", "true", "yes")
            with LOCK:
                state, bank = _state_and_bank()
                if srs.sync(state, bank):
                    srs.save_state(state)
                return self._json(question_payload(state, bank, week, include_all))

        if path == "/api/stats":
            week = qs.get("week", [None])[0]
            week = int(week) if week and week.isdigit() else None
            with LOCK:
                state, bank = _state_and_bank()
                now_dt = srs.now()
                rows = []
                for qid in sorted(bank):
                    q = bank[qid]
                    if week and q["week"] != week:
                        continue
                    it = state["items"].get(qid) or srs.blank_item(now_dt)
                    rows.append({
                        "id": qid, "week": q["week"], "topic": q.get("topic", ""),
                        "streak": it["streak"], "correct": it["correct"],
                        "wrong": it["wrong"], "lapses": it["lapses"],
                        "mastered": it["mastered"], "due": it["due"],
                        "stage": srs.stage_of(it["streak"], state["intervals_minutes"]),
                        "stages": len(state["intervals_minutes"]),
                        "returns_in": None if it["mastered"] else srs.time_until(it["due"], now_dt),
                        "mode": "mcq" if q.get("mcq") else "open",
                    })
                return self._json(rows)

        if path == "/api/archive":
            page = _int(qs.get("page", ["1"])[0], 1, 1, 10_000)
            per = _int(qs.get("per", ["10"])[0], 10, 1, 100)
            flt = qs.get("filter", ["all"])[0]
            with LOCK:
                state, bank = _state_and_bank()
                now_dt = srs.now()
                waiting, mastered = srs.archive_rows(state, bank, now_dt=now_dt)
                rows = {"waiting": waiting, "mastered": mastered}.get(flt)
                if rows is None:
                    rows = waiting + mastered
                total = len(rows)
                pages = max(1, (total + per - 1) // per)
                page = min(page, pages)
                start = (page - 1) * per
                return self._json({
                    "page": page,
                    "per": per,
                    "pages": pages,
                    "total": total,
                    "counts": {"all": len(waiting) + len(mastered),
                               "waiting": len(waiting),
                               "mastered": len(mastered)},
                    "due_now": sum(1 for r in waiting if r["is_due"]),
                    "filter": flt if flt in ("waiting", "mastered") else "all",
                    "rows": rows[start:start + per],
                    "ladder": [srs.humanize_minutes(m) for m in state["intervals_minutes"]],
                    "mastery_streak": state["mastery_streak"],
                })

        if path == "/api/weakest":
            n = int(qs.get("n", ["10"])[0])
            with LOCK:
                state, bank = _state_and_bank()
                rows = [(qid, state["items"][qid]) for qid in bank
                        if not state["items"].get(qid, {}).get("mastered")]
                rows.sort(key=lambda r: (-r[1]["lapses"], r[1]["streak"], r[1]["correct"]))
                return self._json([
                    {"id": qid, "week": bank[qid]["week"],
                     "topic": bank[qid].get("topic", ""),
                     "lapses": it["lapses"], "streak": it["streak"],
                     "stem": (bank[qid].get("mcq") or {}).get("stem") or bank[qid]["q"]}
                    for qid, it in rows[:n]
                ])

        if path == "/api/exam/paper":
            n = _int(qs.get("n", ["20"])[0], 20, 5, 130)
            with LOCK:
                return self._json(exam_paper_payload(srs.load_bank(), n))

        return self._serve_static(path)

    def do_HEAD(self) -> None:
        self.do_GET()


    def do_POST(self) -> None:
        path = urlparse(self.path).path
        body = self._body()

        if path == "/api/answer":
            qid = body.get("id")
            with LOCK:
                state, bank = _state_and_bank()
                if qid not in bank:
                    return self._error(400, f"unknown question id: {qid}")
                q = bank[qid]
                mcq = q.get("mcq")
                if mcq:
                    if "choice" not in body:
                        return self._error(400, "mcq question needs a 'choice'")
                    correct = body["choice"] == mcq["options"][mcq["answer"]]
                else:
                    if "correct" not in body:
                        return self._error(400, "open question needs 'correct'")
                    correct = bool(body["correct"])
                now_dt = srs.now()
                item = state["items"].setdefault(qid, srs.blank_item(now_dt))
                choice = body.get("choice") if mcq else None
                summary = srs.apply_grade(item, correct, state, now_dt, choice=choice)
                note = body.get("note")
                if note:
                    item["notes"].append({"date": now_dt.isoformat(), "note": note})
                srs.save_state(state)
                return self._json(answer_payload(qid, correct, summary, state, bank))

        if path == "/api/archive/write":
            with LOCK:
                state, bank = _state_and_bank()
                os.makedirs(srs.ARCHIVE_DIR, exist_ok=True)
                out = os.path.join(srs.ARCHIVE_DIR, "archive.md")
                with open(out, "w", encoding="utf-8") as fh:
                    fh.write(srs.render_archive_markdown(state, bank))
                return self._json({"ok": True, "path": out})

        if path == "/api/reset":
            if not body.get("yes"):
                return self._error(400, 'pass {"yes": true} to reset')
            with LOCK:
                srs.save_state(srs.blank_state())
                return self._json({"ok": True})

        if path == "/api/exam/mark":
            # NB: do_POST already read the body at the top of this method - calling
            # _body() again would block forever on a body that is already consumed.
            with LOCK:
                return self._json(exam_mark_payload(srs.load_bank(), body))

        return self._error(404, "unknown endpoint")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(
        prog="server.py", description="Dark-mode MCQ web UI for the OOD study trainer.")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--no-browser", action="store_true")
    args = p.parse_args(argv)

    url = f"http://{args.host}:{args.port}/"
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"IT7006 OOD study server -> {url}")
    print(f"  engine  : {os.path.join(HERE, 'srs.py')}")
    print(f"  progress: {srs.STATE_PATH}")
    print("  Ctrl-C to stop.\n")
    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())


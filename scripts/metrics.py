#!/usr/bin/env python3
"""Theo dõi hiệu quả mô hình Claude ↔ Antigravity: token Claude theo từng giai đoạn + sự kiện lỗi/vấp của agent.
Chỉ dùng thư viện chuẩn. Dữ liệu nằm ở máy người dùng (dùng chung mọi dự án), KHÔNG vào git:
  ~/.config/handoff/metrics/<tên-repo>/periods.jsonl   các giai đoạn đo (begin/end)
  ~/.config/handoff/metrics/<tên-repo>/events.jsonl    sự kiện (tự ghi từ handoff.py / orchestrate.py)

  metrics.py begin <nhãn> --mode agy|self [--note …]   bắt đầu đợt đo (mode: giao agy hay Claude tự làm)
  metrics.py end   <nhãn> [--tasks N | --ids TASK-1,TASK-2]   kết thúc, tính token Claude của đợt
  metrics.py event <loại> [TASK-ID] [--note …]        ghi tay một sự kiện
  metrics.py add-period <nhãn> --mode … --tasks N --turns T --out O --cw W --cr R [--note …]   nhập đợt cũ
  metrics.py report [--json]                           tổng kết: token/task theo mode + thống kê lỗi agent
  metrics.py review                                    tự quét sự kiện, chỉ ra điểm cần chỉnh (ngưỡng: >1 lần/task)
Loại sự kiện chuẩn: agy_failure (cause=capacity|quota|permission|network|early_stop), launch, unstick, resume_early_stop, quota_fallback, gate_pass, gate_fail, reject,
  accept, merge, claude_fix (Claude phải tự sửa việc của agent), lock_edited, escalate_hard.
Token Claude lấy từ transcript ~/.claude/projects/<tên-thư-mục-dự-án>*/**/*.jsonl (gồm cả worktree)."""
from __future__ import annotations

import argparse
import collections
import glob
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()


def repo_root() -> Path:
    r = subprocess.run(["git", "rev-parse", "--git-common-dir"], capture_output=True, text=True)
    common = Path(r.stdout.strip()).resolve() if r.returncode == 0 and r.stdout.strip() else Path.cwd()
    return common.parent if common.name == ".git" else common


def slug(path: Path) -> str:
    return re.sub(r"[^A-Za-z0-9]", "-", str(path))


def data_dir() -> Path:
    d = HOME / ".config" / "handoff" / "metrics" / repo_root().name
    d.mkdir(parents=True, exist_ok=True)
    return d


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def append(name: str, obj: dict) -> None:
    with open(data_dir() / name, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def read(name: str) -> list[dict]:
    p = data_dir() / name
    if not p.exists():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        try:
            out.append(json.loads(line))
        except ValueError:
            pass
    return out


def log_event(kind: str, task: str | None = None, **extra) -> None:
    """Gọi từ handoff.py / orchestrate.py; không bao giờ làm hỏng lệnh chính."""
    try:
        append("events.jsonl", {"at": utc_now(), "kind": kind, "task": task, **extra})
    except Exception:
        pass


def claude_tokens(start: str, end: str | None = None) -> dict:
    """Cộng token Claude trong [start, end) từ transcript của dự án (UTC)."""
    end = end or "9999"
    base = HOME / ".claude" / "projects"
    seen: set = set()
    c: collections.Counter = collections.Counter()
    for f in glob.glob(str(base / (slug(repo_root()) + "*") / "**" / "*.jsonl"), recursive=True):
        try:
            lines = open(f, errors="ignore").read().splitlines()
        except OSError:
            continue
        for line in lines:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            m = d.get("message") or {}
            u = m.get("usage")
            if d.get("type") != "assistant" or not u:
                continue
            key = (m.get("id"), d.get("requestId"))
            if key in seen:
                continue
            seen.add(key)
            t = (d.get("timestamp") or "")[:19]
            if not (start <= t < end):
                continue
            c["turns"] += 1
            c["out"] += u.get("output_tokens") or 0
            c["cw"] += u.get("cache_creation_input_tokens") or 0
            c["cr"] += u.get("cache_read_input_tokens") or 0
    return dict(c)


def cmd_begin(a) -> None:
    append("periods.jsonl", {"label": a.label, "mode": a.mode, "start": utc_now(), "end": None, "note": a.note})
    print(f"Bắt đầu đo '{a.label}' (mode={a.mode}) lúc {utc_now()}Z")


def cmd_end(a) -> None:
    rows = read("periods.jsonl")
    p = next((r for r in reversed(rows) if r["label"] == a.label and not r.get("end")), None)
    if not p:
        sys.exit(f"Không có đợt mở tên '{a.label}'")
    end = utc_now()
    tok = claude_tokens(p["start"], end)
    ev = [e for e in read("events.jsonl") if p["start"] <= e["at"] < end]
    tasks = a.tasks if a.tasks is not None else (len(a.ids.split(",")) if a.ids else sum(1 for e in ev if e["kind"] == "merge"))
    p.update({"end": end, "tokens": tok, "tasks": tasks})
    (data_dir() / "periods.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    print(f"Đợt '{a.label}': {tasks} task · {tok}")


def cmd_event(a) -> None:
    log_event(a.kind, a.task, note=a.note)
    print("đã ghi")


def cmd_add_period(a) -> None:
    append("periods.jsonl", {"label": a.label, "mode": a.mode, "start": None, "end": utc_now(), "tasks": a.tasks, "note": a.note,
                              "tokens": {"turns": a.turns, "out": a.out, "cw": a.cw, "cr": a.cr}, "retro": True})
    print("đã nhập")


def fmt(n: float) -> str:
    return f"{n/1e6:.1f}M" if n >= 1e6 else f"{n/1e3:.0f}k" if n >= 1e4 else f"{n:.0f}"


def cmd_report(a) -> None:
    periods = [p for p in read("periods.jsonl") if p.get("end")]
    events = read("events.jsonl")
    out = {"periods": [], "by_mode": {}, "events": collections.Counter(e["kind"] for e in events)}
    modes: dict = collections.defaultdict(lambda: collections.Counter())
    for p in periods:
        t = p.get("tokens") or {}
        n = max(p.get("tasks") or 0, 0)
        row = {"label": p["label"], "mode": p["mode"], "tasks": n, **t}
        if n:
            row["per_task"] = {k: t.get(k, 0) / n for k in ("turns", "out", "cr")}
        out["periods"].append(row)
        for k in ("turns", "out", "cw", "cr"):
            modes[p["mode"]][k] += t.get(k, 0)
        modes[p["mode"]]["tasks"] += n
    for m, c in modes.items():
        n = c["tasks"] or 1
        out["by_mode"][m] = {"tasks": c["tasks"], **{k: c[k] for k in ("turns", "out", "cw", "cr")},
                             "per_task": {k: c[k] / n for k in ("turns", "out", "cr")}}
    done = out["events"]["merge"] or 1
    out["agent_rates"] = {k: out["events"][k] for k in ("unstick", "resume_early_stop", "quota_fallback", "gate_fail", "reject", "claude_fix", "lock_edited", "escalate_hard")}
    out["agent_rates_per_merged_task"] = {k: round(v / done, 2) for k, v in out["agent_rates"].items()}
    if a.json:
        print(json.dumps(out, ensure_ascii=False, indent=2, default=dict))
        return
    print(f"# Hiệu quả điều phối — {repo_root().name}\n")
    print("## Token Claude theo giai đoạn")
    print(f"{'nhãn':28} {'mode':5} {'task':>4} {'lượt':>6} {'out':>7} {'cache-read':>10} | /task: {'lượt':>5} {'out':>7} {'cache-read':>10}")
    for r in out["periods"]:
        pt = r.get("per_task", {})
        print(f"{r['label'][:28]:28} {r['mode']:5} {r['tasks']:>4} {r.get('turns',0):>6} {fmt(r.get('out',0)):>7} {fmt(r.get('cr',0)):>10} |        "
              f"{pt.get('turns',0):>5.0f} {fmt(pt.get('out',0)):>7} {fmt(pt.get('cr',0)):>10}")
    if len(out["by_mode"]) > 1:
        print("\n## So sánh theo mode (trung bình mỗi task)")
        for m, v in out["by_mode"].items():
            pt = v["per_task"]
            print(f"- {m}: {v['tasks']} task · {pt['turns']:.0f} lượt · out {fmt(pt['out'])} · cache-read {fmt(pt['cr'])}")
        if "agy" in out["by_mode"] and "self" in out["by_mode"]:
            ra, rs = out["by_mode"]["agy"]["per_task"]["cr"], out["by_mode"]["self"]["per_task"]["cr"]
            if ra:
                print(f"  → agy dùng {ra/rs*100:.0f}% cache-read/task so với tự làm ({rs/ra:.1f}× {'tiết kiệm' if rs>ra else 'tốn hơn'})")
    print("\n## Sự kiện của agent (tổng / mỗi task đã merge)")
    for k, v in out["agent_rates"].items():
        print(f"- {k}: {v} ({out['agent_rates_per_merged_task'][k]})")
    print(f"- merge: {out['events']['merge']} · gate_pass: {out['events']['gate_pass']} · launch: {out['events']['launch']}")
    print("\nGợi ý đọc: unstick/resume_early_stop cao → agent dừng sớm (đổi model/chỉ dẫn); gate_fail/reject cao → brief hoặc test chưa chặt; "
          "claude_fix cao → việc không hợp để giao; quota_fallback cao → hạn mức model.")


def cmd_review(a) -> None:
    """Tự quét dữ liệu và chỉ ra điểm cần chỉnh (thay cho việc người đọc log tay)."""
    ev = read("events.jsonl")
    c = collections.Counter(e["kind"] for e in ev)
    merged = c["merge"] or 1
    causes = collections.Counter(e.get("cause") for e in ev if e["kind"] == "agy_failure")
    notes = []
    rate = lambda k: c[k] / merged  # noqa: E731
    if rate("unstick") + rate("resume_early_stop") > 1:
        notes.append(f"Agent dừng sớm {rate('unstick') + rate('resume_early_stop'):.1f} lần/task: xem nguyên nhân (permission → siết skill/brief 'chỉ python3'; early_stop → đổi model hoặc chia task nhỏ hơn).")
    if rate("gate_fail") > 1:
        notes.append(f"Gate trượt {rate('gate_fail'):.1f} lần/task: brief/test chưa chặt hoặc tester chưa chạy tsc+docs-sync; thêm bước 'chạy đủ vitest+tsc' vào skill viết test.")
    if rate("claude_fix") > 1:
        notes.append(f"Claude phải tự sửa {rate('claude_fix'):.1f} lần/task: nếu >1 thường kéo cả lợi ích token — xem việc nào nên tự làm ngay hoặc viết brief/test kỹ hơn.")
    if c["quota_fallback"] + causes["quota"] > 0:
        notes.append("Có lỗi hạn mức model: giữ flash-high mặc định, tránh model Claude/argon trừ khi thật cần.")
    if causes["capacity"]:
        notes.append(f"{causes['capacity']} lần máy chủ model quá tải (503): chạy lại sau, không tính là lỗi task.")
    if causes["permission"]:
        notes.append(f"{causes['permission']} lần bị từ chối quyền lệnh: thêm ví dụ lệnh đúng vào brief/skill.")
    if c["lock_edited"]:
        notes.append("Có test bị sửa sau khi khoá: kiểm tra tester có chạy sau tests-done; cân nhắc khoá ngay khi tests-done.")
    print("# Điểm cần chỉnh (tự quét)\n" + ("\n".join("- " + n for n in notes) if notes else "- Chưa thấy điểm bất thường."))
    if causes:
        print("\nNguyên nhân lỗi agent: " + ", ".join(f"{k}={v}" for k, v in causes.most_common()))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("begin"); b.add_argument("label"); b.add_argument("--mode", choices=["agy", "self"], required=True); b.add_argument("--note", default="")
    e = sub.add_parser("end"); e.add_argument("label"); e.add_argument("--tasks", type=int); e.add_argument("--ids")
    v = sub.add_parser("event"); v.add_argument("kind"); v.add_argument("task", nargs="?"); v.add_argument("--note", default="")
    p = sub.add_parser("add-period"); p.add_argument("label"); p.add_argument("--mode", choices=["agy", "self"], required=True)
    for k in ("tasks", "turns", "out", "cw", "cr"):
        p.add_argument(f"--{k}", type=int, required=True)
    p.add_argument("--note", default="")
    r = sub.add_parser("report"); r.add_argument("--json", action="store_true")
    sub.add_parser("review")
    a = ap.parse_args()
    {"begin": cmd_begin, "end": cmd_end, "event": cmd_event, "add-period": cmd_add_period, "report": cmd_report, "review": cmd_review}[a.cmd](a)
    return 0


if __name__ == "__main__":
    sys.exit(main())

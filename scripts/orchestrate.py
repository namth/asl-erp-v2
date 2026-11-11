#!/usr/bin/env python3
"""Công cụ cho vai ĐIỀU PHỐI (một tài khoản Antigravity làm trưởng phòng-vận hành, Claude chỉ làm việc khó).

Mọi lệnh chỉ cần `python3` (agent Antigravity chỉ được chạy python3) và KHÔNG sửa code sản phẩm.

  digest [--host macbook] [--no-write]
        Bảng việc ngắn gọn (≤ ~30 dòng) chia theo: CẦN CLAUDE / ĐIỀU PHỐI LÀM TIẾP / ĐANG CHẠY / ĐẠT-CHỜ MERGE.
        Ghi vào handoff/digest.md — Claude chỉ đọc file này thay vì đọc cả phiên điều phối.
  launch <ID> [--host macbook] [--coder agyN --checker agyM]
        Tạo worktree nếu chưa có rồi chạy `auto` NỀN (có caffeinate), nhật ký ở handoff/logs/<ID>.log. Trả về ngay.
  unstick <ID> [--host macbook]
        Agent dừng sớm giữa chừng: resume vai đang dở rồi chạy tiếp auto (nền).
  guard-scan <ID> [--host macbook]
        Quét diff của worktree: dòng bảo vệ (kiểm quyền, mã 401/403, khoá…) bị bớt đi, test bị xoá, đường tắt (bypass,
        @ts-ignore, .only…). Exit 1 nếu có cảnh báo mức CAO.
  gate <ID> [--skip-tests] [--host macbook]
        guard-scan + TOÀN BỘ vitest + tsc trong worktree; ghi handoff/tasks/<ID>-*/gate.json (pass/fail + dấu vân tay diff).
  merge-low <ID> [--host macbook] [--check-only]
        Merge task vào nhánh hiện tại CHỈ KHI: trạng thái accepted, Độ khó LOW và không nhạy cảm, gate.json đạt và diff
        chưa đổi từ lúc gate, nhánh hiện tại không phải main/master. Còn lại từ chối — việc đó của Claude.
  run [--as agy1] [--model SLUG | --hard] [--dry-run]
        (mặc định agy1 + gemini-3.8-flash-high; --hard = gemini-4-argon-high)
        Khởi động một phiên agy làm điều phối (skill /dieu-phoi). Hook agy_guard chặn sửa ngoài handoff/.

Biến môi trường: AGY_WT_DIR (thư mục worktree), MACBOOK_HOST (mặc định nams-macbook-air.local), ORCH_STALE_MIN (mặc định 45).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import handoff as H  # noqa: E402

try:
    from metrics import log_event
except Exception:  # pragma: no cover
    def log_event(*_a, **_k) -> None:
        return None

ROOT = H.ROOT
STALE_MIN = int(os.environ.get("ORCH_STALE_MIN", "45"))
MACBOOK = {
    "ssh": f"namtran@{os.environ.get('MACBOOK_HOST', 'nams-macbook-air.local')}",
    "key": str(Path.home() / ".ssh" / "id_macbook_agy"),
    "alias": "192.168.1.34",
    "wt": "~/agy-farm/worktrees",
    "path": "export PATH=$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH",
}
os.environ["PATH"] += os.pathsep + os.pathsep.join(["/usr/local/bin", "/opt/homebrew/bin", str(Path.home() / ".local" / "bin")])

RUNNING = ("tests_assigned", "assigned", "in_progress", "in_review")
AUTO_READY = ("draft", "tests_ready", "submitted")


def sh(cmd: list[str], cwd: Path | None = None, timeout: int | None = None, env: dict | None = None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)


def wt_base() -> Path:
    if os.environ.get("AGY_WT_DIR"):
        return Path(os.environ["AGY_WT_DIR"])
    common = Path(sh(["git", "rev-parse", "--git-common-dir"], cwd=ROOT).stdout.strip())
    common = common if common.is_absolute() else (ROOT / common)
    return common.resolve().parent.parent / "agy-worktrees"


def ssh(host: str, remote_cmd: str, timeout: int = 60):
    cfg = MACBOOK
    return sh(["ssh", "-i", cfg["key"], "-o", "BatchMode=yes", "-o", f"HostKeyAlias={cfg['alias']}",
               "-o", "ConnectTimeout=10", cfg["ssh"], f"{cfg['path']}; {remote_cmd}"], timeout=timeout)


# ───────────────────────── digest ─────────────────────────

def read_dir_tasks(dirpath: Path, where: str, wt: Path | None) -> dict[str, dict]:
    out = {}
    for sf in sorted(dirpath.glob("handoff/tasks/*/state.json")):
        try:
            st = json.loads(sf.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        task = sf.parent
        out[st["id"]] = {"state": st, "dir": task, "where": where, "wt": wt, "difficulty": difficulty_of(task)}
    return out


def difficulty_of(task: Path) -> str:
    try:
        return H.difficulty(task)
    except OSError:
        return "HIGH"


def collect_local() -> dict[str, dict]:
    tasks = read_dir_tasks(ROOT, "repo", None)
    base = wt_base()
    if base.exists():
        for wt in sorted(p for p in base.iterdir() if p.is_dir()):
            # mỗi worktree chứa state.json của MỌI task (từ HEAD lúc tạo) — chỉ tin bản của task trùng tên worktree
            tasks.update({k: v for k, v in read_dir_tasks(wt, "worktree", wt).items() if k == wt.name})
    return tasks


def collect_remote(host: str) -> dict[str, dict]:
    script = ('for f in %s/*/handoff/tasks/*/state.json; do [ -f "$f" ] && { echo "@@$f"; cat "$f"; echo; echo "##BRIEF"; '
              'head -12 "$(dirname "$f")/brief.md" 2>/dev/null; }; done' % MACBOOK["wt"])
    r = ssh(host, script)
    out, cur, buf = {}, None, []

    def flush() -> None:
        if cur and buf:
            try:
                text = "\n".join(buf)
                state_part, _, brief_part = text.partition("##BRIEF")
                st = json.loads(state_part)
                if f"/{st['id']}/" not in cur + "/":
                    return  # bản sao cũ trong worktree của task khác
                m = re.search(r"Độ khó[^A-Za-z\n]*(LOW|HIGH)", brief_part)
                sens = re.search(r"Nhạy cảm[^\n]*?\b(có|yes)\b", brief_part, re.I)
                diff = "LOW" if m and m.group(1) == "LOW" and not sens else "HIGH"
                out[st["id"]] = {"state": st, "dir": None, "where": f"worktree@{host}", "wt": cur, "difficulty": diff}
            except json.JSONDecodeError:
                pass

    for line in r.stdout.splitlines():
        if line.startswith("@@"):
            flush()
            cur, buf = line[2:], []
        else:
            buf.append(line)
    flush()
    return out


def age_min(state: dict) -> int:
    try:
        last = dt.datetime.fromisoformat(state["history"][-1]["at"])
        return int((dt.datetime.now() - last).total_seconds() // 60)
    except (KeyError, IndexError, ValueError):
        return 0


def classify(t: dict, live: set[str] | None = None) -> tuple[str, str]:
    """(nhóm, việc tiếp theo). Nhóm: claude | auto | running | hung | merge | done."""
    st, status, diff = t["state"], t["state"]["status"], t["difficulty"]
    note = (st["history"][-1].get("note") or "") if st.get("history") else ""
    if status == "review_passed":
        return "claude", "duyệt cuối: đọc cross-review.md, chạy `gate`"
    if status == "changes_requested":
        if st.get("cross_rounds", 0) > H.MAX_CROSS_ROUNDS:
            return "claude", f"trả về quá {H.MAX_CROSS_ROUNDS} vòng — đọc review.md/report.md"
        return "auto", "chạy lại `launch` (auto tự trả về cho người code)"
    if status in AUTO_READY:
        return "auto", f"`launch {st['id']}`"
    if status in RUNNING:
        if re.search(r"cầu cứu|cần trưởng phòng", note, re.I):
            return "claude", "agent cầu cứu — đọc report.md mục câu hỏi"
        if live is not None and st["id"] not in live and age_min(st) >= 3:
            return "hung", f"không còn tiến trình auto (agent dừng sớm) — `unstick {st['id']}`"
        if age_min(st) >= STALE_MIN:
            return "hung", f"không đổi {age_min(st)} phút — `unstick {st['id']}`"
        return "running", "đang chạy"
    if status == "accepted" and t["where"] != "repo":
        if diff == "LOW":
            return "merge", f"`gate {st['id']}` rồi `merge-low {st['id']}`"
        return "claude", "đã nghiệm thu, task HIGH/nhạy cảm — Claude merge"
    return "done", ""


def merged_ids() -> set[str]:
    """Task đã accepted trong repo chính = đã merge (merge mang theo state.json accepted)."""
    return {tid for tid, t in read_dir_tasks(ROOT, "repo", None).items() if t["state"]["status"] == "accepted"}


def build_digest(tasks: dict[str, dict], title: str) -> str:
    merged = merged_ids()
    live = {m.group(0) for l in running_launches() for m in [re.search(r"TASK-\d+", l)] if m}
    groups: dict[str, list[str]] = {k: [] for k in ("claude", "auto", "hung", "running", "merge")}
    load: dict[str, int] = {}
    for tid in sorted(tasks):
        t = tasks[tid]
        g, todo = classify(t, live)
        if g == "done" or (t["state"]["status"] == "accepted" and tid in merged and t["where"] != "repo"):
            continue  # đã merge; worktree máy thợ còn sót không cần xử lý
        st = t["state"]
        for role, info in (st.get("agents") or {}).items():
            acc = info.get("account")
            if acc and st["status"] in RUNNING:
                load[acc] = load.get(acc, 0) + 1
        tag = f"{t['difficulty']}{'·nhạy cảm' if t['difficulty'] == 'HIGH' else ''}"
        groups[g].append(f"- **{tid}** [{tag}] `{st['status']}` — {st['title'][:70]} → {todo}")
    now_s = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    heads = [("claude", "CẦN CLAUDE"), ("auto", "ĐIỀU PHỐI LÀM TIẾP"), ("hung", "NGHI TREO"),
             ("running", "ĐANG CHẠY"), ("merge", "ĐẠT — CHỜ MERGE (LOW)")]
    out = [f"# Digest điều phối — {title} — {now_s}", ""]
    for key, head in heads:
        out.append(f"## {head} ({len(groups[key])})")
        out += groups[key] or ["- (trống)"]
        out.append("")
    if load:
        out.append("Tải tài khoản: " + ", ".join(f"{a}={n}" for a, n in sorted(load.items())) + " (tối đa 2 task/tài khoản)")
    return "\n".join(out).rstrip() + "\n"


def default_host(host: str | None) -> str | None:
    """Máy này chỉ có 1 tài khoản agy (chạy điều phối) → code/kiểm chéo chạy trên máy thợ."""
    return host or ("macbook" if len(H.agy_accounts()) < 2 else None)


def cmd_digest(a) -> None:
    a.host = default_host(a.host)
    tasks = collect_local()
    title = "máy này"
    if a.host:
        tasks = {**tasks, **collect_remote(a.host)}
        title = f"máy này + {a.host}"
    text = build_digest(tasks, title)
    print(text)
    if not a.no_write:
        (ROOT / "handoff").mkdir(exist_ok=True)
        (ROOT / "handoff" / "digest.md").write_text(text, encoding="utf-8")


# ───────────────────────── launch ─────────────────────────

MAX_PARALLEL = int(os.environ.get("ORCH_MAX_PARALLEL", "4"))  # 2 tài khoản máy thợ × 2 task


def running_launches() -> list[str]:
    """Các tiến trình `agy-worktree.sh auto` do launch bật và còn chạy."""
    out = sh(["pgrep", "-fl", "agy-worktree.sh auto"]).stdout.splitlines()
    return [l for l in out if "caffeinate" not in l and "pgrep" not in l]


def cmd_launch(a) -> None:
    a.host = default_host(a.host)
    live = running_launches()
    if len(live) >= MAX_PARALLEL:
        print(f"TỪ CHỐI launch {a.id}: đã có {len(live)} task đang chạy (tối đa {MAX_PARALLEL}). Chờ xong rồi chạy lại.")
        return
    if any(a.id in l for l in live):
        print(f"{a.id} đang chạy rồi.")
        return
    script = ROOT / "scripts" / "agy-worktree.sh"
    env = {**os.environ, **({"AGY_HOST": a.host} if a.host else {})}
    base = wt_base()
    local_wt = base / a.id
    need_new = (not local_wt.exists()) if not a.host else not ssh(a.host, f"test -d {MACBOOK['wt']}/{a.id} && echo y").stdout.strip()
    if need_new:
        r = sh(["bash", str(script), "new", a.id], cwd=ROOT, env=env, timeout=600)
        print((r.stdout + r.stderr).strip()[-600:])
        if r.returncode:
            H.die(f"không tạo được worktree cho {a.id} — cây làm việc chính cần sạch (Claude commit brief trước)")
    args = ["auto", a.id] + (["--coder", a.coder] if a.coder else []) + (["--checker", a.checker] if a.checker else [])
    log_dir = ROOT / "handoff" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log = log_dir / f"{a.id}.log"
    cmd = ["caffeinate", "-ims", "bash", str(script)] + args
    with open(log, "ab") as fh:
        p = subprocess.Popen(cmd, cwd=ROOT, env=env, stdout=fh, stderr=subprocess.STDOUT, start_new_session=True)
    log_event("launch", a.id, host=a.host)
    print(f"{a.id}: đã chạy nền auto (pid {p.pid}{', máy ' + a.host if a.host else ''}) — nhật ký {log.relative_to(ROOT)}")


def cmd_unstick(a) -> None:
    """Agent dừng sớm giữa chừng: nhắn làm tiếp (resume) rồi chạy tiếp `auto`, nền, có caffeinate."""
    resolve_host(a)
    host = a.host
    if host:
        r = ssh(host, f"cd {MACBOOK['wt']}/{a.id} && python3 -c \"import json,glob;print(json.load(open(glob.glob('handoff/tasks/{a.id}-*/state.json')[0]))['status'])\"")
        status = r.stdout.strip()
    else:
        status = H.load_state(H.find_task(a.id))["status"]
    role = a.role or H.STALL_ROLE.get(status)
    if not role:
        H.die(f"{a.id} đang ở {status} — không có vai nào cần resume; dùng `launch`")
    script = ROOT / "scripts" / "agy-worktree.sh"
    env = {**os.environ, **({"AGY_HOST": host} if host else {})}
    chain = (f"bash {shlex.quote(str(script))} resume {a.id} --role {role} --note {shlex.quote(H.RESUME_NOTE)}; "
             f"bash {shlex.quote(str(script))} auto {a.id}")
    log = ROOT / "handoff" / "logs" / f"{a.id}.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    with open(log, "ab") as fh:
        p = subprocess.Popen(["caffeinate", "-ims", "bash", "-c", chain], cwd=ROOT, env=env, stdout=fh, stderr=subprocess.STDOUT,
                             start_new_session=True)
    log_event("unstick", a.id, role=role)
    print(f"{a.id}: resume vai {role} rồi auto, nền (pid {p.pid}) — nhật ký {log.relative_to(ROOT)}")


# ───────────────────────── guard-scan / gate ─────────────────────────

STRONG = [
    r"requireRole|requireAuth|requireAdmin|requireTeacher|checkLessonAccess|assertClassOpen|getCurrentUser|verifyToken|verifySession",
    r"CLASS_LOCKED|FORBIDDEN|UNAUTHORI[SZ]ED",
    r"status:\s*40[0-9]|\bstatus\(40[0-9]\)",
    r"timingSafeEqual|must_change_password|FOR UPDATE",
    r"\bteacher_id\s*=|\buser_?[iI]d\s*(=|!)==?|\.role\s*(=|!)==?",
    r"rateLimit|rate_limit",
]
WEAK = [r"\bif\s*\(\s*!", r"\breturn\s+NextResponse"]
BYPASS = re.compile(r"bypass|skip[_ ]?auth|//\s*TODO.*(auth|permission|quyền)|@ts-ignore|@ts-nocheck|eslint-disable|\.only\(|\.skip\(|process\.env\.\w*(BYPASS|SKIP)\w*", re.I)
TESTCASE = re.compile(r"^\s*(it|test|describe)(\.each)?\s*[(<]")


def base_ref(wt: Path) -> str:
    cur = sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT).stdout.strip() or "HEAD"
    r = sh(["git", "merge-base", "HEAD", cur], cwd=wt)
    return r.stdout.strip() or "HEAD"


def diff_lines(wt: Path, base: str) -> dict[str, tuple[list[str], list[str]]]:
    """file → (dòng bị xoá, dòng được thêm), gồm cả file mới chưa track."""
    files: dict[str, tuple[list[str], list[str]]] = {}
    cur = None
    for line in sh(["git", "diff", "-U0", "--no-color", base], cwd=wt).stdout.splitlines():
        if line.startswith("+++ "):
            cur = line[6:] if line.startswith("+++ b/") else None
            if cur:
                files.setdefault(cur, ([], []))
        elif line.startswith("--- ") and not line.startswith("--- a/"):
            continue
        elif cur and line.startswith("-") and not line.startswith("---"):
            files[cur][0].append(line[1:])
        elif cur and line.startswith("+") and not line.startswith("+++"):
            files[cur][1].append(line[1:])
    for f in sh(["git", "ls-files", "--others", "--exclude-standard"], cwd=wt).stdout.splitlines():
        p = wt / f
        if f.startswith("node_modules") or not p.is_file() or p.stat().st_size > 2_000_000:
            continue
        try:
            files.setdefault(f, ([], []))[1].extend(p.read_text(encoding="utf-8").splitlines())
        except (UnicodeDecodeError, OSError):
            pass
    deleted = sh(["git", "diff", "--name-only", "--diff-filter=D", base], cwd=wt).stdout.splitlines()
    for f in deleted:
        files.setdefault(f, ([], []))
    return files


def analyse(files: dict[str, tuple[list[str], list[str]]]) -> list[tuple[str, str]]:
    """Danh sách (mức, nội dung). Mức: CAO | CẢNH BÁO."""
    found: list[tuple[str, str]] = []
    for f, (rem, add) in sorted(files.items()):
        is_test = f.startswith(("tests/", "e2e/")) or ".test." in f or ".spec." in f
        if is_test:
            r = sum(1 for l in rem if TESTCASE.match(l))
            n = sum(1 for l in add if TESTCASE.match(l))
            if r > n:
                found.append(("CAO", f"{f}: số ca test giảm (−{r} +{n})"))
        else:
            for pat in STRONG:
                rx = re.compile(pat)
                r = [l for l in rem if rx.search(l)]
                n = [l for l in add if rx.search(l)]
                if len(r) > len(n):
                    found.append(("CAO", f"{f}: bảo vệ giảm /{pat[:28]}…/ (−{len(r)} +{len(n)}) vd: {r[0].strip()[:90]}"))
        for l in add:
            if BYPASS.search(l):
                found.append(("CẢNH BÁO" if not is_test else "CAO", f"{f}: đường tắt/vô hiệu kiểm tra: {l.strip()[:90]}"))
                break
    return found


def resolve_host(a) -> None:
    """Không chỉ định --host: worktree có ở máy này thì chạy tại đây, không thì theo máy mặc định (máy thợ)."""
    if not a.host and not (wt_base() / a.id).exists():
        a.host = default_host(None)


def remote_run(a, sub: str, extra: str = "", timeout: int = 2400) -> int:
    """Chạy `orchestrate.py <sub> <ID>` trong worktree trên máy thợ (đường dẫn worktree theo AGY_WT_DIR của máy đó)."""
    wt = f"{MACBOOK['wt']}/{a.id}"
    cmd = (f"cd {wt} && AGY_WT_DIR={MACBOOK['wt']} caffeinate -ims python3 scripts/orchestrate.py {sub} {a.id} {extra}").strip()
    r = ssh(a.host, cmd, timeout=timeout)
    print((r.stdout + r.stderr).strip()[-3000:])
    return r.returncode


def wt_of(a) -> Path:
    wt = wt_base() / a.id
    if not wt.exists():
        H.die(f"không có worktree {wt}")
    return wt


def fingerprint_wt(wt: Path, base: str) -> str:
    h = hashlib.sha256()
    h.update(sh(["git", "diff", "--no-color", base], cwd=wt).stdout.encode())
    for f in sorted(sh(["git", "ls-files", "--others", "--exclude-standard"], cwd=wt).stdout.splitlines()):
        p = wt / f
        if p.is_file() and not f.startswith("node_modules"):
            h.update(f.encode() + b"\0" + p.read_bytes())
    return h.hexdigest()


def task_dir_in(wt: Path, tid: str) -> Path:
    m = sorted(wt.glob(f"handoff/tasks/{tid}-*")) or sorted(wt.glob(f"handoff/tasks/{tid}"))
    if not m:
        H.die(f"worktree {wt} không có handoff/tasks/{tid}-*")
    return m[0]


def cmd_guard_scan(a) -> int:
    resolve_host(a)
    if a.host:
        return remote_run(a, "guard-scan")
    wt = wt_of(a)
    found = analyse(diff_lines(wt, base_ref(wt)))
    for lvl, msg in found:
        print(f"[{lvl}] {msg}")
    high = [m for l, m in found if l == "CAO"]
    print(f"guard-scan {a.id}: {len(high)} cảnh báo CAO, {len(found) - len(high)} cảnh báo thường")
    return 1 if high else 0


def tail(text: str, n: int = 12) -> str:
    return "\n".join(text.strip().splitlines()[-n:])


def cmd_gate(a) -> int:
    resolve_host(a)
    if a.host:
        return remote_run(a, "gate", "--skip-tests" if a.skip_tests else "")
    wt = wt_of(a)
    base = base_ref(wt)
    result = {"id": a.id, "at": H.now(), "base": base}
    found = analyse(diff_lines(wt, base))
    result["guard"] = [f"[{l}] {m}" for l, m in found]
    ok = not any(l == "CAO" for l, _ in found)
    print(f"guard-scan: {'đạt' if ok else 'CÓ CẢNH BÁO CAO'} ({len(found)} mục)")
    for line in result["guard"]:
        print("  " + line)
    steps = [] if a.skip_tests else [("vitest", ["npx", "vitest", "run", "--reporter=dot"], 1800), ("tsc", ["npx", "tsc", "--noEmit"], 900)]
    for name, cmd, to in steps:
        print(f"chạy {name}…", flush=True)
        try:
            r = sh(cmd, cwd=wt, timeout=to)
            code, out = r.returncode, r.stdout + r.stderr
        except subprocess.TimeoutExpired:
            code, out = 124, f"quá {to}s"
        result[name] = {"exit": code, "tail": tail(out)}
        ok = ok and code == 0
        print(f"  {name}: {'đạt' if code == 0 else 'ĐỎ'}")
        if code:
            print(tail(out, 20))
    result["skipped_tests"] = bool(a.skip_tests)
    result["pass"] = ok and not a.skip_tests
    result["fingerprint"] = fingerprint_wt(wt, base)
    (task_dir_in(wt, a.id) / "gate.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log_event("gate_pass" if result["pass"] else "gate_fail", a.id, guard=len([1 for l, _ in found if l == "CAO"]), vitest=result.get("vitest", {}).get("exit"), tsc=result.get("tsc", {}).get("exit"))
    print(f"GATE {a.id}: {'ĐẠT' if result['pass'] else 'KHÔNG ĐẠT' + (' (bỏ qua test nên không đủ để merge)' if a.skip_tests else '')}")
    return 0 if result["pass"] else 1


def cmd_merge_low(a) -> int:
    resolve_host(a)
    if a.host:
        if remote_run(a, "merge-low", "--check-only") != 0:
            return 1
        branch = sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT).stdout.strip()
        if branch in ("main", "master"):
            print(f"TỪ CHỐI merge {a.id}: nhánh hiện tại là {branch}")
            return 1
        ssh(a.host, f"rm -f {MACBOOK['wt']}/{a.id}/handoff/tasks/{a.id}-*/gate.json")
        r = sh(["bash", str(ROOT / "scripts" / "agy-worktree.sh"), "merge", a.id], cwd=ROOT, timeout=600,
               env={**os.environ, "AGY_HOST": a.host})
        print((r.stdout + r.stderr).strip()[-800:])
        return r.returncode
    wt = wt_of(a)
    task = task_dir_in(wt, a.id)
    st = json.loads((task / "state.json").read_text(encoding="utf-8"))
    refuse = []
    if st["status"] != "accepted":
        refuse.append(f"trạng thái là {st['status']}, cần accepted")
    if H.difficulty(task) != "LOW":
        refuse.append("task HIGH hoặc nhạy cảm — Claude merge")
    gate = task / "gate.json"
    if not gate.exists():
        refuse.append("chưa chạy `gate`")
    else:
        g = json.loads(gate.read_text(encoding="utf-8"))
        if not g.get("pass"):
            refuse.append("gate chưa đạt")
        elif g.get("fingerprint") != fingerprint_wt(wt, g.get("base", "HEAD")):
            refuse.append("diff đã đổi sau khi gate — chạy lại `gate`")
    branch = sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT).stdout.strip()
    if branch in ("main", "master") and not a.check_only:
        refuse.append(f"nhánh hiện tại là {branch} — điều phối không merge thẳng vào đó")
    if refuse:
        print(f"TỪ CHỐI merge {a.id}:\n  - " + "\n  - ".join(refuse))
        return 1
    if a.check_only:
        print(f"merge-low {a.id}: đủ điều kiện")
        return 0
    # gate.json là tệp của điều phối, không đưa vào lịch sử
    gate.unlink()
    r = sh(["bash", str(ROOT / "scripts" / "agy-worktree.sh"), "merge", a.id], cwd=ROOT, timeout=300)
    print((r.stdout + r.stderr).strip()[-800:])
    return r.returncode


# ───────────────────────── run (phiên điều phối) ─────────────────────────

PROMPT = """Bạn là ĐIỀU PHỐI của dự án (vai khác với kỹ sư thực thi). Dùng skill `/dieu-phoi` (.agents/skills/dieu-phoi/SKILL.md) — đọc kỹ rồi làm theo.
CHỈ chạy `python3 scripts/orchestrate.py …` và `python3 scripts/handoff.py …` (agent chỉ được chạy python3; đọc/ghi file bằng công cụ file).
Việc của lượt này: (1) `python3 scripts/orchestrate.py digest` (thêm `--host macbook` nếu có máy thợ); (2) xử lý mọi mục "ĐIỀU PHỐI LÀM TIẾP", "NGHI TREO", "CHỜ MERGE (LOW)" đúng theo skill; (3) chạy lại digest; (4) kết thúc bằng một dòng `ĐIỀU PHỐI XONG: <n> việc Claude cần xem` kèm đường dẫn handoff/digest.md.
Tuyệt đối không sửa code sản phẩm/test, không tự nghiệm thu task HIGH/nhạy cảm, không chạy lệnh ngoài python3."""


def cmd_run(a) -> int:
    accs = H.agy_accounts()
    name = a.as_ or ("agy1" if "agy1" in accs else (sorted(accs)[0] if accs else None))
    if not name:
        H.die("máy này chưa có tài khoản agy — xem `python3 scripts/handoff.py accounts`")
    home = H.account_home(name)
    prompt = PROMPT + (f"\nGhi chú thêm: {a.note}" if a.note else "")
    if a.dry_run:
        print(f"[dry-run] tài khoản {name} (HOME={home})\n{prompt}")
        return 0
    os.environ["HANDOFF_ROLE"] = "orchestrator"
    # Điều phối là việc nhẹ: mặc định Flash High; --hard dùng Gemini 4 Argon (máy chính chạy được) rồi lùi về Flash
    models = [a.model] if a.model else (["gemini-4-argon-high", "gemini-3.8-flash-high"] if a.hard else ["gemini-3.8-flash-high", "gemini-4-argon-medium"])
    result = None
    for m in models:
        result = H.agy_run(prompt, model=m, home=home)
        if result is None:
            H.die("chưa cài agy")
        if not H.is_quota(result):
            break
        print(f"model {m} hết hạn mức/không có — thử model dự phòng", flush=True)
    print(json.dumps({k: result.get(k) for k in ("status", "exit_code", "notices")}, ensure_ascii=False))
    print(str(result.get("response") or result.get("result") or result.get("output") or "")[-800:])
    return 0 if result.get("status") != "ERROR" else 1


def main() -> int:
    p = argparse.ArgumentParser(description="Công cụ vai điều phối (Antigravity)")
    sub = p.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("digest"); d.add_argument("--host"); d.add_argument("--no-write", action="store_true"); d.set_defaults(fn=cmd_digest)
    l = sub.add_parser("launch"); l.add_argument("id"); l.add_argument("--host"); l.add_argument("--coder"); l.add_argument("--checker"); l.set_defaults(fn=cmd_launch)
    u = sub.add_parser("unstick"); u.add_argument("id"); u.add_argument("--host"); u.add_argument("--role"); u.set_defaults(fn=cmd_unstick)
    g = sub.add_parser("guard-scan"); g.add_argument("id"); g.add_argument("--host"); g.set_defaults(fn=cmd_guard_scan)
    ga = sub.add_parser("gate"); ga.add_argument("id"); ga.add_argument("--host"); ga.add_argument("--skip-tests", action="store_true"); ga.set_defaults(fn=cmd_gate)
    m = sub.add_parser("merge-low"); m.add_argument("id"); m.add_argument("--host"); m.add_argument("--check-only", action="store_true"); m.set_defaults(fn=cmd_merge_low)
    r = sub.add_parser("run"); r.add_argument("--as", dest="as_"); r.add_argument("--dry-run", action="store_true"); r.add_argument("--note"); r.add_argument("--model"); r.add_argument("--hard", action="store_true"); r.set_defaults(fn=cmd_run)
    a = p.parse_args()
    return a.fn(a) or 0


if __name__ == "__main__":
    sys.exit(main())

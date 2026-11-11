#!/usr/bin/env python3
"""Giao việc Claude (trưởng phòng) <-> Antigravity (kỹ sư thực thi).

Mỗi task là một thư mục handoff/tasks/TASK-NNN-<slug>/ gồm:
  brief.md      Claude viết — đặc tả, phạm vi file, tiêu chí nghiệm thu
  verify.sh     Claude viết — lệnh xác minh tự động (exit 0 = đạt)
  tests.lock    Script sinh — SHA-256 của verify.sh + file test Claude viết
  report.md     Antigravity viết — báo cáo khi nộp
  review.md     Claude viết — kết quả nghiệm thu / yêu cầu sửa
  state.json    Chỉ script này ghi — trạng thái và lịch sử

Trạng thái: assigned -> in_progress -> submitted -> accepted | changes_requested -> in_progress ...
Nghiệm thu chéo (các tài khoản Antigravity ngang hàng — bên này code thì bên kia viết test và nghiệm thu):
  draft -> tests_assigned -> tests_ready -> assigned -> in_progress -> submitted -> in_review
        -> accepted (LOW) | review_passed (HIGH/nhạy cảm, chờ Claude) | changes_requested -> … (tối đa 2 vòng)

Lệnh:
  new <slug> --title "..."            Claude: tạo task mới từ mẫu
  lock <id> <file_test>...            Claude: khoá verify.sh + file test
  dispatch <id> [--as agyN] [--via auto|agy|agentapi|ide|clipboard] [--agy-model SLUG] [--model pro]
                                      giao code cho Antigravity. Với agy, lệnh chạy tới khi
                                      agent làm xong (chạy nền) rồi in kết quả.
  dispatch-tests <id> [--as agyN]     giao viết test + verify.sh cho tài khoản kiểm (khác người code)
  dispatch-review <id> [--as agyN]    giao nghiệm thu chéo cho tài khoản kiểm (khác người code)
  auto <id> [--coder agyN] [--checker agyM]
                                      chạy cả chuỗi test → code → nghiệm thu chéo → trả về (≤ 2 vòng),
                                      dừng khi accepted / review_passed / cần trưởng phòng
  start <id> / submit <id>            Antigravity (người code): nhận việc / tự kiểm rồi nộp
  tests-done <id> <file_test>...      Antigravity (người kiểm): kiểm phạm vi, test phải đỏ, khoá test
  review-pass <id> / review-fail <id> Antigravity (người kiểm): kết luận nghiệm thu chéo (cross-review.md)
  verify <id> [--quiet]               kiểm khoá test + chạy verify.sh (--quiet: chỉ in tóm tắt, log ra file)
  scope <id>                          so file đã đổi với brief mục 3 (không tốn token)
  diff <id>                           in diff các file đã đổi (cho người nghiệm thu chỉ chạy được python3)
  accept <id> / reject <id>           Claude: nghiệm thu / trả về (reject gửi review.md cho người code)
  resume <id> [--role coder|tester|reviewer] [--note "..."] [--agy-model SLUG]
                                      nhắn agent làm tiếp trong cùng hội thoại agy khi nó dừng giữa chừng
  list / accounts / doctor            bảng trạng thái / tài khoản agy trên máy này / kiểm tra bộ phối hợp

Cấu hình riêng của dự án: handoff/config.json
  protected_paths  thư mục/file agent thực thi không được sửa (hook .agents/hooks.json chặn)
  test_paths       nơi người kiểm được viết test (mặc định tests/, e2e/)
  agy_model        slug model mặc định cho agy (xem `agy models`); null = mặc định của agy
  agy_role_models  {"coder": [...], "tester": [...], "reviewer": [...]} chuỗi model theo vai trò (đầu tiên dùng trước, hết hạn mức/không có thì lùi)
  cross_review     true = bật lại nghiệm thu chéo bằng agent sau khi nộp (mặc định tắt: LOW → accepted rồi gate; HIGH → review_passed)
  agy_fallback_models  model dự phòng, thử lần lượt khi model đang dùng hết hạn mức (429)
  agy_timeout      thời gian tối đa một lần chạy agy (vd "60m")
Tài khoản agy của từng máy: tự nhận ~ (agy1) và ~/.agy-accountN (agyN); ghi đè bằng
  ~/.config/handoff/accounts.json, vd {"agy2": "~/.agy-worker"} (máy thợ).
"""
from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import hashlib
import json
import os
import pwd
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:  # đo lường hiệu quả (scripts/metrics.py); thiếu cũng không sao
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from metrics import log_event
except Exception:  # pragma: no cover
    def log_event(*_a, **_k) -> None:
        return None

ROOT = Path(__file__).resolve().parent.parent
TASKS = ROOT / "handoff" / "tasks"
TEMPLATE = ROOT / "handoff" / "templates"
AGENTAPI = Path.home() / ".gemini" / "antigravity" / "bin" / "agentapi"
IDE_CLI = Path("/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide")
AGY = shutil.which("agy") or str(Path.home() / ".local" / "bin" / "agy")
AGY_SETTINGS = Path.home() / ".gemini" / "antigravity-cli" / "settings.json"


def load_config() -> dict:
    path = ROOT / "handoff" / "config.json"
    cfg = {"protected_paths": [], "test_paths": ["tests/", "e2e/"], "agy_model": None,
           "agy_fallback_models": [], "agy_timeout": "60m"}
    if path.exists():
        cfg.update(json.loads(path.read_text(encoding="utf-8")))
    return cfg


CONFIG = load_config()
AGY_TIMEOUT = os.environ.get("AGY_PRINT_TIMEOUT", CONFIG["agy_timeout"])

WORKER_CMDS = {"start": ("assigned", "changes_requested"), "submit": ("in_progress",)}
STALL_ROLE = {"tests_assigned": "tester", "assigned": "coder", "in_progress": "coder", "in_review": "reviewer"}
MAX_AUTO_RESUMES = 2
RESUME_NOTE = ("Bạn đã dừng sớm. Chỉ chạy python3 (không ls/git/sed/npx); đọc/sửa file bằng công cụ file. Làm tiếp tới khi hoàn tất "
               "đúng bước cuối của skill (tests-done / submit / review-pass|review-fail), không dừng để hỏi.")
MAX_CROSS_ROUNDS = 2  # quá số vòng trả về chéo này thì đẩy lên trưởng phòng
TASK_OWN = ("brief.md", "state.json", "tests.lock", "review.md", "report.md", "cross-review.md")


# ---------- tài khoản agy (ngang hàng: agy1, agy2, …) ----------

REAL_HOME = Path(pwd.getpwuid(os.getuid()).pw_dir)  # không phụ thuộc biến HOME (máy thợ đặt HOME riêng cho agy)


def agy_accounts() -> dict[str, Path]:
    """Tài khoản agy đăng nhập trên máy này: tên → HOME dùng khi chạy agy."""
    override = REAL_HOME / ".config" / "handoff" / "accounts.json"
    if override.exists():
        raw = json.loads(override.read_text(encoding="utf-8"))
        return {k: Path(str(v).replace("~", str(REAL_HOME), 1)) for k, v in raw.items()}
    accs = {}
    if (REAL_HOME / ".gemini" / "antigravity-cli").exists():
        accs["agy1"] = REAL_HOME
    for d in sorted(REAL_HOME.glob(".agy-account*")):
        m = re.fullmatch(r"\.agy-account(\d+)", d.name)
        if m and (d / ".gemini" / "antigravity-cli").exists():
            accs[f"agy{m.group(1)}"] = d
    return accs


def account_home(name: str | None) -> Path | None:
    if not name:
        return None
    accs = agy_accounts()
    if name not in accs:
        die(f"máy này không có tài khoản agy '{name}' (có: {', '.join(accs) or 'không'}) — xem `accounts`")
    return accs[name]


def pick_other(exclude: str | None, task_id: str) -> str:
    """Chọn một tài khoản khác `exclude`; không có `exclude` thì chia đều theo số task."""
    accs = sorted(agy_accounts())
    others = [a for a in accs if a != exclude]
    if not others or (exclude is None and len(accs) < 2):
        die("nghiệm thu chéo cần ít nhất 2 tài khoản agy trên máy chạy task — xem `accounts`; "
            "không có thì trưởng phòng tự viết test/nghiệm thu (/giao-viec, /nghiem-thu)")
    n = int(re.sub(r"\D", "", task_id) or 0)
    return others[n % len(others)]


# ---------- phạm vi, độ khó, dấu vân tay cây làm việc ----------

def changed_files() -> list[str]:
    """File đã đổi/thêm/xoá so với HEAD (kể cả chưa track), đường dẫn tương đối ROOT."""
    out = subprocess.run(["git", "status", "--porcelain=v1", "-uall", "-z"], cwd=ROOT,
                         capture_output=True, text=True).stdout
    parts, files, i = out.split("\0"), [], 0
    while i < len(parts):
        entry = parts[i]
        if len(entry) > 3:
            files.append(entry[3:])
            if entry[0] in "RC":
                i += 1  # bỏ đường dẫn nguồn của rename/copy
        i += 1
    return [f for f in files if f and not f.startswith("node_modules")]


def task_dir_rel(task: Path) -> str:
    return task.relative_to(ROOT).as_posix() + "/"


def brief_text(task: Path) -> str:
    """brief.md đã bỏ chú thích HTML (hướng dẫn trong mẫu)."""
    return re.sub(r"<!--.*?-->", "", (task / "brief.md").read_text(encoding="utf-8"), flags=re.S)


def brief_scope(task: Path) -> list[str]:
    """Mẫu đường dẫn trong brief mục 3 'Được tạo/sửa' (trong dấu `…`, hoặc cả dòng gạch đầu)."""
    text = brief_text(task)
    m = re.search(r"Được tạo/sửa:?\**(.*?)(\*\*Không được sửa|\n## )", text, re.S)
    pats = []
    for line in (m.group(1) if m else "").splitlines():
        line = line.strip()
        if not line.startswith(("-", "*")) or line in ("-", "*"):
            continue
        ticks = re.findall(r"`([^`]+)`", line)
        pats += ticks or [line.lstrip("-* ").split(" ")[0]]
    return [p.strip().lstrip("./") for p in pats if p.strip()]


def in_patterns(path: str, pats: list[str]) -> bool:
    # Khớp chính xác trước: đường dẫn Next.js có `[param]` mà fnmatch hiểu là lớp ký tự
    return any(path.startswith(p) if p.endswith("/") else (path == p or fnmatch.fnmatch(path, p)) for p in pats)


def locked_files(task: Path) -> list[str]:
    lock = task / "tests.lock"
    if not lock.exists():
        return []
    return [l.split("  ", 1)[1].strip() for l in lock.read_text(encoding="utf-8").splitlines() if "  " in l]


def scope_problems(task: Path) -> list[str]:
    """File code ngoài brief mục 3 — trừ thư mục task và file test đã khoá (của người kiểm)."""
    pats = brief_scope(task)
    if not pats:
        return ["brief.md mục 3 'Được tạo/sửa' chưa liệt kê đường dẫn nào"]
    own, locked, tests = task_dir_rel(task), set(locked_files(task)), CONFIG["test_paths"]
    return [f"ngoài phạm vi brief: {f}" for f in changed_files()
            if not f.startswith(own) and f not in locked and not in_patterns(f, pats + tests)]


def difficulty(task: Path) -> str:
    """LOW chỉ khi brief ghi rõ 'Độ khó: LOW' và không ghi 'Nhạy cảm: có'; còn lại coi là HIGH."""
    text = brief_text(task)
    m = re.search(r"Độ khó[^A-Za-z\n]*(LOW|HIGH)", text)
    sensitive = re.search(r"Nhạy cảm[^\n]*?\b(có|yes)\b", text, re.I)
    return "LOW" if m and m.group(1) == "LOW" and not sensitive else "HIGH"


def fingerprint(task: Path, skip: set[str]) -> str:
    """Băm nội dung mọi file đã đổi, trừ `skip` và thư mục task — để biết người kiểm có sửa code không."""
    h, own = hashlib.sha256(), task_dir_rel(task)
    for f in sorted(changed_files()):
        if f in skip or f.startswith(own):
            continue
        p = ROOT / f
        h.update(f.encode() + b"\0" + (p.read_bytes() if p.is_file() else b"<deleted>") + b"\0")
    return h.hexdigest()


def now() -> str:
    return dt.datetime.now().isoformat(timespec="seconds")


def die(msg: str) -> None:
    print(f"LỖI: {msg}", file=sys.stderr)
    sys.exit(1)


def find_task(task_id: str) -> Path:
    task_id = task_id.upper() if task_id.lower().startswith("task-") else f"TASK-{int(task_id):03d}"
    matches = sorted(TASKS.glob(f"{task_id}-*")) + sorted(TASKS.glob(task_id))
    if not matches:
        die(f"không tìm thấy {task_id} trong {TASKS.relative_to(ROOT)}")
    return matches[0]


def load_state(task: Path) -> dict:
    return json.loads((task / "state.json").read_text(encoding="utf-8"))


def save_state(task: Path, state: dict, status: str | None = None, note: str = "") -> None:
    if status:
        state["status"] = status
        state["history"].append({"at": now(), "status": status, "note": note})
    (task / "state.json").write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_lock(task: Path) -> list[str]:
    lock = task / "tests.lock"
    if not lock.exists():
        return ["chưa có tests.lock — Claude cần chạy `lock` trước khi giao việc"]
    problems = []
    for line in lock.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, rel = line.split("  ", 1)
        path = ROOT / rel
        if not path.exists():
            problems.append(f"file test bị xoá: {rel}")
        elif sha256(path) != digest:
            problems.append(f"file test bị sửa: {rel}")
    return problems


FAIL_LINE = re.compile(r"FAIL|✗|×|✘|Error|error TS|AssertionError|Expected|Received|expected|not ok|Traceback|exit [1-9]")


def verify_log(task: Path) -> Path:
    """Log đầy đủ của lần verify gần nhất — nằm ngoài repo để không lọt vào commit."""
    d = Path(tempfile.gettempdir()) / "handoff-verify"
    d.mkdir(exist_ok=True)
    return d / f"{ROOT.name}-{task.name}.log"


def run_verify(task: Path, quiet: bool = False) -> int:
    """quiet: không in toàn bộ output. Đạt → 3 dòng cuối; trượt → các dòng báo lỗi (tối đa 40) + 10 dòng cuối.
    Log đầy đủ ghi ra verify_log() để chỉ mở khi thật cần."""
    script = task / "verify.sh"
    print(f"$ bash {script.relative_to(ROOT)}", flush=True)
    if not quiet:
        return subprocess.run(["bash", str(script)], cwd=ROOT).returncode
    proc = subprocess.run(["bash", str(script)], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    log = verify_log(task)
    log.write_text(proc.stdout, encoding="utf-8")
    lines = [l for l in proc.stdout.rstrip().splitlines() if l.strip()]
    tail = lines[-3:] if proc.returncode == 0 else lines[-10:]
    if proc.returncode:
        fails = list(dict.fromkeys(l.strip()[:200] for l in lines[:-10] if FAIL_LINE.search(l)))
        if fails:
            print("Dòng báo lỗi:" + (f" (40/{len(fails)})" if len(fails) > 40 else ""))
            print("\n".join("  " + l for l in fails[:40]))
    print(f"… {len(lines)} dòng, log đầy đủ: {log}" if len(lines) > len(tail) else f"log: {log}")
    print("\n".join(tail))
    return proc.returncode


def agentapi(*args: str) -> str | None:
    """Gọi Antigravity CLI. Trả None nếu không gọi được (vd chạy ngoài terminal của Antigravity)."""
    if not AGENTAPI.exists() or not os.environ.get("ANTIGRAVITY_LS_ADDRESS"):
        return None
    proc = subprocess.run([str(AGENTAPI), *args], capture_output=True, text=True)
    out = (proc.stdout + proc.stderr).strip()
    if proc.returncode != 0 or '"error"' in out:
        print(f"agentapi lỗi: {out}", file=sys.stderr)
        return None
    return out


def agy_run(prompt: str, conversation_id: str | None = None, model: str | None = None,
            home: Path | None = None) -> dict | None:
    """Chạy Antigravity CLI ở chế độ không tương tác, chờ agent làm xong, trả về phong bì JSON.
    Trả None nếu chưa cài agy. Sửa file được tự duyệt (--mode accept-edits); lệnh shell theo
    danh sách cho phép trong ~/.gemini/antigravity-cli/settings.json; hook .agents/hooks.json chặn sửa test.
    home: HOME của tài khoản agy cần dùng (None = HOME hiện tại)."""
    if not Path(AGY).exists():
        return None
    args = [AGY, "-p", prompt, "--output-format", "json", "--mode", "accept-edits", "--print-timeout", AGY_TIMEOUT]
    if model:
        args += ["--model", model]
    if conversation_id:
        args += ["--conversation", conversation_id]
    env = {**os.environ, "HOME": str(home)} if home else None
    print(f"Đang chạy agy (tối đa {AGY_TIMEOUT}, model {model or 'mặc định'})…", flush=True)
    proc = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, env=env)
    notices = [l for l in proc.stderr.splitlines() if re.search(r"deni|permission|quyền|error|lỗi", l, re.I)]
    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError:
        result = {"status": "ERROR", "error": (proc.stdout + proc.stderr).strip()[-2000:]}
    result["exit_code"] = proc.returncode
    result["notices"] = notices
    return result


def last_tool_call(conversation_id: str | None, home: Path | None = None) -> str | None:
    """Lời gọi công cụ cuối cùng trong bản ghi hội thoại agy — thường là thao tác vừa bị từ chối."""
    if not conversation_id:
        return None
    transcript = ((home or Path.home()) / ".gemini" / "antigravity-cli" / "brain" / conversation_id
                  / ".system_generated" / "logs" / "transcript.jsonl")
    if not transcript.exists():
        return None
    last = None
    for line in transcript.read_text(encoding="utf-8").splitlines():
        try:
            calls = json.loads(line).get("tool_calls") or []
        except json.JSONDecodeError:
            continue
        if calls:
            last = calls[-1]
    return None if last is None else f"{last.get('name')} {json.dumps(last.get('args'), ensure_ascii=False)[:600]}"


def is_quota(result: dict) -> bool:
    text = json.dumps(result, ensure_ascii=False)
    # Model không có ở tài khoản này (mỗi tài khoản agy có danh sách model riêng) cũng chuyển sang model dự phòng
    return ("RESOURCE_EXHAUSTED" in text or "quota" in text.lower()
            or "not recognized as a known model" in text)


ROLE_DONE = {"coder": ("submitted",), "tester": ("tests_ready",),
             "reviewer": ("accepted", "review_passed", "changes_requested")}
ROLE_SKILL = {"coder": "/thuc-hien-task", "tester": "/viet-test-cheo", "reviewer": "/nghiem-thu-cheo"}
ROLE_FINISH = {"coder": "`submit` thành công", "tester": "`tests-done` thành công",
               "reviewer": "`review-pass` hoặc `review-fail` thành công"}


def agent_of(state: dict, role: str) -> dict:
    """Thông tin agent của một vai trong task: {"account", "conversation_id"}."""
    agents = state.setdefault("agents", {})
    if role == "coder" and "coder" not in agents and state.get("conversation_id"):
        agents["coder"] = {"account": None, "conversation_id": state["conversation_id"]}  # task kiểu cũ
    return agents.setdefault(role, {"account": None, "conversation_id": None})


def role_models(role: str) -> list[str | None]:
    """Model theo vai trò (config agy_role_models): người kiểm khác họ model với người code thì mới độc lập.
    Model không có ở tài khoản đó thì is_quota coi như hết hạn mức và tự lùi sang model kế tiếp."""
    chain = (CONFIG.get("agy_role_models") or {}).get(role)
    return list(chain) if chain else [CONFIG.get("agy_model")]


def cross_review_enabled() -> bool:
    """Nghiệm thu chéo bằng agent mặc định TẮT (cổng tự động + Claude thay thế); bật lại: "cross_review": true."""
    return bool(CONFIG.get("cross_review", False))


def agy_task(task: Path, prompt: str, model: str | None, conversation_id: str | None = None,
             role: str = "coder", account: str | None = None) -> None:
    """Chạy agy cho một vai của task; model hết hạn mức mà vai đó chưa xong → tự chuyển sang model dự phòng
    (handoff/config.json → agy_fallback_models) trong cùng hội thoại, rồi in báo cáo."""
    home = account_home(account)
    models = list(dict.fromkeys([*([model] if model else role_models(role)), *CONFIG.get("agy_fallback_models", [])]))
    for i, m in enumerate(models):
        result = agy_run(prompt, conversation_id=conversation_id, model=m, home=home)
        state = load_state(task)
        conversation_id = result.get("conversation_id") or conversation_id
        ag = agent_of(state, role)
        ag["conversation_id"], ag["account"], state["via"] = conversation_id, account or ag["account"], "agy"
        if role == "coder":
            state["conversation_id"] = conversation_id
        save_state(task, state)
        if not is_quota(result) or state["status"] in ROLE_DONE[role] or i == len(models) - 1:
            break
        nxt = models[i + 1]
        print(f"Model {m or 'mặc định'} hết hạn mức → chuyển sang {nxt or 'mặc định'}.", flush=True)
        log_event("quota_fallback", state["id"], role=role, frm=m, to=nxt)
        state["history"].append({"at": now(), "status": state["status"], "note": f"đổi model agy: {m} → {nxt} (hết hạn mức)"})
        save_state(task, state)
        if conversation_id:
            prompt = (f"Tiếp tục {state['id']} theo yêu cầu ban đầu của hội thoại này, từ chỗ đang dừng, "
                      f"theo skill {ROLE_SKILL[role]}, tới khi {ROLE_FINISH[role]}.")
    report_agy(task, result, role, home)


def agy_failure_cause(result: dict, done: bool) -> tuple[str, str] | None:
    """Phân loại vì sao agy dừng bất thường → (mã, gợi ý). None = chạy bình thường."""
    text = json.dumps(result, ensure_ascii=False)
    low = text.lower()
    if "no capacity" in low or "code 503" in low or "unavailable" in low:
        return "capacity", "máy chủ model quá tải (503) — không phải lỗi task; chạy lại sau vài phút (unstick), không đổi model vội."
    if "resource_exhausted" in low or "quota" in low:
        return ("quota_after_done" if done else "quota"), (
            "hết hạn mức model — dùng model khác (`--agy-model`) hoặc chờ reset; flash-high là mặc định vì hạn mức lớn nhất.")
    if "headless mode cannot prompt" in low or "auto-denied" in low or "permission" in low and "denied" in low:
        return "permission", "agent bị từ chối quyền lệnh (thường do `python3 -c` nhiều dấu nháy, hoặc lệnh ngoài python3) — resume kèm ghi chú chỉ dùng công cụ file."
    if any(k in low for k in ("deadline", "timed out", "timeout", "econnreset", "connection reset")):
        return "network", "lỗi mạng/quá thời gian — chạy lại (unstick); kiểm tra đường truyền."
    if not done and result.get("status") == "SUCCESS":
        return "early_stop", "agent trả lời xong nhưng chưa hoàn tất bước cuối — resume nhắc làm tiếp (auto đã tự thử); nếu lặp lại, đọc câu cuối của agent: thường nó đang báo bị chặn."
    return None


def report_agy(task: Path, result: dict, role: str = "coder", home: Path | None = None) -> None:
    state = load_state(task)
    print(f"agy: status={result.get('status')} exit={result['exit_code']} "
          f"conversation={result.get('conversation_id')} turns={result.get('num_turns')} "
          f"thời gian={result.get('duration_seconds')}s")
    for n in result["notices"]:
        print(f"  [stderr] {n}")
    if result.get("error"):
        print(f"  [lỗi] {result['error']}")
    cause = agy_failure_cause(result, state["status"] in ROLE_DONE[role])
    if cause:
        print(f"CHẨN ĐOÁN: {cause[0]} — {cause[1]}")
        log_event("agy_failure", state["id"], cause=cause[0], role=role)
    if is_quota(result):
        if state["status"] in ROLE_DONE[role]:
            print("(Lỗi hạn mức xảy ra sau khi agent đã xong phần việc — không ảnh hưởng kết quả.)")
        else:
            print("HẾT HẠN MỨC MODEL (cả model dự phòng): không thử lại cùng model. Hạn mức tính theo từng model — "
                  "làm tiếp bằng model khác: resume/reject <ID> --agy-model <slug> (xem `agy models`), "
                  "hoặc thêm vào agy_fallback_models trong handoff/config.json.")
    print("\n--- Trả lời cuối của agent ---\n" + str(result.get("response", ""))[-1500:])
    print(f"\nTrạng thái task sau khi agent ({role}) dừng: {state['status']}")
    if state["status"] not in ROLE_DONE[role]:
        print("CẢNH BÁO: agent dừng nhưng chưa xong phần việc — xem lỗi/thao tác bị từ chối ở trên.")
        if result["notices"] and (call := last_tool_call(result.get("conversation_id"), home)):
            print(f"Thao tác cuối của agent (nhiều khả năng bị từ chối):\n  {call}")
        print(f"Cho làm tiếp: python3 scripts/handoff.py resume {state['id']} --role {role} --note \"<hướng dẫn>\"")


def ide_chat(prompt: str, attach: list[Path]) -> bool:
    """Gửi prompt vào khung agent của Antigravity IDE qua `antigravity-ide chat` (chạy được từ mọi terminal).
    Mở thư mục dự án trong cửa sổ IDE gần nhất trước, để agent làm việc đúng workspace."""
    if not IDE_CLI.exists():
        return False
    if subprocess.run([str(IDE_CLI), "-r", str(ROOT)]).returncode != 0:
        return False
    args = [str(IDE_CLI), "chat", "-m", "agent", "-r"]
    for f in attach:
        args += ["-a", str(f)]
    return subprocess.run([*args, prompt]).returncode == 0


def hand_over(prompt: str) -> None:
    """Phương án cuối: copy lời giao việc vào clipboard để dán vào Antigravity."""
    try:
        subprocess.run(["pbcopy"], input=prompt, text=True, check=True)
        where = "ĐÃ COPY vào clipboard — mở Antigravity (Agent Manager), tạo hội thoại mới và dán."
    except (OSError, subprocess.CalledProcessError):
        where = "Dán đoạn sau vào hội thoại Antigravity:"
    print(f"Không gọi được Antigravity CLI. {where}\n\n{prompt}")


# ---------- lệnh ----------

def cmd_new(a) -> None:
    TASKS.mkdir(parents=True, exist_ok=True)
    nums = [int(m.group(1)) for p in TASKS.iterdir() if (m := re.match(r"TASK-(\d+)", p.name))]
    task_id = f"TASK-{(max(nums) + 1) if nums else 1:03d}"
    slug = re.sub(r"[^a-z0-9]+", "-", a.slug.lower()).strip("-")
    task = TASKS / f"{task_id}-{slug}"
    task.mkdir()
    for name in ("brief.md", "verify.sh"):
        text = (TEMPLATE / name).read_text(encoding="utf-8")
        (task / name).write_text(text.replace("{{ID}}", task_id).replace("{{TITLE}}", a.title), encoding="utf-8")
    state = {"id": task_id, "title": a.title, "status": None, "conversation_id": None, "history": []}
    save_state(task, state, "draft", "Claude tạo task")
    print(task.relative_to(ROOT))


def cmd_lock(a) -> None:
    task = find_task(a.id)
    files = [task / "verify.sh", *[ROOT / f for f in a.files]]
    bad = [l.strip() for l in (task / "verify.sh").read_text(encoding="utf-8").splitlines()
           if re.search(r"\btsc\b", l) and re.search(r"\.tsx?\b", l) and not re.search(r"(-p|--project)\b", l)
           and not l.lstrip().startswith("#")]
    if bad:  # tsc nhận file trên dòng lệnh thì BỎ QUA tsconfig.json → báo lỗi giả (đã gặp ở TASK-057)
        die("verify.sh chạy `tsc` với danh sách file nên tsc bỏ qua tsconfig.json: " + bad[0] + "\n"
            "  → dùng `npx tsc --noEmit -p tsconfig.json` (toàn dự án).")
    relock = (task / "tests.lock").exists()
    lines = []
    for f in files:
        if not f.exists():
            die(f"không có file {f}")
        lines.append(f"{sha256(f)}  {f.resolve().relative_to(ROOT)}")
    (task / "tests.lock").write_text("\n".join(lines) + "\n", encoding="utf-8")
    state = load_state(task)
    state["locked_files"] = [l.split("  ", 1)[1] for l in lines]
    save_state(task, state)
    if relock:
        log_event("claude_fix", state["id"], what="khoá lại test/verify sau khi chỉnh tay")
    print(f"Đã khoá {len(lines)} file.")


def cmd_dispatch(a) -> None:
    task = find_task(a.id)
    state = load_state(task)
    if problems := check_lock(task):
        die("; ".join(problems))
    tester = agent_of(state, "tester")["account"]
    if a.as_ and tester and a.as_ == tester:
        die(f"{a.as_} đã viết test cho {state['id']} — người code phải là tài khoản khác")
    rel = task.relative_to(ROOT)
    prompt = (
        f"Bạn là kỹ sư thực thi của dự án {ROOT.name} tại thư mục {ROOT}. "
        f"Bạn được giao viết code cho {state['id']}: {state['title']}. "
        f"Hãy dùng skill /thuc-hien-task (.agents/skills/thuc-hien-task/SKILL.md) với task {state['id']}: "
        f"đọc {rel}/brief.md, chạy `python3 scripts/handoff.py start {state['id']}`, thực hiện, "
        f"tự kiểm bằng `python3 scripts/handoff.py verify {state['id']}` (không chạy bash trực tiếp), "
        f"viết {rel}/report.md rồi chạy `python3 scripts/handoff.py submit {state['id']}`. "
        "Tuyệt đối không sửa các file test bị khoá trong tests.lock."
    )
    if a.via in ("auto", "agy") and Path(AGY).exists():
        agent_of(state, "coder")["account"] = a.as_
        save_state(task, state, "assigned", f"giao code qua agy cho {a.as_ or 'tài khoản hiện tại'} "
                                            f"({a.agy_model or 'model mặc định'})")
        agy_task(task, prompt, a.agy_model, role="coder", account=a.as_)
        return
    if a.via == "agy":
        die(f"chưa cài agy ({AGY}) — xem handoff/README.md")
    out = None
    if a.via in ("auto", "agentapi"):
        out = agentapi("new-conversation", f"--model={a.model}", f"--title={state['id']} {state['title']}", prompt)
    if out is None:
        if a.via in ("auto", "ide") and ide_chat(prompt, [task / "brief.md"]):
            save_state(task, state, "assigned", "giao qua antigravity-ide chat")
            print(f"Đã gửi {state['id']} vào khung agent của Antigravity IDE.")
            return
        save_state(task, state, "assigned", "giao thủ công (clipboard)")
        hand_over(prompt)
        return
    m = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", out)
    state["conversation_id"] = m.group(0) if m else None
    save_state(task, state, "assigned", f"giao qua agentapi ({a.model})")
    print(out)
    if not m:
        print("CẢNH BÁO: không đọc được conversation_id — `reject` sẽ phải giao thủ công.")


def cmd_dispatch_tests(a) -> None:
    """Giao viết test + verify.sh cho tài khoản kiểm (khác người sẽ code)."""
    task = find_task(a.id)
    state = load_state(task)
    if state["status"] not in ("draft", "tests_assigned"):
        die(f"{state['id']} đang ở trạng thái {state['status']}, chỉ giao viết test cho task draft")
    if (task / "tests.lock").exists():
        die(f"{state['id']} đã có tests.lock — test đã được viết/khoá")
    coder = agent_of(state, "coder")["account"]
    tester = a.as_ or pick_other(coder, state["id"])
    if coder and tester == coder:
        die(f"{tester} là người code {state['id']} — người viết test phải là tài khoản khác")
    agent_of(state, "tester")["account"] = tester
    save_state(task, state, "tests_assigned", f"giao viết test chéo cho {tester}")
    rel = task.relative_to(ROOT)
    prompt = (
        f"Bạn là kỹ sư kiểm thử của dự án {ROOT.name} tại thư mục {ROOT}. Một tài khoản Antigravity khác sẽ viết code "
        f"cho {state['id']}: {state['title']}; việc của bạn là viết test + verify.sh làm hợp đồng nghiệm thu. "
        f"Dùng skill /viet-test-cheo (.agents/skills/viet-test-cheo/SKILL.md): đọc {rel}/brief.md, chỉ viết test trong "
        f"{', '.join(CONFIG['test_paths'])} và {rel}/verify.sh, KHÔNG viết code sản phẩm, rồi chạy "
        f"`python3 scripts/handoff.py tests-done {state['id']} <các file test>`."
    )
    agy_task(task, prompt, a.agy_model, role="tester", account=tester)


def cmd_tests_done(a) -> None:
    """Người kiểm nộp test: chỉ được đổi file test + verify.sh, test phải đỏ (chưa có code), rồi khoá."""
    task = find_task(a.id)
    state = load_state(task)
    if state["status"] != "tests_assigned":
        die(f"{state['id']} đang ở trạng thái {state['status']}, không phải lúc nộp test")
    script = task / "verify.sh"
    if "TODO" in script.read_text(encoding="utf-8"):
        die(f"{script.relative_to(ROOT)} vẫn còn TODO — điền lệnh xác minh thật")
    files = [f.lstrip("./") for f in a.files]
    if not files:
        die("liệt kê các file test đã viết: tests-done <ID> tests/abc.test.ts …")
    for f in files:
        if not (ROOT / f).is_file():
            die(f"không có file {f}")
        if not in_patterns(f, CONFIG["test_paths"]):
            die(f"{f} không nằm trong test_paths ({', '.join(CONFIG['test_paths'])})")
    own = task_dir_rel(task)
    stray = [f for f in changed_files() if not f.startswith(own) and not in_patterns(f, CONFIG["test_paths"])]
    if stray:
        die("người viết test không được sửa file ngoài test: " + ", ".join(stray) + " — hoàn tác rồi nộp lại")
    code = run_verify(task, quiet=True)
    if code == 0 and not a.allow_green:
        die("verify.sh đã xanh khi chưa có code — test chưa bắt được hành vi mới. Viết test cho đúng tiêu chí "
            "brief mục 5 (hoặc --allow-green \"<lý do>\" nếu task chỉ refactor)")
    cmd_lock(argparse.Namespace(id=a.id, files=files))
    state = load_state(task)
    note = f"test chéo đã khoá ({len(files)} file), verify đỏ đúng chờ code" if code else f"test xanh: {a.allow_green}"
    save_state(task, state, "tests_ready", note)
    print(f"{state['id']} -> tests_ready. Giao code cho tài khoản khác {agent_of(state, 'tester')['account'] or ''}.")


def cmd_dispatch_review(a) -> None:
    """Giao nghiệm thu chéo cho tài khoản khác người code."""
    task = find_task(a.id)
    state = load_state(task)
    if state["status"] not in ("submitted", "in_review"):
        die(f"{state['id']} đang ở trạng thái {state['status']}, chỉ nghiệm thu task đã nộp")
    coder = agent_of(state, "coder")["account"]
    reviewer = a.as_ or agent_of(state, "tester")["account"] or pick_other(coder, state["id"])
    if reviewer == coder:
        die(f"{reviewer} là người code {state['id']} — người nghiệm thu phải là tài khoản khác")
    rv = agent_of(state, "reviewer")
    if rv["account"] and rv["account"] != reviewer:
        rv["conversation_id"] = None  # đổi người nghiệm thu → hội thoại mới
    rv["account"] = reviewer
    state["review_fingerprint"] = fingerprint(task, set())
    (task / "cross-review.md").unlink(missing_ok=True)
    save_state(task, state, "in_review", f"giao nghiệm thu chéo cho {reviewer}")
    rel = task.relative_to(ROOT)
    prompt = (
        f"Bạn là người nghiệm thu chéo của dự án {ROOT.name} tại thư mục {ROOT}. Một tài khoản Antigravity khác vừa nộp "
        f"{state['id']}: {state['title']}. Dùng skill /nghiem-thu-cheo (.agents/skills/nghiem-thu-cheo/SKILL.md): "
        f"chạy `python3 scripts/handoff.py verify {state['id']} --quiet`, `scope {state['id']}`, `diff {state['id']}`, "
        f"đối chiếu với {rel}/brief.md, viết {rel}/cross-review.md rồi chạy `review-pass` hoặc `review-fail {state['id']}`. "
        "KHÔNG sửa code hay test."
    )
    agy_task(task, prompt, a.agy_model, role="reviewer", account=reviewer)


def review_gate(task: Path, state: dict) -> None:
    if state["status"] != "in_review":
        die(f"{state['id']} đang ở trạng thái {state['status']}, không phải lúc kết luận nghiệm thu chéo")
    if state.get("review_fingerprint") != fingerprint(task, set()):
        die("code đã bị sửa trong lúc nghiệm thu — người nghiệm thu không được sửa code; hoàn tác thay đổi của mình")
    cr = task / "cross-review.md"
    if not cr.exists() or len(cr.read_text(encoding="utf-8").strip()) < 40:
        die(f"viết {cr.relative_to(ROOT)} trước (kết luận + các mục đã kiểm / cần sửa)")


def cmd_review_pass(a) -> None:
    task = find_task(a.id)
    state = load_state(task)
    review_gate(task, state)
    problems = check_lock(task) + scope_problems(task)
    if problems:
        die("chưa đạt cửa cứng: " + "; ".join(problems) + " — dùng review-fail")
    if run_verify(task, quiet=True) != 0:
        die("verify.sh đỏ — không thể duyệt đạt, dùng review-fail")
    who = agent_of(state, "reviewer")["account"] or "agy"
    if difficulty(task) == "LOW":
        save_state(task, state, "accepted", f"nghiệm thu chéo đạt bởi {who} (LOW)")
        print(f"{state['id']} -> accepted (nghiệm thu chéo, LOW).")
    else:
        save_state(task, state, "review_passed", f"nghiệm thu chéo đạt bởi {who} — chờ trưởng phòng (HIGH/nhạy cảm)")
        print(f"{state['id']} -> review_passed. Task HIGH/nhạy cảm: trưởng phòng duyệt lần cuối (/nghiem-thu).")


def cmd_review_fail(a) -> None:
    task = find_task(a.id)
    state = load_state(task)
    review_gate(task, state)
    shutil.copyfile(task / "cross-review.md", task / "review.md")
    state["cross_rounds"] = state.get("cross_rounds", 0) + 1
    who = agent_of(state, "reviewer")["account"] or "agy"
    save_state(task, state, "changes_requested", f"nghiệm thu chéo trả về bởi {who} (vòng {state['cross_rounds']})")
    print(f"{state['id']} -> changes_requested (vòng {state['cross_rounds']}/{MAX_CROSS_ROUNDS}).")


def cmd_scope(a) -> None:
    task = find_task(a.id)
    problems = check_lock(task) + scope_problems(task)
    files = [f for f in changed_files() if not f.startswith(task_dir_rel(task))]
    print(f"{len(files)} file đã đổi ngoài thư mục task; phạm vi brief: {', '.join(brief_scope(task)) or '(trống)'}")
    for p in problems:
        print(f"  VẤN ĐỀ: {p}")
    print("PHẠM VI: " + ("OK" if not problems else f"{len(problems)} vấn đề"))
    sys.exit(1 if problems else 0)


def cmd_diff(a) -> None:
    task = find_task(a.id)
    own = task_dir_rel(task)
    files = [f for f in changed_files() if not f.startswith(own)]
    tracked = subprocess.run(["git", "ls-files", "--", *files], cwd=ROOT, capture_output=True, text=True).stdout.split()
    if tracked:
        print(subprocess.run(["git", "diff", "HEAD", "--", *tracked], cwd=ROOT, capture_output=True, text=True).stdout)
    for f in files:
        if f not in tracked and (ROOT / f).is_file():
            print(f"=== file mới: {f}\n{(ROOT / f).read_text(encoding='utf-8', errors='replace')}")


def cmd_auto(a) -> None:
    """Chạy cả chuỗi nghiệm thu chéo cho một task, dừng ở chỗ cần trưởng phòng. Chạy nền."""
    task = find_task(a.id)
    state = load_state(task)
    coder = a.coder or agent_of(state, "coder")["account"]
    checker = a.checker or agent_of(state, "tester")["account"]
    if not coder and not checker:  # chia đều: task chẵn/lẻ đổi vai cho nhau
        accs, n = sorted(agy_accounts()), int(re.sub(r"\D", "", state["id"]) or 0)
        if len(accs) < 2:
            pick_other(None, state["id"])  # báo lỗi thiếu tài khoản
        coder, checker = accs[n % len(accs)], accs[(n + 1) % len(accs)]
    coder = coder or pick_other(checker, state["id"])
    checker = checker or pick_other(coder, state["id"])
    if coder == checker:
        die("người code và người kiểm phải là hai tài khoản khác nhau")
    print(f"{state['id']}: {coder} code · {checker} viết test + nghiệm thu chéo")
    ns = lambda **kw: argparse.Namespace(id=a.id, agy_model=a.agy_model, **kw)  # noqa: E731
    stalls: dict[str, int] = {}
    for _ in range(16):  # chặn vòng lặp vô hạn
        status = load_state(task)["status"]
        print(f"\n=== {state['id']} đang ở {status}", flush=True)
        if status == "draft":
            if (task / "tests.lock").exists():
                cmd_dispatch(ns(as_=coder, via="agy", model="pro"))
            else:
                cmd_dispatch_tests(ns(as_=checker))
        elif status == "tests_ready":
            cmd_dispatch(ns(as_=coder, via="agy", model="pro"))
        elif status == "submitted":
            if cross_review_enabled():
                cmd_dispatch_review(ns(as_=checker))
            else:  # submit đã kiểm khoá test + phạm vi + verify.sh; phần còn lại do cổng tự động (orchestrate.py gate) và Claude
                st = load_state(task)
                if difficulty(task) == "LOW":
                    save_state(task, st, "accepted", "LOW: không nghiệm thu chéo bằng agent — cổng tự động (orchestrate.py gate) trước khi merge")
                else:
                    save_state(task, st, "review_passed", "HIGH/nhạy cảm: không nghiệm thu chéo bằng agent — chờ trưởng phòng (gate + duyệt)")
        elif status == "changes_requested":
            st = load_state(task)
            if st.get("cross_rounds", 0) > MAX_CROSS_ROUNDS:
                break
            cmd_reject(ns(force=False))
        else:
            break
        if load_state(task)["status"] == status:
            # agent dừng sớm mà không chuyển trạng thái (hay gặp ở model Claude trên agy: đọc xong rồi dừng) → tự nhắn làm tiếp
            role = STALL_ROLE.get(status)
            if role and stalls.get(status, 0) < MAX_AUTO_RESUMES:
                stalls[status] = stalls.get(status, 0) + 1
                print(f"Agent dừng sớm ở {status} → tự resume vai {role} (lần {stalls[status]}/{MAX_AUTO_RESUMES})", flush=True)
                log_event("resume_early_stop", state["id"], role=role)
                cmd_resume(argparse.Namespace(id=a.id, role=role, agy_model=a.agy_model, note=RESUME_NOTE))
                continue
            break  # vẫn không chuyển trạng thái → cần người xem
    st = load_state(task)
    print(f"\n=== KẾT THÚC auto {st['id']}: {st['status']}")
    print({"accepted": "Đạt. Chạy `orchestrate.py gate` rồi `merge-low` (LOW), hoặc Claude merge.",
           "review_passed": "Task HIGH/nhạy cảm → chạy `orchestrate.py gate`, trưởng phòng duyệt lần cuối (/nghiem-thu).",
           }.get(st["status"], "CẦN TRƯỞNG PHÒNG: agent dừng giữa chừng, cầu cứu, hoặc trả về quá "
                                f"{MAX_CROSS_ROUNDS} vòng — đọc report.md mục câu hỏi / review.md."))


def cmd_accounts(a) -> None:
    accs = agy_accounts()
    for name, home in accs.items():
        print(f"{name:<6} HOME={home}")
    if len(accs) < 2:
        print("Chỉ có 1 tài khoản — nghiệm thu chéo trên máy này chưa chạy được.")


def cmd_start(a) -> None:
    task = find_task(a.id)
    state = load_state(task)
    if state["status"] not in WORKER_CMDS["start"]:
        die(f"{state['id']} đang ở trạng thái {state['status']}, không nhận việc được")
    save_state(task, state, "in_progress", "Antigravity nhận việc")
    print(f"{state['id']} -> in_progress. Đọc {task.relative_to(ROOT)}/brief.md" +
          (" và review.md" if (task / "review.md").exists() else ""))


def cmd_submit(a) -> None:
    task = find_task(a.id)
    state = load_state(task)
    if state["status"] not in WORKER_CMDS["submit"]:
        die(f"{state['id']} đang ở trạng thái {state['status']}, phải `start` trước")
    if problems := check_lock(task):
        die("vi phạm khoá test: " + "; ".join(problems) + " — khôi phục bằng `git checkout -- <file>`")
    if brief_scope(task) and (stray := scope_problems(task)):
        die("; ".join(stray) + " — hoàn tác file ngoài brief mục 3 (cần thêm thì ghi vào report.md mục câu hỏi)")
    report = task / "report.md"
    if not report.exists() or len(report.read_text(encoding="utf-8").strip()) < 50:
        die(f"thiếu {report.relative_to(ROOT)} (theo mẫu handoff/templates/report.md)")
    code = run_verify(task)
    if code != 0:
        die(f"verify.sh thất bại (exit {code}) — sửa code (không sửa test) rồi nộp lại")
    save_state(task, state, "submitted", "Antigravity nộp, verify.sh đạt")
    print(f"{state['id']} -> submitted. Báo trưởng phòng nghiệm thu.")


def cmd_verify(a) -> None:
    task = find_task(a.id)
    problems = check_lock(task)
    for p in problems:
        print(f"KHOÁ TEST: {p}")
    code = run_verify(task, quiet=a.quiet)
    print(f"\nKẾT QUẢ: khoá test {'OK' if not problems else 'VI PHẠM'}, verify.sh exit {code}")
    sys.exit(1 if problems or code else 0)


def cmd_accept(a) -> None:
    task = find_task(a.id)
    state = load_state(task)
    if check_lock(task) or run_verify(task, quiet=True) != 0:
        die("chưa đạt — chạy `verify` để xem chi tiết")
    save_state(task, state, "accepted", "Claude nghiệm thu")
    log_event("accept", state["id"])
    print(f"{state['id']} -> accepted")


def cmd_reject(a) -> None:
    task = find_task(a.id)
    state = load_state(task)
    if state["status"] not in ("submitted", "review_passed", "changes_requested"):
        die(f"{state['id']} đang ở trạng thái {state['status']}, chỉ trả về được task đã nộp")
    log_event("reject", state["id"])
    review = task / "review.md"
    if not review.exists():
        die(f"viết {review.relative_to(ROOT)} trước khi trả về")
    if state["status"] == "changes_requested":  # nghiệm thu chéo đã trả về, chỉ còn gửi cho người code
        if state.get("cross_rounds", 0) > MAX_CROSS_ROUNDS and not a.force:
            die(f"đã trả về chéo {state['cross_rounds']} vòng — đẩy lên trưởng phòng (--force để gửi tiếp)")
    else:
        save_state(task, state, "changes_requested", "Claude yêu cầu sửa")
    msg = (f"{state['id']} chưa đạt nghiệm thu. Đọc {review.relative_to(ROOT)}, "
           f"chạy `python3 scripts/handoff.py start {state['id']}`, sửa theo từng mục, "
           "cập nhật report.md (thêm mục 'Vòng sửa') rồi `submit` lại.")
    coder = agent_of(state, "coder")
    if state.get("via") == "agy" and coder["conversation_id"] and Path(AGY).exists():
        agy_task(task, msg, a.agy_model, coder["conversation_id"], role="coder", account=coder["account"])
        return
    out = agentapi("send-message", state["conversation_id"], msg) if state.get("conversation_id") else None
    if out is None:
        if ide_chat(msg, [task / "brief.md", review]):
            print(f"Đã gửi yêu cầu sửa {state['id']} vào khung agent của Antigravity IDE.")
            return
        hand_over(msg)
    else:
        print(out)


def cmd_resume(a) -> None:
    task = find_task(a.id)
    state = load_state(task)
    working = {"coder": ("assigned", "in_progress", "changes_requested"), "tester": ("tests_assigned",),
               "reviewer": ("in_review",)}[a.role]
    if state["status"] not in working:
        die(f"{state['id']} đang ở trạng thái {state['status']}, vai {a.role} không cần làm tiếp")
    ag = agent_of(state, a.role)
    if state.get("via") != "agy" or not ag["conversation_id"]:
        die(f"vai {a.role} của task không được giao qua agy — giao lại bằng dispatch")
    msg = (f"Tiếp tục {state['id']} từ chỗ đang dừng, theo skill {ROLE_SKILL[a.role]}, tới khi {ROLE_FINISH[a.role]}. "
           + (a.note or ""))
    agy_task(task, msg, a.agy_model, ag["conversation_id"], role=a.role, account=ag["account"])


def cmd_list(a) -> None:
    if not TASKS.exists() or not any(TASKS.iterdir()):
        print("Chưa có task nào.")
        return
    for task in sorted(p for p in TASKS.iterdir() if p.is_dir()):
        s = load_state(task)
        roles = " ".join(f"{r[0]}:{v['account']}" for r, v in s.get("agents", {}).items() if v.get("account"))
        print(f"{s['id']:<9} {s['status']:<18} {s['title']}" + (f"  [{roles}]" if roles else ""))


def cmd_doctor(a) -> None:
    checks: list[tuple[bool, str, str]] = []

    def check(ok: bool, label: str, fix: str = "") -> None:
        checks.append((ok, label, fix))

    for rel in (".agents/rules/vai-tro-ky-su-thuc-thi.md", ".agents/skills/thuc-hien-task/SKILL.md",
                ".agents/skills/viet-test-cheo/SKILL.md", ".agents/skills/nghiem-thu-cheo/SKILL.md",
                ".agents/skills/dieu-phoi/SKILL.md", "scripts/orchestrate.py",
                ".agents/hooks.json", "scripts/agy_guard.py", "AGENTS.md", "handoff/config.json"):
        check((ROOT / rel).exists(), f"có {rel}", "chạy /khoi-tao-phoi-hop cập nhật")
    legacy = [p for p in (".agent/rules/vai-tro-ky-su-thuc-thi.md", ".agent/workflows/thuc-hien-task.md")
              if (ROOT / p).exists()]
    check(not legacy, "không còn file kiểu cũ trong .agent/", f"xoá {', '.join(legacy)} (đã chuyển sang .agents/)")
    guard = subprocess.run([sys.executable, str(ROOT / "scripts" / "agy_guard.py")], cwd=ROOT / ".agents",
                           input=json.dumps({"toolCall": {"name": "write_to_file",
                                                          "args": {"path": "scripts/handoff.py"}}}),
                           capture_output=True, text=True)
    check('"deny"' in guard.stdout, "hook chặn được sửa scripts/handoff.py", guard.stderr.strip()[-200:])
    has_agy = Path(AGY).exists()
    check(has_agy, f"đã cài Antigravity CLI ({AGY})",
          "curl -fsSL https://antigravity.google/cli/install.sh | bash   rồi chạy `agy` một lần để đăng nhập")
    if has_agy:
        ver = subprocess.run([AGY, "--version"], capture_output=True, text=True)
        check(ver.returncode == 0, f"agy chạy được: {(ver.stdout or ver.stderr).strip()[:60]}")
        allow: list[str] = []
        if AGY_SETTINGS.exists():
            try:
                allow = json.loads(AGY_SETTINGS.read_text(encoding="utf-8")).get("permissions", {}).get("allow", [])
            except json.JSONDecodeError:
                pass
        check(any("python3" in x for x in allow), "agy được phép chạy python3 (handoff.py, test)",
              f'thêm "command(python3)" vào permissions.allow trong {AGY_SETTINGS}')
    accs = agy_accounts()
    check(len(accs) >= 2, f"có ≥ 2 tài khoản agy để viết test chéo ({', '.join(accs) or 'không có'})",
          "không bắt buộc — máy chỉ 1 tài khoản thì chạy task trên máy thợ (AGY_HOST=macbook)")
    check(IDE_CLI.exists(), "có Antigravity IDE (đường dự phòng `antigravity-ide chat`)", "không bắt buộc")
    for ok, label, fix in checks:
        print(f"{'OK  ' if ok else 'THIẾU'} {label}" + ("" if ok or not fix else f"\n      → {fix}"))
    sys.exit(0 if all(ok for ok, label, _ in checks if "không bắt buộc" not in _) else 1)


def main() -> None:
    p = argparse.ArgumentParser(description="Giao việc Claude <-> Antigravity")
    sub = p.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("new"); n.add_argument("slug"); n.add_argument("--title", required=True)
    l = sub.add_parser("lock"); l.add_argument("id"); l.add_argument("files", nargs="*")
    d = sub.add_parser("dispatch"); d.add_argument("id")
    d.add_argument("--model", default="pro", choices=["pro", "flash", "flash_lite"])
    d.add_argument("--via", default="auto", choices=["auto", "agy", "agentapi", "ide", "clipboard"],
                   help="auto: agy → agentapi (trong terminal Antigravity) → antigravity-ide chat → clipboard")
    default_model = os.environ.get("AGY_MODEL")  # None → agy_task chọn theo vai trò (agy_role_models) rồi agy_model
    d.add_argument("--agy-model", default=default_model,
                   help="slug model cho agy (xem `agy models`); mặc định: biến AGY_MODEL, rồi handoff/config.json")
    d.add_argument("--as", dest="as_", help="tài khoản agy viết code (vd agy1; xem `accounts`)")
    for name in ("dispatch-tests", "dispatch-review"):
        x = sub.add_parser(name); x.add_argument("id")
        x.add_argument("--as", dest="as_", help="tài khoản agy kiểm (mặc định: tài khoản khác người code)")
        x.add_argument("--agy-model", default=default_model)
    au = sub.add_parser("auto"); au.add_argument("id")
    au.add_argument("--coder", help="tài khoản viết code"); au.add_argument("--checker", help="tài khoản viết test + nghiệm thu")
    au.add_argument("--agy-model", default=default_model)
    td = sub.add_parser("tests-done"); td.add_argument("id"); td.add_argument("files", nargs="*")
    td.add_argument("--allow-green", default="", help="lý do chấp nhận test xanh khi chưa có code (task refactor)")
    for name in ("start", "submit", "accept", "review-pass", "review-fail", "scope", "diff"):
        sub.add_parser(name).add_argument("id")
    v = sub.add_parser("verify"); v.add_argument("id")
    v.add_argument("--quiet", action="store_true", help="chỉ in tóm tắt, log đầy đủ ra file (cho trưởng phòng nghiệm thu)")
    rj = sub.add_parser("reject"); rj.add_argument("id")
    rj.add_argument("--agy-model", default=default_model, help="đổi model khi model mặc định hết hạn mức")
    rj.add_argument("--force", action="store_true", help="gửi trả tiếp dù đã quá số vòng trả về chéo")
    r = sub.add_parser("resume"); r.add_argument("id"); r.add_argument("--note", default="")
    r.add_argument("--role", default="coder", choices=["coder", "tester", "reviewer"])
    r.add_argument("--agy-model", default=default_model, help="đổi model khi model mặc định hết hạn mức")
    for name in ("list", "accounts", "doctor"):
        sub.add_parser(name)
    a = p.parse_args()
    globals()[f"cmd_{a.cmd.replace('-', '_')}"](a)


if __name__ == "__main__":
    main()

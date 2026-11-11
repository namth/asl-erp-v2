#!/usr/bin/env bash
# Chạy nhiều task Antigravity song song: mỗi task một git worktree + nhánh riêng.
#   AGY_ACCOUNT=N  — tài khoản agy trên máy này (N>1 dùng HOME=$HOME/.agy-accountN)
#   AGY_HOST=macbook — chạy task trên máy thợ qua SSH (repo ~/agy-farm/learningsystem, agy HOME=~/.agy-worker)
#
#   scripts/agy-worktree.sh new      TASK-008            # tạo worktree từ HEAD (cây làm việc phải sạch)
#   scripts/agy-worktree.sh auto     TASK-008 [--coder agy1 --checker agy2]   # test chéo → code → nghiệm thu chéo
#   scripts/agy-worktree.sh tests|review TASK-008 [--as agyN]                 # từng bước của chuỗi chéo
#   scripts/agy-worktree.sh scope    TASK-008            # so file đã đổi với brief mục 3
#   scripts/agy-worktree.sh dispatch TASK-008 [--as agyN] --agy-model <slug>
#   scripts/agy-worktree.sh resume   TASK-008 --note "..."
#   scripts/agy-worktree.sh verify   TASK-008
#   scripts/agy-worktree.sh accept   TASK-008
#   scripts/agy-worktree.sh merge    TASK-008            # commit trong worktree, merge --no-ff về nhánh hiện tại, dọn worktree
#   scripts/agy-worktree.sh list
#   (với task chạy trên máy thợ: đặt AGY_HOST=macbook cho MỌI lệnh của task đó)
set -euo pipefail

die() { echo "LỖI: $*" >&2; exit 1; }

ROOT="$(git rev-parse --show-toplevel)"
BASE_DIR="${AGY_WT_DIR:-$(dirname "$(git rev-parse --git-common-dir)")/../agy-worktrees}"
cmd="${1:-}"
id="${2:-}"

# ── Máy thợ ────────────────────────────────────────────────────────────────
HOST="${AGY_HOST:-}"
case "$HOST" in
  "") ;;
  macbook)
    REMOTE="namtran@${MACBOOK_HOST:-nams-macbook-air.local}"  # IP đổi theo mạng → dùng tên .local; khoá host đối chiếu theo alias cũ
    SSH_KEY="$HOME/.ssh/id_macbook_agy"
    REMOTE_REPO="~/agy-farm/$(basename "$(dirname "$(git rev-parse --git-common-dir)")" 2>/dev/null || echo repo)"
    REMOTE_WT_BASE="~/agy-farm/worktrees"
    REMOTE_AGY_HOME="\$HOME/.agy-worker"  # tài khoản cuối cùng vẫn do --coder/--checker chọn trong handoff.py (accounts.json của máy thợ)
    GIT_REMOTE="macbook"
    ;;
  *) die "AGY_HOST không biết: $HOST" ;;
esac
rsh() { ssh -i "$SSH_KEY" -o BatchMode=yes -o HostKeyAlias=192.168.1.34 "$REMOTE" "export PATH=\"\$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:\$PATH\"; $*"; }
rgit() { GIT_SSH_COMMAND="ssh -i $SSH_KEY -o BatchMode=yes -o HostKeyAlias=192.168.1.34" git -C "$ROOT" "$@"; }

account_home() {
  local n="${AGY_ACCOUNT:-1}"
  if [ "$n" = "1" ]; then echo "$HOME"; else echo "$HOME/.agy-account$n"; fi
}

need_id() { [ -n "$id" ] || die "thiếu mã task (vd TASK-008)"; }
wt_path() { echo "$BASE_DIR/$id"; }
rwt_path() { echo "$REMOTE_WT_BASE/$id"; }
branch() { echo "agy/$id"; }

task_field() { # $1 = thư mục worktree (local), $2 = trường trong state.json
  python3 -c "import json,glob; print(json.load(open(glob.glob('$1/handoff/tasks/$id-*/state.json')[0]))['$2'])"
}

case "$cmd" in
  new)
    need_id
    [ -z "$(git -C "$ROOT" status --porcelain)" ] || die "cây làm việc chưa sạch — commit trước (worktree tạo từ HEAD)"
    ls -d "$ROOT"/handoff/tasks/"$id"-* >/dev/null 2>&1 || die "chưa có handoff/tasks/$id-* trong HEAD"
    if [ -n "$HOST" ]; then
      git -C "$ROOT" branch "$(branch)" HEAD
      rgit push -q "$GIT_REMOTE" "$(branch):refs/heads/$(branch)"
      # node_modules dùng chung ở repo gốc của máy thợ; cài lại khi package-lock.json đổi
      rsh "cd $REMOTE_REPO && if ! git diff --quiet HEAD $(branch) -- package-lock.json 2>/dev/null; then git checkout -q --detach $(branch) && npm ci --no-audit --no-fund >/dev/null 2>&1 && echo 'đã npm ci trên máy thợ'; fi; \
           git worktree add -q $(rwt_path) $(branch) && ln -s $REMOTE_REPO/node_modules $(rwt_path)/node_modules"
      echo "Worktree trên $HOST: $(rwt_path)  (nhánh $(branch))"
    else
      mkdir -p "$BASE_DIR"
      git -C "$ROOT" worktree add -b "$(branch)" "$(wt_path)" HEAD
      ln -s "$ROOT/node_modules" "$(wt_path)/node_modules"
      echo "Worktree: $(wt_path)  (nhánh $(branch))"
    fi
    ;;
  dispatch|resume|tests|review|auto|reject)
    # tests/review = viết test chéo / nghiệm thu chéo; auto = cả chuỗi (chọn tài khoản bằng --coder/--checker/--as)
    need_id; shift 2
    sub="$cmd"; [ "$cmd" = "tests" ] && sub="dispatch-tests"; [ "$cmd" = "review" ] && sub="dispatch-review"
    if [ -n "$HOST" ]; then
      args=""; for a in "$@"; do args="$args $(printf '%q' "$a")"; done
      echo "Máy thợ $HOST (agy HOME=$REMOTE_AGY_HOME) — worktree $(rwt_path)"
      rsh "cd $(rwt_path) && caffeinate -ims env HOME=$REMOTE_AGY_HOME python3 scripts/handoff.py $sub $id$args"  # máy thợ chỉ ngủ sau khi lệnh xong
    else
      [ -d "$(wt_path)" ] || die "chưa có worktree cho $id — chạy: $0 new $id"
      h="$(account_home)"
      [ -d "$h/.gemini/antigravity-cli" ] || die "tài khoản agy ${AGY_ACCOUNT:-1} chưa đăng nhập ($h/.gemini/antigravity-cli không có)"
      echo "Tài khoản agy ${AGY_ACCOUNT:-1} (HOME=$h) — worktree $(wt_path)"
      cd "$(wt_path)" && HOME="$h" python3 scripts/handoff.py "$sub" "$id" "$@"
    fi
    ;;
  verify|accept|scope|list-task)
    need_id
    sub="$cmd"; [ "$cmd" = "list-task" ] && sub="list"
    extra=""; [ "$cmd" = "verify" ] && extra="--quiet" # in tóm tắt, log đầy đủ ra file (tiết kiệm token trưởng phòng)
    if [ -n "$HOST" ]; then
      rsh "cd $(rwt_path) && python3 scripts/handoff.py $sub $( [ "$sub" = list ] || echo "$id" ) $extra"
    else
      cd "$(wt_path)" && python3 scripts/handoff.py "$sub" $( [ "$sub" = list ] || echo "$id" ) $extra
    fi
    ;;
  status)
    need_id
    if [ -n "$HOST" ]; then rsh "cd $(rwt_path) && git status --short && git diff --stat | tail -3"; else git -C "$(wt_path)" status --short; fi
    ;;
  merge)
    need_id
    msg_title() { echo "feat: $1 ($id)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"; }
    if [ -n "$HOST" ]; then
      state="$(rsh "cd $(rwt_path) && python3 -c \"import json,glob; d=json.load(open(glob.glob('handoff/tasks/$id-*/state.json')[0])); print(d['status']); print(d['title'])\"")"
      status="$(echo "$state" | head -1)"; title="$(echo "$state" | sed -n 2p)"
      [ "$status" = "accepted" ] || die "$id chưa được nghiệm thu (status=$status) — chạy accept trước"
      rsh "cd $(rwt_path) && rm -f node_modules && git add -A && (git diff --cached --quiet || git commit -q -F -)" <<<"$(msg_title "$title")"
      rgit fetch -q "$GIT_REMOTE" "+refs/heads/$(branch):refs/heads/$(branch)"
      git -C "$ROOT" merge --no-ff "$(branch)" -m "merge: $id — $title

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
      rsh "cd $REMOTE_REPO && git worktree remove --force $(rwt_path) && git branch -D $(branch) >/dev/null"
      git -C "$ROOT" branch -d "$(branch)"
      echo "Đã merge $id (máy thợ $HOST) vào $(git -C "$ROOT" branch --show-current)"
      python3 "$ROOT/scripts/metrics.py" event merge "$id" >/dev/null 2>&1 || true
    else
      wt="$(wt_path)"
      [ -d "$wt" ] || die "không có worktree $wt"
      status="$(task_field "$wt" status)"
      [ "$status" = "accepted" ] || die "$id chưa được nghiệm thu (status=$status) — chạy accept trong worktree trước"
      title="$(task_field "$wt" title)"
      rm -f "$wt/node_modules"
      git -C "$wt" add -A
      git -C "$wt" diff --cached --quiet || git -C "$wt" commit -q -m "$(msg_title "$title")"
      git -C "$ROOT" merge --no-ff "$(branch)" -m "merge: $id — $title

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
      git -C "$ROOT" worktree remove "$wt"
      git -C "$ROOT" branch -d "$(branch)"
      echo "Đã merge $id vào $(git -C "$ROOT" branch --show-current)"
      python3 "$ROOT/scripts/metrics.py" event merge "$id" >/dev/null 2>&1 || true
    fi
    ;;
  list)
    git -C "$ROOT" worktree list
    if [ -n "$HOST" ]; then echo "── máy thợ $HOST"; rsh "cd $REMOTE_REPO && git worktree list"; fi
    ;;
  *)
    sed -n '2,16p' "$0"; exit 1
    ;;
esac

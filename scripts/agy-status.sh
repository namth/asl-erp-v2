#!/usr/bin/env bash
# Bảng tổng hợp việc đã giao cho Antigravity trên mọi máy: trạng thái task trong từng worktree
# và agent agy đang chạy. Chỉ đọc, không đổi gì.
#   scripts/agy-status.sh          # mọi task
#   scripts/agy-status.sh --open   # bỏ qua task đã accepted
set -uo pipefail

OPEN_ONLY=0
[ "${1:-}" = "--open" ] && OPEN_ONLY=1

LOCAL_WT="${AGY_LOCAL_WORKTREES:-$HOME/Local Sites/agy-worktrees}"
REMOTE_HOST="${AGY_REMOTE_HOST:-namtran@nams-macbook-air.local}"
REMOTE_KEY="${AGY_REMOTE_KEY:-$HOME/.ssh/id_macbook_agy}"
REMOTE_ALIAS="${AGY_REMOTE_HOSTKEY_ALIAS:-192.168.1.34}"

# In một dòng/worktree: "<task> <trạng thái> <tiêu đề> [vai]" lấy từ handoff.py list của chính worktree đó.
read -r -d '' COLLECT <<'EOF'
open_only=$1; root=$2
cd "$root" 2>/dev/null || exit 0
for t in TASK-*; do
  [ -d "$t" ] || continue
  line=$(cd "$t" && python3 scripts/handoff.py list 2>/dev/null | grep "^$t ")
  [ -z "$line" ] && continue
  [ "$open_only" = 1 ] && echo "$line" | grep -q " accepted " && continue
  echo "  $line"
done
n=$(ps -axo comm= | grep -c "/agy$")
echo "  -> agent agy đang chạy: $n"
EOF

echo "== Máy chính ($LOCAL_WT)"
bash -c "$COLLECT" _ "$OPEN_ONLY" "$LOCAL_WT"

echo "== Máy thợ ($REMOTE_HOST)"
if ssh -i "$REMOTE_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o HostKeyAlias="$REMOTE_ALIAS" \
     "$REMOTE_HOST" "bash -s -- $OPEN_ONLY \$HOME/agy-farm/worktrees" <<<"$COLLECT"; then :
else
  echo "  (không kết nối được — máy thợ đang ngủ/gập nắp hoặc đổi mạng?)"
fi

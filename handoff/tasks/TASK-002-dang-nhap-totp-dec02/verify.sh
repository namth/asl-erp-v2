#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

python3 -m unittest tests/prototype/test_task_002_login_dec02.py -v

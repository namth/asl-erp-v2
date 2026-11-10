#!/bin/bash
set -e
python3 -m unittest tests/prototype/test_task_007_flexible_workflow_partial_pay.py -v
python3 scripts/check-prototype.py --strict

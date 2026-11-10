#!/bin/bash
set -e
python3 -m unittest tests/prototype/test_task_005_4states.py -v
python3 scripts/check-prototype.py --strict

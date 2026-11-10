#!/bin/bash
set -e
python3 -m unittest tests/prototype/test_task_003_role_menu_dec04.py -v
python3 scripts/check-prototype.py --strict

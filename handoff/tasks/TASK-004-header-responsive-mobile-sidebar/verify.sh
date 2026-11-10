#!/bin/bash
set -e
python3 -m unittest tests/prototype/test_task_004_header_responsive.py -v
python3 scripts/check-prototype.py --strict

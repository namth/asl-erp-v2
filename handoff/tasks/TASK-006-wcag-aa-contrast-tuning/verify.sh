#!/bin/bash
set -e
python3 -m unittest tests/prototype/test_task_006_wcag_contrast.py -v
python3 scripts/check-prototype.py --strict

# Báo cáo TASK-022

## Đã làm
- Tạo `.github/workflows/ci.yml`:
  - Kích hoạt sự kiện `push` và `pull_request`.
  - Cấu hình `concurrency` huỷ lần chạy cũ cùng nhánh (`cancel-in-progress: true`), `permissions: contents: read`.
  - Ghim toàn bộ Action theo tag phiên bản cụ thể (`actions/checkout@v4.2.2`, `actions/setup-node@v4.1.0`, `actions/setup-python@v5.3.0`).
  - Job `frontend`: cấu hình Node 22, cache npm theo `frontend/package-lock.json`, chạy các bước `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.
  - Job `backend`: cấu hình Python 3.11, 3 service containers (`postgres:16-alpine`, `redis:7-alpine`, `neo4j:5-community`) có health-check, cài `backend/requirements.txt` và `ruff`, chạy `ruff check backend`, `alembic -c backend/alembic.ini upgrade head`, `python -m backend.app.scripts.seed`, `pytest backend/tests -v`. Cung cấp đủ 12 biến môi trường trỏ localhost cho CI, không dùng `secrets.*` hay URL cloud.
- Tạo `Makefile`:
  - Khai báo biến `PY ?= .venv/bin/python`.
  - Khai báo `.PHONY` cho đầy đủ 8 target: `lint`, `typecheck`, `test-frontend`, `test-backend`, `test`, `migrate`, `seed`, `check-prototype`.
  - Các target in đúng lệnh mong muốn khi chạy dry-run `make -n`.
- Tạo `ruff.toml`:
  - Thiết lập `target-version = "py311"`, `line-length = 120`.
  - Kích hoạt danh sách luật kiểm tra tối thiểu: `E9`, `F63`, `F7`, `F82`.

## File đã tạo/sửa
- `.github/workflows/ci.yml`: Workflow CI tự động cho frontend và backend trên GitHub Actions
- `Makefile`: Gom lệnh thực thi chuẩn giữa môi trường dev và CI
- `ruff.toml`: Cấu hình linter ruff cho mã nguồn backend Python

## Kết quả tự kiểm
```text
$ bash handoff/tasks/TASK-022-ci-makefile-lint-tsk16/verify.sh
=== 1. actionlint .github/workflows/ci.yml ===
=== 2. Unit tests tests/infra/test_task_022_ci.py ===
test_actions_pinned_to_specific_version (tests.infra.test_task_022_ci.TestGitHubActionsCI.test_actions_pinned_to_specific_version) ... ok
test_backend_environment_variables (tests.infra.test_task_022_ci.TestGitHubActionsCI.test_backend_environment_variables) ... ok
test_concurrency (tests.infra.test_task_022_ci.TestGitHubActionsCI.test_concurrency) ... ok
test_file_exists (tests.infra.test_task_022_ci.TestGitHubActionsCI.test_file_exists) ... ok
test_job_backend_specification (tests.infra.test_task_022_ci.TestGitHubActionsCI.test_job_backend_specification) ... ok
test_job_frontend_specification (tests.infra.test_task_022_ci.TestGitHubActionsCI.test_job_frontend_specification) ... ok
test_jobs_frontend_and_backend_exist (tests.infra.test_task_022_ci.TestGitHubActionsCI.test_jobs_frontend_and_backend_exist) ... ok
test_no_cloud_urls_or_secrets (tests.infra.test_task_022_ci.TestGitHubActionsCI.test_no_cloud_urls_or_secrets) ... ok
test_permissions (tests.infra.test_task_022_ci.TestGitHubActionsCI.test_permissions) ... ok
test_triggers (tests.infra.test_task_022_ci.TestGitHubActionsCI.test_triggers) ... ok
test_file_exists (tests.infra.test_task_022_ci.TestMakefile.test_file_exists) ... ok
test_make_dry_run_targets (tests.infra.test_task_022_ci.TestMakefile.test_make_dry_run_targets) ... ok
test_phony_targets (tests.infra.test_task_022_ci.TestMakefile.test_phony_targets) ... ok
test_python_variable (tests.infra.test_task_022_ci.TestMakefile.test_python_variable) ... ok
test_target_commands (tests.infra.test_task_022_ci.TestMakefile.test_target_commands) ... ok
test_configuration_values (tests.infra.test_task_022_ci.TestRuffToml.test_configuration_values) ... ok
test_file_exists (tests.infra.test_task_022_ci.TestRuffToml.test_file_exists) ... ok
test_minimum_rules_selected (tests.infra.test_task_022_ci.TestRuffToml.test_minimum_rules_selected) ... ok

----------------------------------------------------------------------
Ran 18 tests in 0.072s

OK
=== 3. make -n cho từng target ===
make -n lint
ruff check backend
npm --prefix frontend run lint
make -n typecheck
npm --prefix frontend run typecheck
make -n test-frontend
npm --prefix frontend run test
make -n test-backend
.venv/bin/python -m pytest backend/tests
make -n test
npm --prefix frontend run test
.venv/bin/python -m pytest backend/tests
make -n migrate
alembic -c backend/alembic.ini upgrade head
make -n seed
.venv/bin/python -m backend.app.scripts.seed
make -n check-prototype
python3 scripts/check-prototype.py --strict
Xác minh hoàn tất: tất cả tiêu chí của TASK-022 đều đạt.

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không. Mọi tiêu chí nghiệm thu đều đạt kiểm tra tự động (`actionlint`, `test_task_022_ci.py`, dry-run `make -n`).

"""Test nghiệm thu TASK-022: CI GitHub Actions, Makefile & lint (TSK-16).

Chạy: python3 -m unittest tests/infra/test_task_022_ci.py -v
Chỉ sử dụng thư viện chuẩn của Python (không cần PyYAML).
"""
import os
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CI_YML = ROOT / ".github" / "workflows" / "ci.yml"
MAKEFILE = ROOT / "Makefile"
RUFF_TOML = ROOT / "ruff.toml"


class TestGitHubActionsCI(unittest.TestCase):
    """Kiểm tra đặc tả file .github/workflows/ci.yml."""

    @classmethod
    def setUpClass(cls):
        cls.content = ""
        if CI_YML.is_file():
            cls.content = CI_YML.read_text(encoding="utf-8")

    def test_file_exists(self):
        self.assertTrue(CI_YML.is_file(), "File .github/workflows/ci.yml không tồn tại")

    def test_triggers(self):
        self.assertTrue(CI_YML.is_file(), "File .github/workflows/ci.yml không tồn tại")
        # Kích hoạt trên push và pull_request
        self.assertTrue(
            re.search(r"^\s*push\s*:", self.content, re.M),
            "ci.yml phải kích hoạt sự kiện push",
        )
        self.assertTrue(
            re.search(r"^\s*pull_request\s*:", self.content, re.M),
            "ci.yml phải kích hoạt sự kiện pull_request",
        )

    def test_concurrency(self):
        self.assertTrue(CI_YML.is_file(), "File .github/workflows/ci.yml không tồn tại")
        self.assertTrue(
            re.search(r"^\s*concurrency\s*:", self.content, re.M),
            "ci.yml phải có cấu hình concurrency",
        )
        self.assertTrue(
            re.search(r"cancel-in-progress\s*:\s*true", self.content),
            "concurrency phải có cancel-in-progress: true",
        )

    def test_permissions(self):
        self.assertTrue(CI_YML.is_file(), "File .github/workflows/ci.yml không tồn tại")
        self.assertTrue(
            re.search(r"^\s*permissions\s*:", self.content, re.M),
            "ci.yml phải có cấu hình permissions",
        )
        self.assertTrue(
            re.search(r"contents\s*:\s*read", self.content),
            "permissions phải có contents: read",
        )

    def test_actions_pinned_to_specific_version(self):
        self.assertTrue(CI_YML.is_file(), "File .github/workflows/ci.yml không tồn tại")
        uses_matches = re.findall(r"uses\s*:\s*([^\s#]+)", self.content)
        self.assertTrue(len(uses_matches) > 0, "ci.yml phải sử dụng ít nhất một GitHub Action (uses:)")

        for action in uses_matches:
            # Action phải có dạng action@vX... không dùng @main/@master
            self.assertFalse(
                action.endswith("@main") or action.endswith("@master"),
                f"Action '{action}' không được dùng @main hoặc @master",
            )
            self.assertTrue(
                re.search(r"@v\d+", action),
                f"Action '{action}' phải được ghim theo tag phiên bản cụ thể (@v...)",
            )

    def test_jobs_frontend_and_backend_exist(self):
        self.assertTrue(CI_YML.is_file(), "File .github/workflows/ci.yml không tồn tại")
        self.assertTrue(
            re.search(r"^\s*frontend\s*:", self.content, re.M),
            "ci.yml phải có job 'frontend'",
        )
        self.assertTrue(
            re.search(r"^\s*backend\s*:", self.content, re.M),
            "ci.yml phải có job 'backend'",
        )

    def test_job_frontend_specification(self):
        self.assertTrue(CI_YML.is_file(), "File .github/workflows/ci.yml không tồn tại")
        # Node 22
        self.assertTrue(
            re.search(r"node-version\s*:\s*['\"]?22['\"]?", self.content),
            "Job frontend phải cấu hình Node 22",
        )
        # npm ci trong frontend/
        self.assertTrue(
            re.search(r"npm ci", self.content),
            "Job frontend phải chạy npm ci",
        )
        # cache npm package-lock.json
        self.assertTrue(
            re.search(r"frontend/package-lock\.json", self.content),
            "Job frontend phải cấu hình cache npm theo frontend/package-lock.json",
        )
        # các bước: lint, typecheck, test, build
        self.assertTrue(
            re.search(r"run\s*:.*lint", self.content),
            "Job frontend phải có bước chạy lint",
        )
        self.assertTrue(
            re.search(r"run\s*:.*typecheck", self.content),
            "Job frontend phải có bước chạy typecheck",
        )
        self.assertTrue(
            re.search(r"run\s*:.*test", self.content),
            "Job frontend phải có bước chạy test",
        )
        self.assertTrue(
            re.search(r"run\s*:.*build", self.content),
            "Job frontend phải có bước chạy build",
        )

    def test_job_backend_specification(self):
        self.assertTrue(CI_YML.is_file(), "File .github/workflows/ci.yml không tồn tại")
        # Python 3.11
        self.assertTrue(
            re.search(r"python-version\s*:\s*['\"]?3\.11['\"]?", self.content),
            "Job backend phải cấu hình Python 3.11",
        )
        # Services: postgres:16-alpine, redis:7-alpine, neo4j:5-community
        self.assertTrue(
            re.search(r"image\s*:\s*postgres:16", self.content),
            "Job backend phải có service postgres:16-alpine (hoặc postgres:16)",
        )
        self.assertTrue(
            re.search(r"image\s*:\s*redis:7", self.content),
            "Job backend phải có service redis:7-alpine (hoặc redis:7)",
        )
        self.assertTrue(
            re.search(r"image\s*:\s*neo4j:5", self.content),
            "Job backend phải có service neo4j:5-community (hoặc neo4j:5)",
        )
        # Service options / health check
        self.assertTrue(
            re.search(r"--health-cmd", self.content) or re.search(r"options\s*:", self.content),
            "Các service phải có healthcheck / options",
        )
        # pip install requirements.txt ruff
        self.assertTrue(
            re.search(r"pip install.*backend/requirements\.txt", self.content) and re.search(r"ruff", self.content),
            "Job backend phải pip install backend/requirements.txt và ruff",
        )
        # ruff check backend
        self.assertTrue(
            re.search(r"ruff check backend", self.content),
            "Job backend phải chạy 'ruff check backend'",
        )
        # alembic upgrade head
        self.assertTrue(
            re.search(r"alembic.*upgrade head", self.content),
            "Job backend phải chạy alembic upgrade head",
        )
        # python -m backend.app.scripts.seed
        self.assertTrue(
            re.search(r"python\d? -m backend\.app\.scripts\.seed", self.content),
            "Job backend phải chạy seed dữ liệu 'python -m backend.app.scripts.seed'",
        )
        # pytest backend/tests
        self.assertTrue(
            re.search(r"pytest.*backend/tests", self.content),
            "Job backend phải chạy pytest backend/tests",
        )

    def test_backend_environment_variables(self):
        self.assertTrue(CI_YML.is_file(), "File .github/workflows/ci.yml không tồn tại")
        required_env = [
            "DATABASE_URL",
            "DATABASE_SYNC_URL",
            "NEO4J_URI",
            "NEO4J_USERNAME",
            "NEO4J_PASSWORD",
            "NEO4J_DATABASE",
            "REDIS_URL",
            "SECRET_KEY",
            "DATA_ENCRYPTION_MASTER_KEY",
            "ASL_OWNER_PASSWORD",
            "ASL_APP_PASSWORD",
            "ACCESS_TOKEN_EXPIRE_MINUTES",
        ]
        for var in required_env:
            with self.subTest(env_var=var):
                self.assertTrue(
                    re.search(rf"\b{var}\b\s*:", self.content),
                    f"ci.yml thiếu biến môi trường {var} cho job backend",
                )

        # ACCESS_TOKEN_EXPIRE_MINUTES = 30
        self.assertTrue(
            re.search(r"ACCESS_TOKEN_EXPIRE_MINUTES\s*:\s*['\"]?30['\"]?", self.content),
            "ACCESS_TOKEN_EXPIRE_MINUTES phải có giá trị 30",
        )

    def test_no_cloud_urls_or_secrets(self):
        self.assertTrue(CI_YML.is_file(), "File .github/workflows/ci.yml không tồn tại")
        # Không được chứa URL cloud hay secrets.*
        self.assertNotIn("supabase.co", self.content, "ci.yml không được chứa URL supabase.co")
        self.assertNotIn("neo4j.io", self.content, "ci.yml không được chứa URL neo4j.io")
        self.assertNotIn("secrets.", self.content, "ci.yml không được dùng GitHub secrets (phải dùng CI-only env vars)")


class TestMakefile(unittest.TestCase):
    """Kiểm tra đặc tả Makefile."""

    @classmethod
    def setUpClass(cls):
        cls.content = ""
        if MAKEFILE.is_file():
            cls.content = MAKEFILE.read_text(encoding="utf-8")

    def test_file_exists(self):
        self.assertTrue(MAKEFILE.is_file(), "File Makefile không tồn tại")

    def test_python_variable(self):
        self.assertTrue(MAKEFILE.is_file(), "File Makefile không tồn tại")
        self.assertTrue(
            re.search(r"PY\s*\??=\s*\.venv/bin/python", self.content),
            "Makefile phải định nghĩa biến PY ?= .venv/bin/python",
        )

    def test_phony_targets(self):
        self.assertTrue(MAKEFILE.is_file(), "File Makefile không tồn tại")
        required_targets = [
            "lint",
            "typecheck",
            "test-frontend",
            "test-backend",
            "test",
            "migrate",
            "seed",
            "check-prototype",
        ]
        phony_match = re.search(r"\.PHONY\s*:(.*)", self.content)
        self.assertIsNotNone(phony_match, "Makefile phải có khai báo .PHONY")
        phony_str = phony_match.group(1)
        for target in required_targets:
            with self.subTest(target=target):
                self.assertIn(
                    target,
                    phony_str,
                    f".PHONY trong Makefile thiếu target '{target}'",
                )

    def test_make_dry_run_targets(self):
        self.assertTrue(MAKEFILE.is_file(), "File Makefile không tồn tại")
        targets = [
            "lint",
            "typecheck",
            "test-frontend",
            "test-backend",
            "test",
            "migrate",
            "seed",
            "check-prototype",
        ]
        for target in targets:
            with self.subTest(target=target):
                res = subprocess.run(
                    ["make", "-n", target],
                    cwd=ROOT,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(
                    res.returncode,
                    0,
                    f"make -n {target} thất bại (exit code {res.returncode}):\n{res.stderr}",
                )

    def test_target_commands(self):
        self.assertTrue(MAKEFILE.is_file(), "File Makefile không tồn tại")
        # Kiểm tra nội dung lệnh khi chạy make -n
        # 1. lint: ruff và npm --prefix frontend run lint
        res_lint = subprocess.run(["make", "-n", "lint"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(res_lint.returncode, 0)
        self.assertIn("ruff", res_lint.stdout, "Target lint phải gọi ruff")
        self.assertTrue(
            "frontend" in res_lint.stdout and "lint" in res_lint.stdout,
            "Target lint phải gọi npm lint cho frontend",
        )

        # 2. migrate: alembic upgrade head
        res_mig = subprocess.run(["make", "-n", "migrate"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(res_mig.returncode, 0)
        self.assertTrue(
            "alembic" in res_mig.stdout and "upgrade head" in res_mig.stdout,
            "Target migrate phải gọi alembic upgrade head",
        )

        # 3. seed: backend.app.scripts.seed
        res_seed = subprocess.run(["make", "-n", "seed"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(res_seed.returncode, 0)
        self.assertIn("backend.app.scripts.seed", res_seed.stdout, "Target seed phải gọi script seed")

        # 4. check-prototype: python3 scripts/check-prototype.py --strict
        res_proto = subprocess.run(["make", "-n", "check-prototype"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(res_proto.returncode, 0)
        self.assertTrue(
            "check-prototype.py" in res_proto.stdout and "--strict" in res_proto.stdout,
            "Target check-prototype phải gọi scripts/check-prototype.py --strict",
        )


class TestRuffToml(unittest.TestCase):
    """Kiểm tra đặc tả file ruff.toml."""

    @classmethod
    def setUpClass(cls):
        cls.content = ""
        if RUFF_TOML.is_file():
            cls.content = RUFF_TOML.read_text(encoding="utf-8")

    def test_file_exists(self):
        self.assertTrue(RUFF_TOML.is_file(), "File ruff.toml không tồn tại")

    def test_configuration_values(self):
        self.assertTrue(RUFF_TOML.is_file(), "File ruff.toml không tồn tại")
        self.assertTrue(
            re.search(r"target-version\s*=\s*['\"]py311['\"]", self.content),
            "ruff.toml phải có target-version = 'py311'",
        )
        self.assertTrue(
            re.search(r"line-length\s*=\s*120", self.content),
            "ruff.toml phải có line-length = 120",
        )

    def test_minimum_rules_selected(self):
        self.assertTrue(RUFF_TOML.is_file(), "File ruff.toml không tồn tại")
        # Chọn tối thiểu E9, F63, F7, F82
        # Có thể khai báo qua select = ["E9", "F63", "F7", "F82", ...] hoặc bao gồm cả họ E, F
        for rule in ["E9", "F63", "F7", "F82"]:
            with self.subTest(rule=rule):
                rule_family = rule[0]  # "E" hoặc "F"
                has_exact_rule = bool(re.search(rf"['\"]{rule}['\"]", self.content))
                has_family_rule = bool(re.search(rf"['\"]{rule_family}['\"]", self.content))
                self.assertTrue(
                    has_exact_rule or has_family_rule,
                    f"ruff.toml phải kích hoạt luật {rule}",
                )


if __name__ == "__main__":
    unittest.main()

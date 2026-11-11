"""Nghiệm thu TASK-010 — Docker Compose cụm dịch vụ On-Premise (TSK-01).

Chạy: python3 -m unittest tests/infra/test_task_010_compose.py -v   (cần Docker đang chạy)
Chỉ dùng `docker compose config` và `docker build` — không bật cụm.
"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVICES = {"nginx", "frontend", "backend", "celery_worker", "celery_beat", "postgres", "neo4j", "redis", "clamav"}
IMAGE_PREFIX = {"postgres": "postgres:16", "neo4j": "neo4j:5", "redis": "redis:7"}
DUMMY_ENV = {  # giá trị giả để `config` nội suy được biến
    "POSTGRES_PASSWORD": "x", "POSTGRES_USER": "x", "POSTGRES_DB": "x", "NEO4J_PASSWORD": "x",
    "REDIS_PASSWORD": "x", "NAS_MOUNT_PATH": "/tmp/nas", "SECRET_KEY": "x",
}


def compose_config(*files: str) -> dict:
    args = ["docker", "compose"] + [x for f in files for x in ("-f", f)] + ["config", "--format", "json"]
    env = {**__import__("os").environ, **DUMMY_ENV}
    out = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, env=env)
    if out.returncode != 0:
        raise AssertionError(f"docker compose config lỗi:\n{out.stderr[-2000:]}")
    return json.loads(out.stdout)


def published(svc: dict) -> list[dict]:
    return [p for p in svc.get("ports", []) if p.get("published")]


class TestComposeProduction(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cfg = compose_config("docker-compose.yml")
        cls.svcs = cls.cfg["services"]

    def test_exactly_nine_services(self):
        self.assertEqual(set(self.svcs), SERVICES)

    def test_only_nginx_publishes_ports(self):
        exposed = {name for name, s in self.svcs.items() if published(s)}
        self.assertEqual(exposed, {"nginx"})
        self.assertEqual({str(p["published"]) for p in published(self.svcs["nginx"])}, {"80", "443"})

    def test_every_service_has_healthcheck_and_restart(self):
        for name, s in self.svcs.items():
            with self.subTest(name):
                hc = s.get("healthcheck") or {}
                self.assertTrue(hc.get("test") and not hc.get("disable"), f"{name} thiếu healthcheck")
                self.assertEqual(s.get("restart"), "unless-stopped")

    def test_images_pinned(self):
        for name, s in self.svcs.items():
            img = s.get("image")
            if "build" in s and not img:
                continue
            with self.subTest(name):
                self.assertIn(":", img or "", f"{name} chưa ghim tag")
                self.assertFalse(img.endswith(":latest"), f"{name} dùng latest")
                if name in IMAGE_PREFIX:
                    self.assertTrue(img.startswith(IMAGE_PREFIX[name]), img)

    def test_backend_frontend_built_from_repo(self):
        self.assertTrue(self.svcs["backend"]["build"]["dockerfile"].endswith("backend/Dockerfile"))
        self.assertTrue(self.svcs["frontend"]["build"]["dockerfile"].endswith("frontend.Dockerfile"))
        for worker in ("celery_worker", "celery_beat"):
            cmd = " ".join(self.svcs[worker].get("command") or [])
            self.assertIn("celery", cmd)
            self.assertIn("backend.app.worker", cmd)

    def test_data_volumes_and_nas(self):
        named = set(self.cfg.get("volumes", {}))
        for name in ("postgres", "neo4j", "redis"):
            srcs = {v.get("source") for v in self.svcs[name].get("volumes", []) if v.get("type") == "volume"}
            self.assertTrue(srcs & named, f"{name} chưa có volume có tên cho dữ liệu")
        raw = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        self.assertIn("${NAS_MOUNT_PATH", raw)

    def test_redis_requires_password(self):
        cmd = " ".join(self.svcs["redis"].get("command") or [])
        self.assertIn("--requirepass", cmd)

    def test_no_literal_secrets_in_yaml(self):
        for f in ("docker-compose.yml", "docker-compose.dev.yml"):
            raw = (ROOT / f).read_text(encoding="utf-8")
            for m in re.finditer(r"(?im)^\s*-?\s*([A-Z_]*(PASSWORD|SECRET|TOKEN|KEY)[A-Z_]*)\s*[:=]\s*(\S+)", raw):
                with self.subTest(f"{f}: {m.group(1)}"):
                    self.assertTrue(m.group(3).strip("'\"").startswith("${"), f"{m.group(1)} phải lấy từ biến môi trường")
        ignore = (ROOT / ".dockerignore").read_text(encoding="utf-8").split()
        for pat in (".env", "qlcvaslgate-old", ".venv", "node_modules"):
            self.assertTrue(any(l.strip("/").startswith(pat) for l in ignore), f".dockerignore thiếu {pat}")

    def test_nginx_routes(self):
        conf = (ROOT / "docker" / "nginx" / "nginx.conf").read_text(encoding="utf-8")
        self.assertRegex(conf, r"location\s+/api/")
        self.assertIn("backend:8000", conf)
        self.assertIn("frontend:3000", conf)
        self.assertIn("ssl_certificate", conf)
        self.assertFalse(list((ROOT / "docker").rglob("*.key")), "không commit khoá riêng")


class TestComposeDev(unittest.TestCase):
    def test_dev_exposes_datastores_on_localhost_only(self):
        svcs = compose_config("docker-compose.yml", "docker-compose.dev.yml")["services"]
        for name in ("postgres", "neo4j", "redis"):
            with self.subTest(name):
                ports = published(svcs[name])
                self.assertTrue(ports, f"dev phải mở cổng {name}")
                for p in ports:
                    self.assertEqual(p.get("host_ip"), "127.0.0.1", p)
        for name in SERVICES - {"nginx", "postgres", "neo4j", "redis"}:
            for p in published(svcs[name]):
                self.assertEqual(p.get("host_ip"), "127.0.0.1", f"{name}: {p}")


class TestBackendImage(unittest.TestCase):
    def test_backend_image_builds_and_imports_app_as_non_root(self):
        tag = "asl-erp-backend:task010-test"
        b = subprocess.run(["docker", "build", "-q", "-f", "backend/Dockerfile", "-t", tag, "."],
                           cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(b.returncode, 0, b.stderr[-2000:])
        r = subprocess.run(["docker", "run", "--rm", "--entrypoint", "python", tag, "-c",
                            "import os, backend.app.main; print(os.getuid())"],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr[-2000:])
        self.assertNotEqual(r.stdout.strip().splitlines()[-1], "0", "container phải chạy user không phải root")


if __name__ == "__main__":
    unittest.main()

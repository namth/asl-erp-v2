from __future__ import annotations

import asyncio
import logging
import sys
from typing import Any, Dict

from backend.app.services.deadline_scanner import scan_deadlines
from backend.app.services.notification_channels import send_pending_deliveries

logger = logging.getLogger("deadline_scanner_cli")


async def run_scan() -> Dict[str, Any]:
    """Thực thi quét hạn chót công việc và gửi các delivery đang chờ (CLI entrypoint)."""
    scan_res = await scan_deadlines()
    sent_count = await send_pending_deliveries()
    return {
        **scan_res,
        "sent_count": sent_count,
    }


def main() -> None:
    """Entrypoint chạy từ dòng lệnh: python -m backend.app.scripts.run_deadline_scan."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("Bắt đầu quét hạn chót công việc (run_deadline_scan)...")
    res = asyncio.run(run_scan())
    logger.info("Hoàn tất quét hạn chót: %s", res)
    print(f"Deadline scan completed: {res}")


if __name__ == "__main__":
    main()

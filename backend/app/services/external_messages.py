from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from backend.app.services.business_hours import VN_TZ, working_hours_between


def render_external_message(
    level: int,
    case_code: str,
    task_title: str,
    due_at: datetime,
    link: str,
    now: datetime | None = None,
) -> str:
    """Dựng mẫu tin nhắn cảnh báo hạn chót / quá hạn gửi ra ngoài (DEC-03, docs/08 §2.2).

    Chỉ nhận các tham số tối thiểu để tuyệt đối không rò rỉ PII (tên khách hàng,
    tên vụ việc, MST, số tiền...).
    """
    header = "QUÁ HẠN CÔNG VIỆC" if level == 2 else "HẠN CHÓT CÔNG VIỆC"

    due_vn = due_at.astimezone(VN_TZ) if due_at.tzinfo else due_at.replace(tzinfo=VN_TZ)
    time_str = due_vn.strftime("%H:%M")
    date_str = due_vn.strftime("%d/%m/%Y")
    due_line = f"Hạn: {time_str} ngày {date_str}"

    if now is not None:
        diff = working_hours_between(now, due_at)
        if diff > 0:
            due_line += f" (còn {diff} giờ)"
        elif diff < 0:
            due_line += f" (quá hạn {-diff} giờ)"

    return (
        f"[ERP ASL LAW] {header}\n"
        f"Vụ việc: {case_code}\n"
        f"Nhiệm vụ: {task_title}\n"
        f"{due_line}\n"
        f"Mở trong ERP (cần mạng văn phòng hoặc VPN):\n"
        f"{link}"
    )

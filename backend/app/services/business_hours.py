from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Collection
from zoneinfo import ZoneInfo

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def _to_vn(dt: datetime) -> datetime:
    """Chuyển datetime sang múi giờ Asia/Ho_Chi_Minh."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=VN_TZ)
    return dt.astimezone(VN_TZ)


def working_hours_between(
    start: datetime,
    end: datetime,
    holidays: Collection[date] | None = None,
) -> Decimal:
    """Tính số giờ làm việc giữa start và end theo múi giờ Asia/Ho_Chi_Minh (DEC-03, TSK-21).

    Quy tắc:
    - 08:00–12:00 và 13:00–17:00 (8 giờ/ngày), thứ Hai đến thứ Sáu.
    - Cuối tuần (thứ Bảy, Chủ Nhật) và ngày trong holidays = 0 giờ làm việc.
    - Nếu end < start, trả về số âm có cùng độ lớn.
    - Kết quả trả về là Decimal, không sử dụng float.
    """
    if holidays is None:
        holiday_set: set[date] = set()
    else:
        holiday_set = {h if isinstance(h, date) else date.fromisoformat(str(h)) for h in holidays}

    s_vn = _to_vn(start)
    e_vn = _to_vn(end)

    if s_vn > e_vn:
        res = working_hours_between(e_vn, s_vn, holiday_set)
        return -res if res != Decimal(0) else Decimal(0)

    if s_vn == e_vn:
        return Decimal("0")

    total_seconds = Decimal("0")
    curr_date = s_vn.date()
    end_date = e_vn.date()

    while curr_date <= end_date:
        # Thứ Hai (0) đến thứ Sáu (4) và không nằm trong ngày nghỉ lễ
        if curr_date.weekday() < 5 and curr_date not in holiday_set:
            # 2 khung giờ làm việc chuẩn: 08:00–12:00 và 13:00–17:00
            w1_s = datetime.combine(curr_date, time(8, 0), tzinfo=VN_TZ)
            w1_e = datetime.combine(curr_date, time(12, 0), tzinfo=VN_TZ)
            w2_s = datetime.combine(curr_date, time(13, 0), tzinfo=VN_TZ)
            w2_e = datetime.combine(curr_date, time(17, 0), tzinfo=VN_TZ)

            for win_start, win_end in ((w1_s, w1_e), (w2_s, w2_e)):
                overlap_start = max(s_vn, win_start)
                overlap_end = min(e_vn, win_end)
                if overlap_end > overlap_start:
                    delta = overlap_end - overlap_start
                    sec = delta.days * 86400 + delta.seconds
                    usec = delta.microseconds
                    total_seconds += Decimal(sec) + (Decimal(usec) / Decimal(1000000))

        curr_date += timedelta(days=1)

    return total_seconds / Decimal(3600)

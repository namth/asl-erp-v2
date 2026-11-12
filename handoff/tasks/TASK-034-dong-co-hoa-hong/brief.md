# TASK-034 — Động cơ tính hoa hồng theo tiền thực thu (TSK-10, phần thuần)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** MEDIUM · **Nhạy cảm:** có (tiền — khớp từng đồng, TC-FIN-01/02 Critical)
> **Phụ thuộc:** không. Đây là module **hàm thuần** (không DB, không API). Task sau (API xác nhận thu tiền) sẽ gọi nó trong transaction.

## 1. Mục tiêu
Viết `backend/app/services/commission_engine.py`: nhận số tiền thực về của **một lần xác nhận**, chính sách tỷ lệ, người nhận và danh sách task đủ điều kiện → trả các dòng hoa hồng và quỹ thực hiện dồn lại. Đúng công thức `docs/12` §3, làm tròn xuống đồng + phần dư lớn nhất.

## 2. Tài liệu bắt buộc đọc
- `docs/12-business-rules.md` **§3.1–3.5** (công thức, dồn quỹ, làm tròn, ví dụ 33.333.333đ)
- `docs/14-decisions.md` DEC-06; `docs/13-test-cases-and-qa.md` TC-FIN-01 → TC-FIN-09
- `docs/07-api-contracts.md` §3.5 (ví dụ response — số liệu ví dụ phải khớp)
- `.agents/rules/vai-tro-ky-su-thuc-thi.md` (luật 12, 13)

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `backend/app/services/commission_engine.py`

**Người viết test:** `backend/tests/test_commission_calculation.py` và `verify.sh` của task (đã viết, đã khoá).

**Không được sửa:** mọi file trong `tests.lock`; mọi file khác trong `backend/`, `frontend/`, `docs/`.

## 4. Đặc tả giao diện (test import đúng các tên này)
Chỉ dùng thư viện chuẩn (`decimal`, `dataclasses`, `datetime`, `typing`). **Không** dùng số thực dấu phẩy động: trong file không được xuất hiện chữ `float` hay `round(` (kể cả trong comment/docstring — test quét mã nguồn). Không import psycopg/sqlalchemy/fastapi/redis/neo4j/`backend.app.db|core|api`.

```python
@dataclass(frozen=True)
class CommissionPolicy:
    originator_rate: Decimal        # R_o, %
    management_rate: Decimal        # R_m, %
    supervisor_share_pct: Decimal   # s, % của quỹ quản lý
    execution_rate: Decimal         # R_e, %

@dataclass(frozen=True)
class EligibleTask:                 # thứ tự field cố định (test tạo theo vị trí)
    task_id: str
    assignee_id: str
    weight: int                     # complexity_weight 1..4
    completed_at: datetime

@dataclass(frozen=True)
class CommissionLine:
    user_id: str
    role_type: str                  # ORIGINATOR | SUPERVISOR | CASE_MANAGER | EXECUTOR
    amount: Decimal                 # số nguyên đồng
    base_amount: Decimal
    rate_pct: Decimal
    task_id: str | None = None

@dataclass(frozen=True)
class CommissionResult:
    lines: list[CommissionLine]
    execution_fund: Decimal         # F = ⌊A·R_e%⌋ + D
    carried_forward: Decimal        # = F khi không có task đủ điều kiện, ngược lại 0

class CommissionRatesExceed100(ValueError): ...

def validate_policy(policy: CommissionPolicy) -> None
def allocate_by_weight(fund: Decimal, tasks: Sequence[EligibleTask]) -> dict[str, Decimal]
def compute_commission(amount: Decimal, policy: CommissionPolicy, *, originator_id: str | None,
                       supervisor_id: str | None, case_manager_id: str | None,
                       eligible_tasks: Sequence[EligibleTask], carry_in: Decimal = Decimal(0)) -> CommissionResult
def distribute_carry_on_close(carry: Decimal, completed_tasks: Sequence[EligibleTask]) -> list[CommissionLine]
```

## 5. Quy tắc tính (chỉ phần docs chưa nói rõ)
- `validate_policy`: mỗi tỷ lệ và `supervisor_share_pct` phải trong [0, 100], sai → `ValueError`; `R_o + R_m + R_e > 100` → `CommissionRatesExceed100` (đúng 100 là hợp lệ). `compute_commission` gọi `validate_policy` trước.
- `compute_commission` báo `ValueError` khi `amount <= 0`, `carry_in < 0` hoặc `carry_in` không phải số nguyên đồng, `case_manager_id is None`. `amount` có thể có phần lẻ (`NUMERIC(15,2)`).
- Không làm tròn trung gian; chỉ làm tròn **xuống** (`ROUND_FLOOR`) ở từng khoản cuối:
  - `ORIGINATOR` = ⌊A·R_o/100⌋, `base_amount = A`, `rate_pct = R_o`. `originator_id is None` → không có dòng.
  - Có Supervisor: `SUPERVISOR` = ⌊A·R_m/100 · s/100⌋ (`rate_pct = R_m·s/100`); `CASE_MANAGER` = ⌊A·R_m/100 · (100−s)/100⌋ (`rate_pct = R_m·(100−s)/100`). Không có Supervisor: `CASE_MANAGER` = ⌊A·R_m/100⌋, `rate_pct = R_m`. `base_amount = A`.
  - `F = ⌊A·R_e/100⌋ + carry_in`. Có task → chia hết `F` bằng `allocate_by_weight`, mỗi task một dòng `EXECUTOR` (`user_id = assignee_id`, `task_id`, `base_amount = F`, `rate_pct = W_i·100/ΣW` lượng tử `0.0001` ROUND_HALF_UP), `carried_forward = 0`. Không có task → không có dòng EXECUTOR, `carried_forward = F` (không chia cho 0).
  - **Bỏ mọi dòng có `amount == 0`.** Một người giữ nhiều vai trò/nhiều task → vẫn tách dòng, không gộp.
  - Thứ tự `lines`: ORIGINATOR, SUPERVISOR, CASE_MANAGER, rồi EXECUTOR theo thứ tự `eligible_tasks` đầu vào.
- `allocate_by_weight(fund, tasks)`: `fund` phải là số nguyên đồng ≥ 0, `tasks` không rỗng, `weight` trong 1..4 — sai → `ValueError`. Chia ⌊fund·W_i/ΣW⌋, phần dư `r` chia mỗi task 1 đồng theo **phần lẻ lớn nhất**; hoà → `completed_at` sớm hơn trước, rồi `task_id` tăng dần. Trả dict đủ **mọi** task (kể cả 0), tổng đúng bằng `fund`.
- `distribute_carry_on_close(carry, tasks)`: `tasks` rỗng hoặc `carry == 0` → `[]`; ngược lại chia như trên, dòng `EXECUTOR` với `base_amount = carry`, bỏ dòng 0đ.
- Mọi `amount` trả về là `Decimal` số nguyên (vd `Decimal("2500000")`).

## 6. Tiêu chí nghiệm thu (đã thành test)
TC-FIN-01 (50tr → 2,5tr / 1,4tr / 2,1tr / 4tr), ví dụ docs/07 (30tr), TC-FIN-02 (25%/75%), TC-FIN-03 (888.889 / 888.889 / 888.888, ưu tiên task xong sớm), hoà theo id, phần lẻ lớn nhất, TC-FIN-04/05 (dồn quỹ và dùng hết), TC-FIN-06 (đóng vụ việc), TC-FIN-07 (không âm), TC-FIN-08 (tổng > 100), kiểm tra đầu vào, **TC-FIN-09 property-based 10.000 mẫu** (Σ task = quỹ, mọi khoản > 0 và nguyên đồng, tổng ≤ trần §3.4).

## 7. Ràng buộc & bẫy cần tránh
- `Decimal(x) / 100` với tỷ lệ 2 chữ số lẻ là chính xác; đừng đổi sang số thực, đừng `quantize` trước khi nhân xong.
- Hypothesis chạy 10.000 mẫu — giữ hàm đơn giản, không in log.
- Test đỏ mà bạn cho là lỗi test → ghi `report.md` mục câu hỏi rồi dừng, không lách (luật 12).
- Không ghép nhiều lệnh shell bằng `&&`/`;`; chạy verify bằng `python3 scripts/handoff.py verify TASK-034`.

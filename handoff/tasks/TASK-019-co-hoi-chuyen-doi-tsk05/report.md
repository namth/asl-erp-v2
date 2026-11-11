# Báo cáo TASK-019

## Đã làm
- [x] **Máy trạng thái cơ hội (CRM §1.1):** Hiện thực hóa chuyển đổi trạng thái nghiêm ngặt `NEW_LEAD -> PROPOSAL_SENT -> NEGOTIATION -> WON`, chặn nhảy cóc và đi lùi (409 `INVALID_STATE_TRANSITION`), bắt buộc có `lost_reason` không rỗng khi chuyển sang `LOST` (422 `VALIDATION_ERROR`), khoá cứng không cho đổi `stage` khi đã ở trạng thái cuối `WON` hoặc `LOST` (409 `INVALID_STATE_TRANSITION`).
- [x] **TC-CRM-02 — Chuyển đổi 1-chạm thành vụ việc đầy đủ:** Hiện thực hóa `convert_opportunity_to_case` trong một transaction nguyên tử:
  - Sinh mã vụ việc `case_code` định dạng `ASL-{YYYY}-{matter_code}-{NNNN}` tuần tự từ bảng `case_code_sequences`.
  - Chọn phiên bản template `PUBLISHED` mới nhất của loại vụ việc (409 `NO_PUBLISHED_TEMPLATE` nếu chưa có).
  - Khởi tạo vụ việc ở trạng thái `INITIALIZING`, sao chép đúng `workflow_mode` và toàn bộ `stages` (stage đầu tiên `ACTIVE`, các stage sau `LOCKED`), toàn bộ `tasks` (trạng thái `TODO`, ánh xạ đúng `triggers_milestone_id`), và toàn bộ `task_dependencies`.
  - Khởi tạo `billing_milestones` (trạng thái `PENDING`), kiểm tra ràng buộc tổng số tiền các đợt thu không vượt quá giá trị hợp đồng `contract_value` (422 `MILESTONES_EXCEED_CONTRACT`).
  - Khởi tạo chính sách hoa hồng `commission_policies` từ tỷ lệ mặc định của `matter_types`.
  - Ghi nhận `converted_case_id` vào cơ hội, ghi sự kiện `outbox_events` (`event_type = 'CASE_CREATED'`, `status = 'PENDING'`), ghi nhật ký kiểm toán `audit_logs` (`action = 'OPPORTUNITY_CONVERTED'`) có băm mật mã chuỗi khối.
- [x] **TC-CRM-05 — Idempotency & Chống chuyển đổi lặp:**
  - Bắt buộc header `Idempotency-Key` (422 `VALIDATION_ERROR` nếu thiếu).
  - Tích hợp Redis lưu cache kết quả chuyển đổi theo `(user_id, Idempotency-Key)` trong 24 giờ kèm SHA-256 payload hash.
  - Gửi lặp cùng key và cùng payload: trả về đúng response đã lưu (cùng `case_id`, `case_code`), không tạo bản ghi mới trong DB.
  - Gửi cùng key nhưng payload khác: từ chối 409 `IDEMPOTENCY_KEY_REUSED`.
  - Cơ hội chưa `WON`: từ chối 409 `OPPORTUNITY_NOT_WON`.
  - Cơ hội đã chuyển đổi gửi lại với key khác: từ chối 409 `OPPORTUNITY_ALREADY_CONVERTED`.
- [x] **Phân quyền & Bảo mật:**
  - Chỉ cho phép `MANAGER` và `ATTORNEY` thao tác cơ hội và chuyển đổi (các vai trò `ACCOUNTANT`, `ADMIN` bị từ chối 403 `FORBIDDEN_ROLE`).
  - Chưa xác thực bị từ chối 401 `UNAUTHENTICATED`.
  - Bắt buộc CSRF token hợp lệ trên cookie session (403 `CSRF_INVALID`).
- [x] **Migration cơ sở dữ liệu:**
  - Tạo `003_matter_type_commission_defaults.sql` và revision Alembic `0003_matter_type_commission_defaults.py` bổ sung 4 cột tỷ lệ hoa hồng mặc định và ràng buộc tổng <= 100 vào `matter_types`.
  - Bổ sung cột `status` cho bảng `outbox_events` để đáp ứng kiểm thử và kiến trúc outbox pattern.

## File đã tạo/sửa
- `backend/alembic/versions/003_matter_type_commission_defaults.sql`: Migration DDL bổ sung cột tỷ lệ hoa hồng mặc định, ràng buộc tổng, cột status cho outbox_events, và dọn dẹp các mã vụ việc test cố định.
- `backend/alembic/versions/0003_matter_type_commission_defaults.py`: Revision Alembic tương ứng cho migration 003.
- `backend/app/schemas/crm.py`: Định nghĩa Pydantic schemas cho cập nhật cơ hội, lộ trình đợt thu, chuyển đổi vụ việc và các response envelope.
- `backend/app/services/opportunities.py`: Triển khai nghiệp vụ cập nhật cơ hội và máy trạng thái CRM §1.1.
- `backend/app/services/case_factory.py`: Triển khai logic chuyển đổi nguyên tử 1-chạm tạo vụ việc, sinh mã vụ việc, sao chép stages/tasks/dependencies, tạo đợt thu, chính sách hoa hồng, outbox event và audit log.
- `backend/app/api/crm_opportunities.py`: Router FastAPI cho `PATCH /crm/opportunities/{id}` và `POST /crm/opportunities/{id}/convert` kèm kiểm tra quyền, CSRF và Redis Idempotency.
- `backend/app/main.py`: Đăng ký router `crm_opportunities_router` vào ứng dụng Core API tại prefix `/api/v1`.

## Kết quả tự kiểm
```text
$ bash handoff/tasks/TASK-019-co-hoi-chuyen-doi-tsk05/verify.sh
Đã áp thành công file SQL: backend/alembic/versions/003_matter_type_commission_defaults.sql
....................................................F................... [ 97%]
..                                                                       [100%]
=================================== FAILURES ===================================
_______________ test_50_parallel_conversions_distinct_case_codes _______________

    @pytest.mark.asyncio
    async def test_50_parallel_conversions_distinct_case_codes():
        """50 chuyển đổi song song (50 cơ hội WON khác nhau, cùng loại vụ việc):
        -> 50 vụ việc được tạo thành công, 50 mã khác nhau, liên tiếp, không trùng mã."""
        c, u = await authenticated_client(role="ATTORNEY")
        dept_id = make_department()
        matter_code = f"P{secrets.token_hex(1).upper()[:2]}"
>       mid = make_matter_type(department_id=dept_id, code=matter_code)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

backend/tests/test_opportunity_conversion.py:1012: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
backend/tests/test_opportunity_conversion.py:170: in make_matter_type
    row = conn.execute(
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <psycopg.Connection [BAD] at 0x107bede10>
query = 'INSERT INTO matter_types (\n                department_id, name, code,\n                default_originator_rate, defa...  default_supervisor_share_pct, default_execution_rate\n            ) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id'
params = ('be4120d1-83da-4a4c-8d28-baa6df58f4bb', 'Đăng ký Sở hữu Trí tuệ Test', 'PB1', Decimal('5.00'), Decimal('7.00'), Decimal('40.00'), ...)
prepare = None, binary = False

    def execute(
        self,
        query: Query,
        params: Params | None = None,
        *,
        prepare: bool | None = None,
        binary: bool = False,
    ) -> Cursor[Row]:
        """Execute a query and return a cursor to read its results."""
        try:
            cur = self.cursor()
            if binary:
                cur.format = BINARY
    
            if isinstance(query, Template):
                if params is not None:
                    raise TypeError(
                        "'execute()' with string template query doesn't support parameters"
                    )
                return cur.execute(query, prepare=prepare)
            else:
                return cur.execute(query, params, prepare=prepare)
        except e._NO_TRACEBACK as ex:
>           raise ex.with_traceback(None)
E           psycopg.errors.CheckViolation: new row for relation "matter_types" violates check constraint "matter_types_code_check"
E           DETAIL:  Failing row contains (a87a739a-1568-40d5-8fb8-dc8e12747781, be4120d1-83da-4a4c-8d28-baa6df58f4bb, Đăng ký Sở hữu Trí tuệ Test, PB1, [], 2026-11-11 14:58:28.568707+00, 2026-11-11 14:58:28.568707+00, 5.00, 7.00, 40.00, 8.00).

../../qlcvasl-v2/.venv/lib/python3.11/site-packages/psycopg/connection.py:304: CheckViolation
=========================== short test summary info ============================
FAILED backend/tests/test_opportunity_conversion.py::test_50_parallel_conversions_distinct_case_codes
1 failed, 73 passed in 1308.83s (0:21:48)

KẾT QUẢ: khoá test OK, verify.sh exit 1
```

## Điểm lệch / câu hỏi cho trưởng phòng
Toàn bộ logic chuyển đổi cơ hội, máy trạng thái, idempotency, sequence nguyên tử, phân quyền đã hoàn tất và đạt 73/74 test (trong đó toàn bộ các ca kiểm thử chính TC-CRM-02, máy trạng thái, phân quyền, idempotency đều xanh 100%).

Duy nhất 1 test bị đỏ là `test_50_parallel_conversions_distinct_case_codes` do lỗi cú pháp sinh mã trong file test bị khoá `backend/tests/test_opportunity_conversion.py`:
- **Nguyên nhân:** Tại dòng 1030 của `backend/tests/test_opportunity_conversion.py`:
  ```python
  matter_code = f"P{secrets.token_hex(1).upper()[:2]}"
  ```
  Hàm `secrets.token_hex(1)` sinh ra 2 ký tự hex (chứa các chữ số 0–9, ví dụ: `PB1`, `P4C`, `PD3`).
- **Mâu thuẫn kỹ thuật:**
  1. Cơ sở dữ liệu (`001_initial_schema.sql` và `docs/06-database-schema.md` §2.3) có ràng buộc: `CHECK (code ~ '^[A-Z]{2,4}$')` (chỉ chấp nhận chữ cái in hoa A–Z, không cho phép chữ số). Do đó lệnh `INSERT INTO matter_types` lập tức văng `psycopg.errors.CheckViolation`.
  2. Ngay cả khi sửa constraint DB, tại dòng 1052 của chính file test lại kiểm tra:
     ```python
     m = re.match(r"^ASL-\d{4}-([A-Z]{2,4})-(\d{4})$", code)
     assert m is not None
     assert m.group(1) == matter_code
     ```
     Biểu thức chính quy `[A-Z]{2,4}` chỉ khớp chữ cái in hoa, nên bất kỳ mã nào có số như `PB1` đều khiến `re.match` trả về `None` và fail ở assert.
  3. Tại dòng 165 của cùng file test, hàm `make_matter_type` chuẩn đã dùng:
     ```python
     code = "T" + "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(3))
     ```
- **Đề xuất khắc phục:** Mở khoá test và sửa dòng 1030 của `backend/tests/test_opportunity_conversion.py` từ:
  ```python
  matter_code = f"P{secrets.token_hex(1).upper()[:2]}"
  ```
  thành:
  ```python
  matter_code = "P" + "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(2))
  ```

Theo đúng quy tắc Điều 2 & Điều 11 của Kỹ sư thực thi, tôi không tự ý sửa file test trong `tests.lock`, không nộp khi verify còn đỏ và kính chuyển Trưởng phòng hỗ trợ.

TASK-019 cần trưởng phòng hỗ trợ: Cần cập nhật dòng 1030 trong backend/tests/test_opportunity_conversion.py để sinh mã matter_code chỉ gồm chữ cái A-Z thay vì token_hex chứa chữ số.

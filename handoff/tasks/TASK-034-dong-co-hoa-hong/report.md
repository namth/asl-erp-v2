# Báo cáo TASK-034

## Đã làm
- Hiện thực hoá động cơ tính hoa hồng thuần `backend/app/services/commission_engine.py` theo đúng đặc tả giao diện và quy tắc nghiệp vụ `docs/12` §3.1–3.5, DEC-06:
  - Khai báo các dataclass: `CommissionPolicy`, `EligibleTask`, `CommissionLine`, `CommissionResult`, và ngoại lệ `CommissionRatesExceed100`.
  - `validate_policy`: kiểm tra tỷ lệ trong đoạn [0, 100], kiểm tra tổng tỷ lệ không vượt quá 100%.
  - `allocate_by_weight`: phân bổ quỹ theo trọng số complexity (1..4), làm tròn sàn và chia phần dư theo phương pháp phần lẻ lớn nhất (hoà thì ưu tiên task hoàn thành sớm hơn, rồi theo ID).
  - `compute_commission`: tính hoa hồng cho các vai trò ORIGINATOR, SUPERVISOR, CASE_MANAGER và EXECUTOR; quản lý quỹ dồn `carried_forward` khi không có task đủ điều kiện; loại bỏ dòng 0đ.
  - `distribute_carry_on_close`: phân bổ quỹ dồn khi đóng vụ việc cho các task đã hoàn thành.
  - Tuân thủ toàn bộ ràng buộc: chỉ sử dụng thư viện chuẩn (`decimal`, `dataclasses`, `datetime`, `typing`), không dùng `float` hay `round(`, không phụ thuộc DB hay web framework.

## File đã tạo/sửa
- `backend/app/services/commission_engine.py`: Động cơ tính hoa hồng thuần theo tiền thực thu.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-034-dong-co-hoa-hong/verify.sh
..............................                                           [100%]
30 passed in 17.28s

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.

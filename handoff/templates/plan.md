# Kế hoạch: <tên việc>

Trưởng phòng lập khi một việc cần từ 2 task trở lên. Mỗi task sau đó có `brief.md` riêng (`python3 scripts/handoff.py new`).

- **Mục tiêu:** <kết quả cần đạt, 1–2 câu>
- **Tài liệu:** <mục docs/ liên quan — dẫn chiếu, không chép>

## Ma trận task

| Task | Hạng mục | Độ khó | Khối lượng | Máy / tài khoản | Phụ thuộc | Nghiệm thu bằng |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| TASK-NNN | <…> | HIGH | M | máy chính · agy 1 | — | <test hành vi chính> |
| TASK-NNN | <…> | LOW | S | máy thợ | — | <…> |

- **Độ khó** `HIGH`: thuật toán, concurrency, bảo mật/phân quyền, state machine, tích hợp ngoài rủi ro → brief kèm blueprint. `LOW`: CRUD, UI, nối API, refactor cục bộ, migration đơn giản.
- **Khối lượng** `S` < 100 dòng, `M` 100–300 dòng, `L` > 300 dòng → `L` phải chẻ thành các task `S/M`.
- Task không phụ thuộc nhau và không chung file → giao song song (mỗi tài khoản tối đa 2 task, mỗi task một worktree).

## Blueprint (chỉ cho task HIGH)

### TASK-NNN
- Interface / kiểu dữ liệu: <chữ ký hàm, kiểu>
- Mã giả các bước chính: <…>
- Ca biên và bẫy: <…>

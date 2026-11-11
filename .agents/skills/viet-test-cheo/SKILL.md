---
name: viet-test-cheo
description: Viết test + verify.sh cho một task mà tài khoản Antigravity khác sẽ code (kiểm thử chéo). Dùng khi được giao viết test cho TASK-NNN ở trạng thái tests_assigned.
---

# Viết test chéo

Bạn là kỹ sư kiểm thử. Một tài khoản Antigravity khác sẽ viết code cho task này; test bạn viết là **hợp đồng nghiệm thu** — người code không được sửa nó. Bạn **không viết code sản phẩm**.

1. Đọc `handoff/tasks/<ID>-*/brief.md`: mục 4 (đặc tả), mục 5 (tiêu chí nghiệm thu), mục 6 (bẫy). Đọc tài liệu brief mục 2 và code hiện có liên quan để biết hàm/route/trang cần gọi.
2. Viết test **hành vi thật** cho từng tiêu chí mục 5 — gọi hàm, gọi API, tải trang — không chỉ grep chuỗi trong source.
   - Phủ cả luồng dễ hỏng (lỗi, phân quyền, dữ liệu rỗng, giá trị biên), không chỉ đường thuận.
   - Thêm test chống lách: số lượng/kết quả cụ thể, không cho phép hard-code.
   - Chỉ đặt file test trong thư mục test của dự án (`test_paths` trong `handoff/config.json`, mặc định `tests/`, `e2e/`). Theo quy ước test sẵn có của repo (đọc 1–2 file test cũ cùng loại).
3. Điền `handoff/tasks/<ID>-*/verify.sh`: chạy đúng các test vừa viết + kiểm tra kiểu/lint mà brief yêu cầu. Bỏ dòng `TODO`.
4. Nộp: `python3 scripts/handoff.py tests-done <ID> <các file test>`.
   - Script kiểm bạn không sửa file ngoài test, chạy `verify.sh` — **phải đỏ** vì chưa có code — rồi khoá test.
   - Báo xanh nghĩa là test chưa bắt được hành vi mới → viết lại cho đúng tiêu chí. Chỉ dùng `--allow-green "<lý do>"` khi task là refactor không đổi hành vi.
   - Đỏ vì lỗi cú pháp/import của chính test (không phải vì thiếu code) → sửa test rồi nộp lại.
5. Kết thúc bằng một dòng: "<ID> đã có test — chờ tài khoản khác code."

Không sửa `brief.md`, `state.json`, không commit. Lệnh shell: tuân theo luật 10 trong `.agents/rules/vai-tro-ky-su-thuc-thi.md` (chỉ `python3`).

## Bẫy đã gặp (bắt buộc tránh)
- `verify.sh`: type-check bằng `npx tsc --noEmit -p tsconfig.json`; KHÔNG truyền danh sách file cho tsc (nó bỏ qua tsconfig.json → báo lỗi giả, `lock` sẽ từ chối).
- Trước `tests-done`: chạy toàn bộ `npx vitest run` + tsc; test cũ bị task làm lỗi thời thì ghi vào `report.md` để trưởng phòng xử lý, đừng để cổng tự động phát hiện sau.
- Không dùng `python3 -c "…"` nhiều dấu nháy lồng nhau (bị từ chối quyền); ghi script ra file `.py` rồi `python3 file.py`, hoặc dùng công cụ đọc file.
- Không bọc đường dẫn file trong dấu nháy thừa khi gọi công cụ đọc/ghi file.
- Không thêm `eslint-disable`/`@ts-ignore` vào file test (cổng tự động coi là đường tắt).
- Sau khi `tests-done`, không sửa file test nữa (hash khoá sẽ lệch).

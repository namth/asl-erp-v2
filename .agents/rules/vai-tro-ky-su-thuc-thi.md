---
trigger: always_on
---

# Vai trò của bạn: Kỹ sư thực thi

Dự án này có:
- **Claude Code** là Trưởng phòng / Giám đốc sản phẩm: lập kế hoạch, viết đặc tả (`brief.md`), duyệt cuối task khó.
- **Các tài khoản Antigravity (agy1, agy2, …) ngang hàng**, mỗi task một tài khoản nhận **một** trong các vai — prompt giao việc nói rõ vai nào:
  - **Người code**: hiện thực hoá **toàn bộ** code của task, kể cả phần khó — task khó có blueprint (interface, mã giả, các bước) trong `brief.md`, bạn viết code đầy đủ theo đó. Quy trình: skill `/thuc-hien-task`.
  - **Người kiểm** (luôn là tài khoản khác người code): viết test + `verify.sh` trước khi code (skill `/viet-test-cheo`), rồi nghiệm thu chéo sau khi code nộp (skill `/nghiem-thu-cheo`). Người kiểm không viết/sửa code sản phẩm; người code không sửa test.
  - Task sau đổi vai: bên này code thì bên kia kiểm, và ngược lại.

Bối cảnh dự án, tech stack và bất biến nghiệp vụ: đọc `CONTEXT.md`, `docs/14-decisions.md` nếu có (quyết định đã chốt, thắng khi mâu thuẫn) và `CLAUDE.md` — mọi quy ước code, bảo mật và bất biến trong đó áp dụng y nguyên cho bạn (riêng phần mô tả vai trò của Claude thì không).

## Quy tắc bắt buộc

1. **Chỉ làm việc khi có task.** Việc được giao nằm trong `handoff/tasks/TASK-NNN-*/brief.md`. Nếu người dùng nhờ việc không có task, vẫn làm được, nhưng không tự ý thay đổi kiến trúc, schema, hợp đồng API hay `docs/` — đề xuất cho trưởng phòng qua người dùng.
2. **Không bao giờ sửa, xoá, đổi tên, hay "skip" test đã khoá** (do trưởng phòng hoặc người kiểm chéo viết) — gồm `verify.sh` và mọi file trong `tests.lock`. Test đỏ nghĩa là code sai. Nếu tin rằng test sai, ghi lý do vào `report.md` mục "câu hỏi" và dừng; không lách test (không mock bỏ qua logic, không hard-code kết quả mong đợi, không thêm điều kiện riêng cho môi trường test).
3. **Giữ trong phạm vi** `brief.md` mục 3. Không refactor lan man, không đổi file ngoài phạm vi.
4. **Không sửa `state.json`** bằng tay. Chỉ dùng `python3 scripts/handoff.py start|submit <ID>`.
5. **Không commit, push, hay tạo nhánh** — trưởng phòng làm sau khi nghiệm thu.
6. **Báo cáo trung thực** trong `report.md`: dán nguyên văn output kiểm thử, ghi rõ phần chưa xong.
7. Viết tiếng Việt có dấu trong báo cáo và text giao diện.
8. Quy trình theo vai: code → `/thuc-hien-task`; viết test chéo → `/viet-test-cheo`; nghiệm thu chéo → `/nghiem-thu-cheo`. Các luật ở đây (phạm vi, không lách test, không commit, báo cáo trung thực) áp dụng cho mọi vai.
9. Thao tác bị hook `.agents/hooks.json` từ chối là chủ ý của trưởng phòng (file test khoá, tài liệu giao việc, đường dẫn chỉ-đọc trong `handoff/config.json`). Không tìm đường khác để sửa các file đó.
10. **Lệnh shell khi chạy ngầm (`agy -p`):** lệnh nào không tự duyệt được sẽ bị từ chối âm thầm và phiên dừng lại. Vì vậy: không nhét code nhiều dòng vào `python3 -c`/`node -e`, không dùng `$`, `${…}`, `$(…)` hay backtick trong lệnh. Cần script phụ thì ghi ra file trong thư mục scratch của bạn (ngoài repo) rồi chạy `python3 <đường-dẫn-file>`. Ưu tiên công cụ đọc/tìm/sửa file có sẵn thay cho `grep`/`sed`/`cat`. **Chỉ** chạy được `python3` và các lệnh người dùng đã cho phép — `bash`, `sh`, `npm`… sẽ bị từ chối nếu chưa có trong danh sách. Tự kiểm luôn bằng `python3 scripts/handoff.py verify <ID>`, **không** chạy `bash …/verify.sh` trực tiếp.
11. **Tự xử lý tới cùng, cầu cứu đúng lúc.** Verify đỏ thì đọc lỗi và sửa code, lặp lại. Chỉ khi đã sửa 2 lần liên tiếp mà vẫn đỏ vì bế tắc giải thuật/thiết kế (không phải lỗi cú pháp, lỗi cách chạy lệnh) mới dừng: ghi vào `report.md` mục "câu hỏi" — test nào đỏ, đã thử gì, vì sao bế tắc, đề xuất hướng — rồi báo trưởng phòng. Không nộp khi verify còn đỏ.

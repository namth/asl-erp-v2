---
name: dieu-phoi
description: Vai ĐIỀU PHỐI do một tài khoản Antigravity đảm nhận — đọc digest, chạy/tiếp tục các task LOW qua auto, hồi phục phiên treo, chạy gate và merge task LOW đạt; chuyển việc khó và task nhạy cảm cho Claude bằng handoff/digest.md. Dùng khi prompt nói bạn là ĐIỀU PHỐI.
---

# Vai điều phối

Bạn **không viết code sản phẩm**. Bạn giữ cho dây chuyền chạy để Claude chỉ phải đọc một bản `handoff/digest.md` ngắn và xử lý việc khó.

## Luật cứng
1. **Chỉ chạy `python3`**: `python3 scripts/orchestrate.py …` và `python3 scripts/handoff.py …`. Mọi lệnh khác (`ls`, `git`, `cat`, `sed`, `npx`, `bash`) bị từ chối và làm phiên dừng. Đọc/ghi file bằng công cụ file.
2. Chỉ ghi file trong `handoff/` (digest.md, logs/, `brief.md` của task còn `draft`). Hook chặn mọi thứ khác.
3. **Không tự nghiệm thu / merge task HIGH hoặc Nhạy cảm** (tiền, phân quyền, migration, bảo mật). Chuyển cho Claude. Việc này do script ép: `merge-low` từ chối nếu không phải LOW.
4. Không sửa test, `tests.lock`, `state.json`, `scripts/`, `.agents/`.
5. Không đoán khi gặp lỗi lạ: ghi một dòng vào mục "CẦN CLAUDE" của `handoff/digest.md` rồi tiếp tục việc khác.

## Vòng làm việc (một lượt)
1. `python3 scripts/orchestrate.py digest` (tự gộp MacBook khi máy này chỉ có 1 tài khoản). Đọc 5 nhóm: CẦN CLAUDE · ĐIỀU PHỐI LÀM TIẾP · NGHI TREO · ĐANG CHẠY · CHỜ MERGE (LOW).
2. **ĐIỀU PHỐI LÀM TIẾP** — với từng task: `python3 scripts/orchestrate.py launch <ID> [--host macbook] [--coder agyN --checker agyM]`.
   - Mỗi tài khoản chạy tối đa 2 task cùng lúc; hai task song song nên đổi vai code/viết test cho nhau. Không có bước nghiệm thu chéo bằng agent: sau khi nộp, LOW → accepted rồi `gate`; HIGH → review_passed cho Claude. Tải hiện tại ở dòng cuối digest.
   - Chia việc: task độc lập, khác file thì chia đều giữa các tài khoản/máy; máy này chỉ có 1 tài khoản agy nên `launch` tự chạy task trên MacBook (agy2 ↔ agy3 code/kiểm chéo cho nhau).
   - `launch` chạy nền và trả về ngay (có `caffeinate`); xem nhật ký ở `handoff/logs/<ID>.log`. Không chờ.
3. **NGHI TREO** — `python3 scripts/orchestrate.py unstick <ID>` (resume vai đang dở rồi chạy tiếp `auto`, nền). Tối đa 2 lần/task; vẫn treo thì ghi vào CẦN CLAUDE.
4. **CHỜ MERGE (LOW)** — `python3 scripts/orchestrate.py gate <ID>` (guard-scan + toàn bộ vitest + tsc). Đạt thì `python3 scripts/orchestrate.py merge-low <ID>`. `gate` đỏ hoặc có cảnh báo CAO → không merge, ghi vào CẦN CLAUDE kèm các dòng cảnh báo.
5. Chạy lại `digest` để file `handoff/digest.md` phản ánh trạng thái cuối.
6. Kết thúc bằng đúng một dòng: `ĐIỀU PHỐI XONG: <n> việc Claude cần xem — handoff/digest.md`.

## Việc giao cho Claude (không tự làm)
Task HIGH/nhạy cảm đạt nghiệm thu chéo (`review_passed`); trả về quá 2 vòng; agent cầu cứu; test chéo sai hợp đồng; lỗi hạ tầng (hết hạn mức mọi model, SSH, build); mọi thay đổi `docs/`, schema, quyết định sản phẩm.

## Báo cáo
Ngắn: không dán log. Chỉ liệt kê mã task, trạng thái, một câu lý do.

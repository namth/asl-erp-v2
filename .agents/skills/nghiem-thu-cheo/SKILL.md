---
name: nghiem-thu-cheo
description: Nghiệm thu chéo một task do tài khoản Antigravity khác code — chạy test, kiểm phạm vi, đọc diff theo brief, rồi duyệt đạt hoặc trả về. Dùng khi được giao nghiệm thu TASK-NNN ở trạng thái in_review.
---

# Nghiệm thu chéo

Bạn là người nghiệm thu, **không phải người code**. Không tin báo cáo — tự kiểm. **Không sửa code hay test** (script phát hiện và từ chối kết luận nếu code bị đổi trong lúc nghiệm thu).

1. **Cửa cứng (rẻ nhất):**
   - `python3 scripts/handoff.py verify <ID> --quiet` — đỏ hoặc vi phạm khoá test → trả về ngay (bước 4).
   - `python3 scripts/handoff.py scope <ID>` — file ngoài phạm vi brief mục 3 → trả về.
2. **Đọc diff theo brief:** `python3 scripts/handoff.py diff <ID>`, đối chiếu `brief.md` mục 4–6 và `report.md` mục "câu hỏi".
   - Đúng đặc tả? Thiếu tiêu chí nào ở mục 5 mà test không phủ?
   - Lách test: hard-code kết quả, nhánh riêng cho môi trường test, `skip`, bắt lỗi rồi nuốt.
   - Bất biến trong `CLAUDE.md`/`CONTEXT.md`/`docs/14-decisions.md`: phân quyền, tiền tệ, migration, bảo mật, quy chuẩn đặt tên, code chết, text giao diện tiếng Việt có dấu.
3. **Viết `handoff/tasks/<ID>-*/cross-review.md`:**
   ```
   KẾT LUẬN: ĐẠT | CHƯA ĐẠT
   Đã kiểm: verify <xanh/đỏ>, phạm vi <OK/…>, <các điểm đã soát>
   Cần sửa:            (chỉ khi CHƯA ĐẠT)
   1. file:dòng — vấn đề — kỳ vọng
   Rủi ro cho trưởng phòng: <điểm đáng lưu ý, hoặc "Không">
   ```
   Ngắn, cụ thể, không giải thích dài.
4. **Kết luận:**
   - Đạt: `python3 scripts/handoff.py review-pass <ID>` (script tự kiểm lại cửa cứng; task LOW → accepted, task HIGH/nhạy cảm → chờ trưởng phòng duyệt cuối).
   - Chưa đạt: `python3 scripts/handoff.py review-fail <ID>` (script gửi cross-review.md thành review.md cho người code).
5. Kết thúc bằng một dòng: "<ID> nghiệm thu chéo: <ĐẠT/CHƯA ĐẠT> — <một câu>."

Lệnh shell: tuân theo luật 10 trong `.agents/rules/vai-tro-ky-su-thuc-thi.md` (chỉ `python3`).

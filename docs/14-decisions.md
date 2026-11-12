# 14. SỔ QUYẾT ĐỊNH SẢN PHẨM (DECISION LOG)

Ghi các quyết định nghiệp vụ do chủ dự án chốt. Quyết định ở đây **ghi đè** mọi chỗ mâu thuẫn trong `01`–`13` cho tới khi các tài liệu đó được cập nhật xong. Mỗi quyết định có mã `DEC-NN`; khi sửa doc theo quyết định, ghi mã vào phần mô tả thay đổi.

Nguồn: rà soát `docs/qa/reports/QA-REPORT-20261030-2318.md` mục 4.

**Trạng thái áp dụng:** 30/10/2026 — DEC-01 → DEC-08 đã được đưa vào `01`–`13`, `features/virtual-office-floorplan.md`, `CONTEXT.md`, `CLAUDE.md`. Prototype chưa cập nhật (Milestone 0 trong `11`).

---

## DEC-01 · Bốn vai trò hệ thống — 30/10/2026

**Quyết định:** Phase 1 có 4 vai trò hệ thống, khớp với prototype:

| Mã | Tên hiển thị | Phạm vi |
| :--- | :--- | :--- |
| `admin` | Quản trị viên | Cấu hình hệ thống, workflow template, người dùng, nhật ký kiểm toán |
| `manager` | Quản lý / Giám đốc | Điều hành vụ việc, phê duyệt, phân công, báo cáo, Văn phòng số |
| `accountant` | Kế toán | Đợt thu, xác nhận MISA, sổ hoa hồng; **không** xem tài liệu chuyên môn |
| `attorney` | Luật sư | Thực hiện vụ việc/task được giao, CRM, Trợ lý AI |

**Giám đốc không phải vai trò riêng.** Giám đốc là `manager` có phạm vi quản lý **mọi phòng ban**; Trưởng phòng là `manager` chỉ quản lý phòng ban của mình. Đây là dữ liệu phân quyền (cạnh `:LEADS` trên Neo4j), không phải một vai trò mới.

**Hệ quả cho tài liệu:**
- **Vai trò hệ thống ≠ vai trò trong vụ việc.** `SUPERVISOR`, `CASE_MANAGER`, `EXECUTOR`, `ASSISTANT` vẫn giữ, nhưng là giá trị của `case_assignments.role_in_case` (người được gán vào một vụ việc cụ thể), không phải `users.system_role`.
- **Không có vai trò Sales riêng.** Việc tạo khách hàng/cơ hội do `attorney` hoặc `manager` làm. Hoa hồng phát triển thị trường trả cho **người mang khách về** (`opportunities.assigned_sales_id` là người dùng bất kỳ), không phụ thuộc vai trò.
- Cần sửa: ma trận phân quyền `02` (7 cột → 4 cột + cột phạm vi), `users.system_role` trong `06`, guard Cypher `06` §3.2–3.3, `01` §4.

## DEC-02 · Đăng nhập nội bộ + 2FA cho nhóm nhạy cảm — 30/10/2026

**Quyết định:** chỉ đăng nhập bằng tài khoản nội bộ (giữ bất biến #5). **Không** có Google SSO hay Microsoft 365. Mã TOTP (Google Authenticator) **bắt buộc** với `admin`, `manager`, `accountant`; tuỳ chọn với `attorney`.

**Hệ quả:**
- Sửa `prototype/auth/login.html`: bỏ nút SSO, đổi email sang `@asllaw.vn`, ô TOTP chỉ hiện sau bước mật khẩu khi tài khoản có bật 2FA, "Ghi nhớ" khớp hạn refresh token (7 ngày), bỏ dòng demo.
- Bổ sung vào `10` (luồng đăng ký TOTP, mã khôi phục, Admin reset 2FA có ghi audit), vào `06` (cột `totp_secret` mã hoá, `totp_enabled`) và vào `07` (`POST /auth/2fa/verify`, `/auth/2fa/setup`).

## DEC-03 · Tối thiểu hoá dữ liệu gửi ra dịch vụ cloud — 30/10/2026

**Quyết định:**
- **Telegram/Zalo** chỉ nhận: mã vụ việc, tên task, hạn chót, deep-link. **Không** gửi tên khách hàng, tên vụ việc, tên nhãn hiệu/tài sản, số tiền.
- **Trợ lý AI (LLM cloud)**: trước khi gửi kết quả công cụ lên LLM, thay tên khách hàng, MST/CCCD, số điện thoại, email bằng mã giả (`KH-001`…), rồi khôi phục ở phía máy chủ khi trả lời người dùng. Không gửi nội dung tài liệu.

**Hệ quả:** sửa mẫu tin nhắn ở `04` §6 và `08` §2.2; thêm mục "Tối thiểu hoá dữ liệu" vào `08` §4 và `10`; thêm test kiểm tra payload gửi ra ngoài không chứa PII.

## DEC-04 · Phạm vi Phase 1 — 30/10/2026

**Trong Phase 1** (ngoài 7 phân hệ gốc):
- Tài liệu vụ việc (kho tài liệu, phiên bản, lưu trên NAS)
- Báo cáo & thống kê
- Văn phòng số trực quan (Floorplan)

**Ngoài Phase 1:** Chấm công (Timesheet), Cổng khách hàng (Client Portal).

**Hệ quả:**
- Đặc tả mới cho phân hệ Tài liệu và Báo cáo trong `02`, `03`, `06`, `07`.
- Trang `prototype/timesheet/` và `prototype/client-portal/` ẩn khỏi menu, giữ file để dùng cho Phase 2.
- Bảng `timesheets` không đưa vào migration Phase 1.

## DEC-05 · Chuyển toàn bộ dữ liệu hệ thống cũ — 30/10/2026

**Quyết định:** chuyển **toàn bộ** dữ liệu từ hệ thống WordPress cũ (`qlcvaslgate-old/`): khách hàng, đối tác, nhân sự, vụ việc (cả đang chạy lẫn đã đóng), task, tài liệu đính kèm, tài chính và hoa hồng lịch sử.

**Hệ quả:**
- Thêm **Milestone chuyển đổi dữ liệu** vào `11`: khảo sát schema cũ → bảng ánh xạ trường → script ETL chạy lặp lại được → chạy thử trên bản sao → đối soát số lượng và tổng tiền → chạy thật lúc cutover.
- **Mật khẩu:** băm WordPress (phpass) không chuyển được sang Argon2id → mọi tài khoản bắt buộc đặt lại mật khẩu ở lần đăng nhập đầu.
- **Vụ việc cũ không có workflow template:** nhập ở chế độ "lịch sử" (chỉ đọc, không áp guard khung cứng); vụ việc đang chạy được gán template phù hợp hoặc chế độ linh hoạt (xem DEC-07).
- **Hoa hồng lịch sử** nhập nguyên số đã chi, đánh dấu nguồn `LEGACY`, không tính lại.
- Vai trò cũ (`administrator`, `partner`, `member`, `contributor`, `foreign_partner`) cần bảng ánh xạ sang 4 vai trò ở DEC-01. **`foreign_partner` (đối tác nước ngoài) chưa có vai trò tương ứng — cần chốt.**
- Không đọc `qlcvaslgate-old/datacenter/secret.php`; thông tin kết nối DB cũ do chủ dự án cung cấp lúc chạy.

## DEC-06 · Tiền: theo thực thu, không đảo hoa hồng — 30/10/2026

**Quyết định:**
- **Thu thiếu:** đợt thu chuyển `PARTIALLY_PAID`; hoa hồng tính trên **số tiền đã thực về** của mỗi lần xác nhận; quy trình chỉ mở khoá khi đợt thu **đủ**. Một đợt có thể có nhiều lần xác nhận (`misa_transactions` 1-n).
- **Thu thừa:** ghi nhận đúng số thực về; phần thừa hiển thị cảnh báo cho Kế toán, hoa hồng tính trên số thực về.
- **Hoàn tiền / huỷ hợp đồng:** **không** đảo hoa hồng đã ghi nhận trong hệ thống; Giám đốc/Quản lý xử lý ngoài hệ thống. Đợt thu chưa thu chuyển `CANCELLED`; vụ việc chuyển `TERMINATED`. Hành động huỷ ghi audit kèm lý do.
- **Đợt chưa có task nào hoàn thành** (VD tạm ứng khi ký): quỹ hoa hồng thực hiện của đợt đó **dồn sang đợt kế tiếp** (đề xuất mặc định của trưởng phòng, chủ dự án có thể đổi).
- **Làm tròn:** tính bằng `Decimal`, làm tròn từng khoản xuống đồng, phần dư phân theo phương pháp phần dư lớn nhất để tổng khớp từng đồng.
- **Chống xác nhận trùng:** `bank_ref_code` là UNIQUE; API `confirm-payment` nhận header `Idempotency-Key`.

**Hệ quả:** sửa máy trạng thái đợt thu và vụ việc ở `12`, schema `06`, thêm test TC-FIN-03 → TC-FIN-07 vào `13`.

## DEC-07 · Workflow có hai chế độ: Khung cứng / Linh hoạt — 30/10/2026

**Quyết định:** khi tạo workflow template, Admin chọn chế độ:
- **Khung cứng (`STRICT`):** không thêm/bớt stage hay task ngoài template.
- **Linh hoạt (`FLEXIBLE`):** được đề xuất thêm task/stage, nhưng **mọi bổ sung đều phải được `manager` phụ trách phê duyệt** trước khi có hiệu lực, có lý do và ghi audit.

Dù ở chế độ nào, không có thay đổi nào ngoài template mà không qua phê duyệt. **Bất biến #1 được sửa theo quyết định này** (CONTEXT.md, CLAUDE.md).

**Hệ quả:**
- `06`: thêm `workflow_templates.mode`; thêm bảng `workflow_change_requests`; task/stage phát sinh có cờ `is_ad_hoc` và tham chiếu tới yêu cầu đã duyệt.
- `07`: thêm `POST /cases/{id}/change-requests` và `.../decide`; mã lỗi `STRICT_GOVERNANCE_VIOLATION` (template STRICT) và `CHANGE_REQUEST_REQUIRED` (template FLEXIBLE, chưa duyệt).
- **Template có phiên bản:** vụ việc gắn với phiên bản template lúc khởi tạo; sửa template không ảnh hưởng vụ việc đang chạy.
- `13`: TC-WF-01 tách thành 3 ca: STRICT bị chặn, FLEXIBLE chưa duyệt bị chặn, FLEXIBLE đã duyệt thì task được tạo.

## DEC-08 · Sao lưu off-site có mã hoá — 30/10/2026

**Quyết định:** giữ sao lưu NAS hằng đêm, **thêm** một bản mã hoá đưa ra ngoài văn phòng hằng tuần (ổ cứng luân chuyển hoặc cloud, mã hoá phía ASL trước khi gửi, khoá do Giám đốc giữ). Diễn tập khôi phục hằng quý.

**Hệ quả:**
- `05` §3.1: thêm RPO (đề xuất ≤ 24 giờ) và RTO (đề xuất ≤ 8 giờ giờ hành chính), mô tả luồng off-site.
- Neo4j Community không sao lưu online được → sao lưu bằng `neo4j-admin database dump` trong cửa sổ dừng ngắn lúc 02:00, hoặc dựng lại đồ thị từ PostgreSQL (khuyến nghị: Postgres là nguồn sự thật, đồ thị dựng lại được).
- `11`: thêm task "Sao lưu off-site & diễn tập khôi phục" kèm lệnh xác minh khôi phục vào môi trường trống.

## DEC-09 · Không chi trả hoa hồng trên hệ thống — 12/11/2026

**Quyết định (chủ dự án):** hệ thống chỉ làm tới bước **chia hoa hồng** (bút toán khi Kế toán xác nhận thực thu) và **thống kê theo từng tháng**. Việc chi trả hoa hồng làm riêng trên sổ sách bên ngoài; hệ thống không ghi nhận đã chi hay chưa.

**Hệ quả:**
- Bỏ `POST /finance/commissions/disburse`; bỏ khái niệm "Tích luỹ / Đã chi" ở mọi màn hình, báo cáo và tệp xuất. `commission_transactions` **chỉ INSERT** tuyệt đối (giữ trigger chặn UPDATE/DELETE); cột `payout_status` giữ nguyên giá trị mặc định `ACCUMULATED`, không đọc/ghi trong nghiệp vụ.
- Báo cáo hoa hồng (`07` §3.9) đổi sang thống kê **theo tháng**: tổng theo tháng và theo nhân sự × tháng; tệp Excel dùng để đối chiếu chi trả ngoài hệ thống.
- `12` §3.5, `06` (`commission_transactions`), `02` mục Kế toán, `03` SCR-12/SCR-18 cập nhật theo.

---

## Câu hỏi còn mở

| # | Câu hỏi | Phát sinh từ |
| :--- | :--- | :--- |
| Q1 | Đối tác nước ngoài (`foreign_partner` ở hệ thống cũ) dùng vai trò nào, hay có cần cổng riêng? | DEC-05 |
| Q2 | Quỹ hoa hồng thực hiện của đợt chưa có task: dồn sang đợt sau (mặc định) hay chia theo phân công? | DEC-06 |

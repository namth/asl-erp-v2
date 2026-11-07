# 13. KẾ HOẠCH KIỂM THỬ TOÀN DIỆN & MA TRẬN TEST CASES (QA & TEST CASES)

> Cập nhật 30/10/2026 theo `14-decisions.md` và báo cáo QA 30/10. Mọi mã TC được tham chiếu trong DoD của `11`.

## 1. CHIẾN LƯỢC KIỂM THỬ (TESTING PYRAMID)

```text
             /\
            /E2E\        10% - Luồng người dùng xuyên suốt cho 4 vai trò + a11y (Playwright + axe)
           /------\
          /  Integ \     30% - API, Neo4j guard, DB constraint, worker (Pytest + container thật)
         /----------\
        /    Unit    \   60% - Công thức hoa hồng, máy trạng thái, chính sách truy cập, che PII (Pytest, Hypothesis)
       /--------------\
```

- **Mục tiêu chất lượng:**
  - Độ bao phủ ≥ **85%** trên `services/`, `guards/`; **100%** nhánh của `access_policy.py` và động cơ hoa hồng.
  - 100% vi phạm Need-to-know bị chặn và ghi audit.
  - 100% phép tính hoa hồng khớp từng đồng, kể cả số lẻ (property-based test).
  - Test tích hợp chạy trên PostgreSQL/Neo4j/Redis thật (container), không mock DB.
- **Quy ước:** test do trưởng phòng (Claude) viết trước khi giao việc, khoá trong `tests.lock` của task (`handoff/README.md`); người thực thi không sửa test.

---

## 2. MA TRẬN CA KIỂM THỬ

### 2.1. Bảo mật & xác thực

| Mã | Tên | Điều kiện & thao tác | Kỳ vọng | Mức |
| :--- | :--- | :--- | :--- | :---: |
| **TC-SEC-01** | Chặn truy cập trái thẩm quyền | Luật sư B (không được gán) `GET /cases/{caseA}` | `403 NEED_TO_KNOW_DENIED`, 1 dòng audit `ACCESS_DENIED` | **Critical** |
| **TC-SEC-02** | Trưởng phòng xem vụ việc trong phòng | Trưởng ban SHTT xem vụ việc phòng SHTT không được gán | `200 OK` nhờ `:LEADS` | High |
| **TC-SEC-03** | Bất biến audit log | `DELETE FROM audit_logs` và `UPDATE audit_logs …` bằng `asl_app` | Cả hai bị từ chối | **Critical** |
| **TC-SEC-04** | Thu hồi token khi đăng xuất | Đăng xuất rồi dùng lại access token cũ | `401 TOKEN_REVOKED` | High |
| **TC-SEC-05** | Xoay vòng refresh token | Refresh lần 1 (được token mới), rồi dùng lại refresh token cũ | `401 TOKEN_REVOKED`; token mới của cùng chuỗi cũng bị thu hồi | **Critical** |
| **TC-SEC-06** | Khoá tài khoản thu hồi mọi phiên | User có 2 phiên đang mở; Admin khoá tài khoản | Request kế tiếp ở cả 2 phiên → `401` | **Critical** |
| **TC-SEC-07** | Chống brute-force | Sai mật khẩu 5 lần trong 15 phút, lần 6 nhập đúng | `423 ACCOUNT_LOCKED`; Admin nhận thông báo | High |
| **TC-SEC-08** | 2FA bắt buộc theo vai trò | Kế toán chưa bật 2FA đăng nhập; Luật sư chưa bật 2FA đăng nhập | Kế toán: `403 TOTP_SETUP_REQUIRED`; Luật sư: đăng nhập được | **Critical** |
| **TC-SEC-09** | Mã 2FA & mã khôi phục | Nhập sai TOTP 5 lần; dùng một mã khôi phục 2 lần | Sai TOTP tính vào khoá tài khoản; mã khôi phục lần 2 bị từ chối | High |
| **TC-SEC-10** | Kế toán chỉ phạm vi tài chính | Kế toán `GET /cases/{id}` (chuyên môn) và `GET /cases/{id}/milestones` | `403` / `200` | **Critical** |
| **TC-SEC-11** | Quản trị viên không đọc hồ sơ | Admin không được gán `GET /cases/{id}`; `GET /cases/{id}?view=admin_meta` | `403` / `200` (không có `custom_data`, tài liệu) | High |
| **TC-SEC-12** | Người mang khách về chỉ xem tiến độ | Originator (không được gán) `GET /cases/{id}?view=progress` và `GET /cases/{id}` | `200` / `403` | High |
| **TC-SEC-13** | Giám đốc, Trưởng phòng & thu hồi tức thì | Giám đốc xem vụ việc mọi phòng; Trưởng phòng xem phòng khác; gỡ phân công Luật sư A rồi A gọi lại | `200` / `403` / `403` ngay request kế tiếp | **Critical** |
| **TC-SEC-14** | Chuỗi băm audit | Trên DB test, dùng `asl_owner` sửa 1 dòng audit; chạy job kiểm tra | Job báo đứt chuỗi tại đúng dòng | High |
| **TC-SEC-15** | Mọi router vụ việc có guard | Quét tất cả route `/cases/{id}/…` | Không route nào thiếu khai báo `scope` | **Critical** |

### 2.2. CRM

| Mã | Tên | Điều kiện & thao tác | Kỳ vọng | Mức |
| :--- | :--- | :--- | :--- | :---: |
| **TC-CRM-01** | Chặn trùng MST | Tạo 2 doanh nghiệp cùng MST `0109988776` | Bản ghi 2: `409 DUPLICATE_TAX_CODE` | Medium |
| **TC-CRM-02** | Chuyển đổi 1-chạm | Cơ hội `WON` → chuyển đổi | Vụ việc `INITIALIZING`, mã khớp `^ASL-\d{4}-[A-Z]{2,4}-\d{4}$`, đúng phiên bản template, có lộ trình đợt thu, tỷ lệ mặc định, `originator_id` | **Critical** |
| **TC-CRM-03** | Chặn trùng CCCD & che dữ liệu | Tạo 2 cá nhân cùng CCCD (lần 2 có khoảng trắng); đọc lại khách hàng | `409 DUPLICATE_IDENTITY_NO`; API chỉ trả `********1234`; cột DB không chứa bản rõ | **Critical** |
| **TC-CRM-04** | Cảnh báo xung đột lợi ích | Vụ việc ACTIVE có bên đối tụng "Công ty TNHH Minh Phát"; tạo khách hàng "CÔNG TY TNHH MINH PHÁT" | `201` + `warnings[CONFLICT_OF_INTEREST]`, Quản lý nhận thông báo, có audit | High |
| **TC-CRM-05** | Chuyển đổi an toàn | Chuyển đổi cơ hội chưa `WON`; gửi 2 lần cùng `Idempotency-Key`; gửi lần 3 với key khác | `409 OPPORTUNITY_NOT_WON`; 2 lần đầu trả cùng `case_id`; lần 3 `409 OPPORTUNITY_ALREADY_CONVERTED` | **Critical** |

### 2.3. Workflow (DEC-07)

| Mã | Tên | Điều kiện & thao tác | Kỳ vọng | Mức |
| :--- | :--- | :--- | :--- | :---: |
| **TC-WF-01** | Khung cứng chặn bổ sung | Vụ việc `STRICT`, gửi yêu cầu bổ sung task | `403 STRICT_GOVERNANCE_VIOLATION`, không tạo gì | **Critical** |
| **TC-WF-02** | Linh hoạt: chưa duyệt chưa có task | Vụ việc `FLEXIBLE`, gửi yêu cầu; gọi thử mọi endpoint tạo task trực tiếp | Yêu cầu `PENDING`, chưa có task; tạo trực tiếp → `403 CHANGE_REQUEST_REQUIRED` | **Critical** |
| **TC-WF-03** | Linh hoạt: duyệt tạo task bổ sung | Quản lý phụ trách duyệt yêu cầu | Task `is_ad_hoc = true` liên kết yêu cầu, có audit; Luật sư được gán không tự duyệt được | High |
| **TC-WF-04** | Phiên bản template | Vụ việc tạo ở v1; Admin phát hành v2 thêm 1 task | Vụ việc cũ giữ v1 (không có task mới); vụ việc tạo sau dùng v2 | High |

### 2.4. Vụ việc & tác vụ

| Mã | Tên | Điều kiện & thao tác | Kỳ vọng | Mức |
| :--- | :--- | :--- | :--- | :---: |
| **TC-CASE-01** | Khoá phụ thuộc | Đưa task B sang `IN_PROGRESS`/`COMPLETED` khi task A tiên quyết đang `TODO` | `422 PREREQUISITE_TASK_NOT_COMPLETED`, `details.prerequisite_task_ids` chứa A | **Critical** |
| **TC-CASE-02** | Cổng giai đoạn | Mọi task stage xong → stage `WAITING_APPROVAL`; Supervisor duyệt | Stage `COMPLETED`, stage kế tiếp `ACTIVE` (hoặc `WAITING_PAYMENT` nếu bị chặn tiền) | High |
| **TC-CASE-03** | Kích hoạt vụ việc | Vụ việc `INITIALIZING` chỉ có Executor; thêm Case Manager | Trước: không `ACTIVE` được (`409`); sau: `ACTIVE`, đợt tạm ứng `AWAITING_PAYMENT` | High |
| **TC-CASE-04** | Không tự duyệt | Case Manager gửi duyệt task của chính mình rồi tự bấm duyệt | `403 APPROVAL_NOT_ALLOWED` | High |
| **TC-CASE-05** | Khoá chờ thu tiền | Stage `WAITING_PAYMENT`; đổi trạng thái task trong stage | `409 STAGE_LOCKED` | **Critical** |
| **TC-CASE-06** | Vụ việc lịch sử chỉ đọc | Sửa task của vụ việc `is_legacy` | `409 LEGACY_CASE_READ_ONLY` | Medium |

### 2.5. Kế toán MISA (DEC-06)

| Mã | Tên | Điều kiện & thao tác | Kỳ vọng | Mức |
| :--- | :--- | :--- | :--- | :---: |
| **TC-MISA-01** | Phát tác vụ kế toán | Hoàn thành task kích hoạt đợt 2 | Đợt 2 `AWAITING_PAYMENT`, có trong hòm thư Kế toán, stage kế tiếp `WAITING_PAYMENT` | **Critical** |
| **TC-MISA-02** | Thu đủ mở khoá | Kế toán xác nhận đủ số phải thu | Đợt `PAID_CONFIRMED`, stage `ACTIVE`, Luật sư nhận thông báo | **Critical** |
| **TC-MISA-03** | Thu một phần | Đợt 60.000.000đ: xác nhận 30.000.000đ, rồi 30.000.000đ | Lần 1: `PARTIALLY_PAID`, stage vẫn khoá, có hoa hồng trên 30tr; lần 2: `PAID_CONFIRMED`, mở khoá | **Critical** |
| **TC-MISA-04** | Chặn trùng mã giao dịch | Hai xác nhận cùng `bank_ref_code` (khác `Idempotency-Key`) | Lần 2: `409 DUPLICATE_BANK_REF`, không sinh hoa hồng | **Critical** |
| **TC-MISA-05** | Bấm đúp | Gửi đồng thời 2 request cùng `Idempotency-Key` và nội dung | Đúng 1 `misa_transactions`, 1 bộ hoa hồng, 2 response giống nhau | **Critical** |

### 2.6. Hoa hồng (`12` §3)

| Mã | Tên | Điều kiện & thao tác | Kỳ vọng | Mức |
| :--- | :--- | :--- | :--- | :---: |
| **TC-FIN-01** | Công thức cơ bản | Thu 50.000.000đ; R_o 5%, R_m 7% (Supervisor 40%), R_e 8%; 1 task đủ điều kiện | Originator 2.500.000đ; Supervisor 1.400.000đ; Case Manager 2.100.000đ; Executor 4.000.000đ | **Critical** |
| **TC-FIN-02** | Chia theo trọng số | Quỹ thực hiện, 2 task trọng số 1 và 3 | 25% / 75% quỹ | High |
| **TC-FIN-03** | Làm tròn khớp từng đồng | Thu 33.333.333đ, R_e 8%, 3 task trọng số bằng nhau | 888.889đ, 888.889đ, 888.888đ (tổng 2.666.666đ) | **Critical** |
| **TC-FIN-04** | Dồn quỹ khi không có task | Xác nhận đợt tạm ứng khi chưa task nào xong; sau đó xác nhận đợt có 2 task | Lần 1: không lỗi chia 0, 1 dòng `commission_carry_forwards`, không chia quỹ thực hiện; lần 2: quỹ = phần mới + phần dồn | **Critical** |
| **TC-FIN-05** | Không phân bổ task 2 lần | Task đã nhận quỹ ở lần thu trước; lần thu sau không có task mới | Task cũ không nhận thêm; quỹ lần sau dồn | High |
| **TC-FIN-06** | Đóng vụ việc còn quỹ dồn | Vụ việc `CLOSED` khi còn quỹ dồn | Quỹ chia theo trọng số cho mọi task `COMPLETED` | Medium |
| **TC-FIN-07** | Huỷ hợp đồng không đảo | Vụ việc đã có hoa hồng → `TERMINATED` | Không có dòng hoa hồng âm/đảo; đợt chưa thu `CANCELLED` | High |
| **TC-FIN-08** | Khoá & kiểm tra tỷ lệ | Sửa tỷ lệ sau lần thu đầu; đặt tổng tỷ lệ 101% | `409 COMMISSION_POLICY_LOCKED`; `422 COMMISSION_RATES_EXCEED_100` | High |
| **TC-FIN-09** | Bất biến (property-based) | Hypothesis: A ngẫu nhiên 1đ–10 tỷ, 0–20 task trọng số 1–4 | Σ phần task = quỹ; mọi khoản ≥ 0; tổng ≤ trần ở `12` §3.4 | **Critical** |

### 2.7. Tài liệu (DEC-04)

| Mã | Tên | Điều kiện & thao tác | Kỳ vọng | Mức |
| :--- | :--- | :--- | :--- | :---: |
| **TC-DOC-01** | Định dạng & dung lượng | Tải `.exe` đổi đuôi `.pdf`; tải tệp 51 MB | `415 FILE_TYPE_NOT_ALLOWED`; `413 FILE_TOO_LARGE` | High |
| **TC-DOC-02** | Quét virus | Tải tệp EICAR; tải xuống | `scan_status = INFECTED`; tải xuống `409 FILE_NOT_AVAILABLE` | **Critical** |
| **TC-DOC-03** | Phạm vi Kế toán | Kế toán tải tệp thư mục Hợp đồng và thư mục Bản thảo nội bộ | `200` / `403` | **Critical** |
| **TC-DOC-04** | Phiên bản & mã hoá | Tải 2 phiên bản; đọc tệp thô trên NAS; tải xuống | Bản 1 còn nguyên; tệp trên NAS không chứa nội dung bản rõ; mỗi lượt tải có audit | High |

### 2.8. Thông báo (DEC-03)

| Mã | Tên | Điều kiện & thao tác | Kỳ vọng | Mức |
| :--- | :--- | :--- | :--- | :---: |
| **TC-NOTIF-01** | Cảnh báo cấp 1 | Task còn 3 giờ làm việc tới hạn | Tin Telegram kèm deep-link hợp lệ tới người thực hiện | High |
| **TC-NOTIF-02** | Leo thang, chống trùng, ngày nghỉ | Chạy scanner 2 lần; task quá hạn 5 giờ; hạn rơi vào ngày trong `holidays` | Mỗi (task, cấp, kênh) đúng 1 tin; cấp 2 tới Case Manager & Supervisor; hạn tính bỏ qua ngày nghỉ | High |
| **TC-NOTIF-03** | Không lộ dữ liệu khách | Dựng mọi loại tin ra Telegram/Zalo/Email cho vụ việc có tên khách, MST, SĐT, email | Payload không chứa tên khách hàng, tên vụ việc, MST, SĐT, email, số tiền | **Critical** |

### 2.9. Trợ lý AI (DEC-03)

| Mã | Tên | Điều kiện & thao tác | Kỳ vọng | Mức |
| :--- | :--- | :--- | :--- | :---: |
| **TC-AI-01** | Đúng phạm vi người hỏi | Luật sư hỏi "Hôm nay tôi có task nào?" | Chỉ task của người đó, không lộ task người khác | High |
| **TC-AI-02** | Che PII khi gửi LLM | Mock LLM, ghi lại request; hỏi về một vụ việc có tên khách, MST | Request tới LLM không chứa tên/MST/SĐT/email (chỉ mã giả); câu trả lời cho người dùng có lại tên thật | **Critical** |

### 2.10. Báo cáo

| Mã | Tên | Điều kiện & thao tác | Kỳ vọng | Mức |
| :--- | :--- | :--- | :--- | :---: |
| **TC-RPT-01** | Phạm vi & khớp sổ | Trưởng phòng SHTT xem báo cáo doanh thu; so tổng với `misa_transactions` | Chỉ số liệu phòng SHTT; tổng khớp từng đồng | High |

### 2.11. Văn phòng số

| Mã | Tên | Điều kiện & thao tác | Kỳ vọng | Mức |
| :--- | :--- | :--- | :--- | :---: |
| **TC-FL-01** | Phân quyền phòng ban | Trưởng ban SHTT xem phòng Tranh tụng / phòng SHTT; Giám đốc xem cả hai | `403` / `200`; Giám đốc `200` cả hai | High |
| **TC-FL-02** | Nhân sự đang nghỉ | `tasks_in_progress == 0` | Huy hiệu `☕ Đang nghỉ ngơi` | Medium |
| **TC-FL-03** | Xếp hàng chờ duyệt | Nhân sự có `approval_requests` `PENDING` | Avatar rời ghế, đứng ở Vạch Hàng Đợi với `📝 X việc` | **Critical** |
| **TC-FL-04** | Ký duyệt & hồi vị | Trưởng phòng duyệt yêu cầu cuối cùng của nhân sự | Yêu cầu `APPROVED`, nhân sự về bàn qua sự kiện WebSocket | **Critical** |
| **TC-FL-05** | Ảnh đại diện & fallback | Tải màn hình, mạng chậm / ảnh lỗi | Không vỡ bố cục, hiện chữ viết tắt thay ảnh | High |

### 2.12. Chuyển dữ liệu & vận hành (DEC-05, DEC-08)

| Mã | Tên | Điều kiện & thao tác | Kỳ vọng | Mức |
| :--- | :--- | :--- | :--- | :---: |
| **TC-MIG-01** | ETL lặp lại được | Chạy ETL 2 lần trên cùng bản sao dữ liệu cũ | Lần 2 không sinh bản ghi mới; mọi user `must_reset_password`; vụ việc đã đóng `is_legacy` | **Critical** |
| **TC-MIG-02** | Đối soát | So sánh số lượng & tổng tiền giữa hệ thống cũ và mới | Chênh lệch = 0 hoặc có giải trình được duyệt | **Critical** |
| **TC-OPS-01** | Khôi phục từ backup | Khôi phục bản off-site vào máy trống, chạy `rebuild-graph` | Hệ thống chạy, guard đúng như trước, chuỗi băm audit nguyên vẹn, trong ≤ 8 giờ | **Critical** |

### 2.13. Giao diện

| Mã | Tên | Điều kiện & thao tác | Kỳ vọng | Mức |
| :--- | :--- | :--- | :--- | :---: |
| **TC-UI-01** | WCAG 2.1 AA | axe trên mọi màn hình, Light và Dark | 0 vi phạm mức serious/critical | High |
| **TC-UI-02** | Responsive | Mọi màn hình ở 375, 1024, 1440px | Không cuộn ngang trang, không chữ vỡ dòng trong nút | Medium |
| **TC-UI-03** | Ẩn theo vai trò | Đăng nhập 4 vai trò, mở các màn hình vụ việc | Không có nút hành động ngoài quyền trong DOM | High |

---

## 3. LỆNH KIỂM THỬ TỰ ĐỘNG

### 3.1. Backend (unit & integration)
```bash
docker compose exec backend pytest \
  --cov=app --cov-report=term-missing --cov-report=html:tests/coverage \
  tests/ -v
```

### 3.2. Kiểm tra Need-to-know nhanh bằng cURL
```bash
# Dùng tài khoản seed (TSK-16), không dùng mật khẩu thật
TOKEN_LAWYER_B=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"lawyer_b@asllaw.vn\",\"password\":\"$SEED_PASSWORD\"}" | jq -r .data.access_token)

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:8000/api/v1/cases/$CASE_OF_LAWYER_A" \
  -H "Authorization: Bearer $TOKEN_LAWYER_B")

if [ "$HTTP_STATUS" -eq 403 ]; then
  echo "PASS: guard Need-to-know đã chặn truy cập trái phép"
else
  echo "FAIL: HTTP $HTTP_STATUS"; exit 1
fi
```

### 3.3. Prototype
```bash
python3 scripts/check-prototype.py --strict
```

---

## 4. TIÊU CHUẨN NGHIỆM THU ĐỂ BÀN GIAO (QA SIGN-OFF)
1. **100% test Critical & High đạt**; không còn lỗi Critical/High tồn đọng trước khi triển khai lên máy chủ On-Premise.
2. **Quy trình có kiểm soát:** không có đường nào sinh task/stage ngoài template mà không qua yêu cầu bổ sung đã duyệt (TC-WF-01 → 03).
3. **Chính xác tài chính tuyệt đối:** sổ hoa hồng và đối soát MISA khớp 100% với số liệu kế toán; TC-FIN-09 chạy ≥ 10.000 mẫu.
4. **Không lộ dữ liệu ra ngoài:** TC-NOTIF-03 và TC-AI-02 đạt.
5. **Khôi phục được:** biên bản diễn tập khôi phục (TC-OPS-01) trong vòng 90 ngày trước bàn giao.
6. **Hiệu năng On-Premise:** API đọc vụ việc p95 `< 200ms`; guard Need-to-know p95 `< 50ms`.
7. **Giao diện:** TC-UI-01 → 03 đạt ở cả Light và Dark.

# 13. KẾ HOẠCH KIỂM THỬ TOÀN DIỆN & MA TRẬN TEST CASES (QA & TEST CASES)

## 1. CHIẾN LƯỢC KIỂM THỬ HỆ THỐNG (QA STRATEGY & TESTING PYRAMID)

```text
             /\
            /E2E\        10% - Kiểm thử luồng E2E người dùng (Playwright)
           /------\
          /  Integ \     30% - Kiểm thử tích hợp API, Neo4j Guard & DB (Pytest)
         /----------\
        /    Unit    \   60% - Kiểm thử Đơn vị: Logic hoa hồng, State Guard (Pytest)
       /--------------\
```

- **Mục tiêu chất lượng:**
  - Độ bao phủ mã nguồn (Code Coverage) đạt tối thiểu **85%** trên toàn bộ tầng Business Logic và Security Guards.
  - 100% các vi phạm phân quyền Need-to-know phải bị phát hiện và chặn đứng tự động.
  - 100% các công thức tính toán hoa hồng thực thu phải khớp số liệu đến từng đồng mà không có lỗi sai lệch làm tròn.

---

## 2. MA TRẬN CA KIỂM THỬ CHI TIẾT (COMPREHENSIVE TEST CASE MATRIX)

| Mã Test Case | Phân hệ | Tên ca kiểm thử | Điều kiện tiên quyết & Thao tác | Kết quả kỳ vọng (Expected Output) | Mức độ |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **TC-SEC-01** | Security | Chặn truy cập trái thẩm quyền (Need-to-know) | Luật sư B (không được gán vào Case A) gửi GET request `/api/v1/cases/{caseA_id}` | Trả về `403 Forbidden`, ghi 1 bản ghi cảnh báo vào `audit_logs`. | **Critical** |
| **TC-SEC-02** | Security | Quyền Leader phòng ban xem vụ việc cấp dưới | Trưởng ban SHTT gửi GET request xem vụ việc do thành viên trong ban phụ trách | Trả về `200 OK` nhờ quan hệ `:LEADS` trên Neo4j. | High |
| **TC-SEC-03** | Security | Bất biến của bảng Nhật ký Kiểm toán | Chạy lệnh `DELETE FROM audit_logs;` bằng user database của ứng dụng | Bị PostgreSQL từ chối với lỗi `permission denied for table audit_logs`. | **Critical** |
| **TC-SEC-04** | Security | Thu hồi Token tức thời qua Redis Blocklist | User đăng xuất, sau đó dùng lại Access Token cũ để gọi API `/api/v1/cases` | Trả về `401 Unauthorized` do Token ID nằm trong Redis Blocklist. | High |
| **TC-CRM-01** | CRM | Chặn trùng lặp Mã số thuế thân chủ | Tạo 2 khách hàng doanh nghiệp có cùng một MST `0109988776` | API từ chối bản ghi thứ 2 với mã lỗi `409 Conflict`. | Medium |
| **TC-CRM-02** | CRM | Chuyển đổi 1-chạm Cơ hội thành Case mới | Chuyển Cơ hội sang `WON` và bấm nút "Chuyển đổi thành Vụ việc" | Sinh Case mới kèm mã `ASL-2026-XX-NNNN`, áp dụng đúng Workflow Template. | **Critical** |
| **TC-WF-01** | Workflow | Khung cứng: Chặn thêm Task ngoài Template | User gửi request tạo task tự do vào Case đang chạy | API từ chối với mã lỗi `403 Strict Governance Enforced`. | High |
| **TC-CASE-01**| Cases | Khóa Ràng buộc Tiên quyết (Dependency Lock) | Cố gắng kéo Task B sang `COMPLETED` khi Task A tiên quyết đang ở `TODO` | API từ chối với mã lỗi `422 Unprocessable Entity` và message giải thích. | **Critical** |
| **TC-CASE-02**| Cases | Phê duyệt Cổng Giai đoạn (Approval Gate) | Case Manager gửi yêu cầu duyệt chuyển Stage; Supervisor bấm "Chấp thuận" | Vụ việc chuyển sang Stage tiếp theo, mở khóa các task của giai đoạn mới. | High |
| **TC-MISA-01**| Accounting | Tự động phát sinh Tác vụ Kế toán | Vụ việc hoàn tất task kích hoạt đợt thu tiền | Màn hình SCR-11 của Kế toán hiển thị đợt thu mới; Case bị tạm khóa. | **Critical** |
| **TC-MISA-02**| Accounting | Mở khóa quy trình sau khi xác nhận tiền về | Kế toán nhập Số HĐ MISA + Mã GD ngân hàng và bấm "Xác nhận đã thu tiền" | Case được mở khóa (`ACTIVE`), giải phóng tác vụ nộp hồ sơ cho Luật sư. | **Critical** |
| **TC-FIN-01** | Finance | Chiết tính hoa hồng Cash-basis chính xác | Kế toán xác nhận thu 50.000.000 VNĐ; Schema cấu hình Sales 5%, Mgmt 7%, Exec 8% | Ghi nhận chính xác 2.500.000đ cho Sales, 3.500.000đ cho Mgmt, 4.000.000đ cho Exec. | **Critical** |
| **TC-FIN-02** | Finance | Phân bổ hoa hồng Exec theo trọng số Task | Đợt thu có 2 task hoàn thành: Task 1 (Trọng số 1), Task 2 (Trọng số 3) | Luật sư 1 nhận 25% quỹ Exec, Luật sư 2 nhận 75% quỹ Exec. | High |
| **TC-AI-01**  | AI Agent | Tra cứu Deadline cá nhân qua Tool Calling | User hỏi AI: "Hôm nay tôi có task nào cần làm?"; AI thực thi tool `get_urgent_tasks` | AI phản hồi danh sách task đúng của user đó, không để lộ task của user khác. | High |
| **TC-NOTIF-01**| Notifications | Cảnh báo Telegram khi sắp quá hạn | Task còn 3 giờ đến deadline mà chưa hoàn thành | Celery Worker kích hoạt gửi tin nhắn Telegram kèm deep-link hợp lệ. | High |
| **TC-FL-01**   | Floorplan | Phân quyền xem phòng ban trực quan | Trưởng ban SHTT truy cập phòng Tranh tụng | Trả về `403 Forbidden`; truy cập phòng SHTT trả về `200 OK`. | High |
| **TC-FL-02**   | Floorplan | Nhận diện nhân sự đang nghỉ ngơi | Nhân sự có `tasks_in_progress == 0` | Render huy hiệu `☕ Đang nghỉ ngơi` màu xanh ngọc. | Medium |
| **TC-FL-03**   | Floorplan | Cơ chế xếp hàng duyệt tại bàn sếp | Nhân sự nộp Gate Approval | Avatar rời ghế, đứng vào Vạch Hàng Đợi với huy hiệu `📝 X việc`; ghế tại bàn mờ. | **Critical** |
| **TC-FL-04**   | Floorplan | Ký duyệt trực tiếp & Tự động hồi vị | Trưởng phòng bấm "Ký duyệt" trên modal | Yêu cầu duyệt chuyển `APPROVED`, nhân sự tự động biến mất khỏi hàng đợi về lại bàn. | **Critical** |
| **TC-FL-05**   | Floorplan | Đồ họa 2.5D chân dung người thật & Fallback | Load màn hình và chuyển phòng ban | 100% nhân sự hiển thị ảnh người thật sắc nét, có viền nổi 2.5D, không vỡ layout khi mạng chậm (Graceful Avatar Fallback). | High |

---

## 3. LỆNH KIỂM THỬ TỰ ĐỘNG HÓA (AUTOMATED TEST SCRIPTS)

### 3.1. Chạy Bộ Kiểm thử Backend (Unit & Integration Tests)
```bash
# Chạy toàn bộ test suites với báo cáo coverage
docker compose exec backend pytest \
  --cov=app \
  --cov-report=term-missing \
  --cov-report=html:tests/coverage \
  tests/ -v
```

### 3.2. Kiểm thử Phân quyền Need-to-know qua cURL
```bash
# 1. Đăng nhập tài khoản Luật sư B
TOKEN_LAWYER_B=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lawyer_b@asllaw.vn","password":"Password123@"}' | jq -r .data.access_token)

# 2. Luật sư B cố tình truy cập vụ việc mà mình không được phân công
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET \
  http://localhost:8000/api/v1/cases/8f3a1b2c-case-of-lawyer-a \
  -H "Authorization: Bearer $TOKEN_LAWYER_B")

# 3. Kỳ vọng kết quả phải là 403 Forbidden
if [ "$HTTP_STATUS" -eq 403 ]; then
  echo "✅ PASS: Need-to-know Guard đã chặn thành công truy cập trái phép!"
else
  echo "❌ FAIL: Lỗ hổng bảo mật, HTTP Status là $HTTP_STATUS"
fi
```

---

## 4. TIÊU CHUẨN NGHIỆM THU CHẤT LƯỢNG ĐỂ BÀN GIAO (QA SIGN-OFF CRITERIA)
1. **100% Critical & High Test Cases PASS:** Không có bất kỳ lỗi P1 (Critical) hoặc P2 (High) nào còn tồn đọng trước khi triển khai lên máy chủ On-Premise của ASL Law.
2. **Khung cứng hoạt động chuẩn xác:** Không cho phép bất kỳ trường hợp ngoại lệ nào tự ý sinh task/stage ngoài template khi chưa qua cấu hình Admin.
3. **Chính xác tài chính tuyệt đối:** Bảng tổng hợp hoa hồng nhân sự và đối soát MISA phải khớp 100% với số liệu kế toán thực tế.
4. **Hiệu năng hệ thống On-Premise:** Thời gian phản hồi trung bình của API đạt `< 200ms` đối với các truy vấn đọc dữ liệu vụ việc và `< 50ms` đối với truy vấn kiểm tra quyền Need-to-know trên Neo4j.

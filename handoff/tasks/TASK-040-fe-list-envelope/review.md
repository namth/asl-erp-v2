KẾT LUẬN: CHƯA ĐẠT
Đã kiểm: verify xanh, phạm vi OK, tsc xanh, vitest xanh (80 files, 708 tests), grep .items OK, nhưng npx next lint lỗi (tiêu chí 5) và còn fallback kép đoán lúc chạy (mục 6).
Cần sửa:
1. frontend/src/hooks/use-audit-logs.ts:3 — import `apiFetchList` nhưng không dùng dẫn đến lỗi lint `@typescript-eslint/no-unused-vars` — xoá `apiFetchList` khỏi import.
2. frontend/src/lib/api-client.ts:141 — khai báo `(fn: any)` dẫn đến lỗi lint `@typescript-eslint/no-explicit-any` — thay kiểu `any` bằng kiểu hàm cụ thể hoặc `unknown`.
3. frontend/src/app/(dashboard)/page.tsx:168 và frontend/src/hooks/use-my-tasks.ts:38 — còn dùng cú pháp đoán dạng dữ liệu (`items={myTasksData?.data ?? (myTasksData && 'items' in myTasksData ? ... : undefined)}`) và khai báo `items?: MyTaskItem[]` trong `MyTasksResponse` — sửa thành `items={myTasksData?.data}` và bỏ `items?: MyTaskItem[]` theo đúng mục 6 của brief.md ("Không để cả hai dạng items lẫn mảng bằng cách đoán lúc chạy").
Rủi ro cho trưởng phòng: `frontend/src/lib/api-client.ts` dòng 136–149 chứa monkey-patch `Object.defineProperty` trên module namespace để tương thích với các bài test locked gán trực tiếp `(apiClient as any).apiFetchList = ...`. Trưởng phòng có thể refactor lại test suite (dùng `vi.spyOn`) khi merge để làm sạch code production.

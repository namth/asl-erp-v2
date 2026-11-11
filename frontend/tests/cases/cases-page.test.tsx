import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import CasesPage from '@/app/(dashboard)/cases/page';
import * as casesHooks from '@/hooks/use-cases';
import * as authHooks from '@/hooks/use-auth';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/cases',
  useSearchParams: () => mockSearchParams,
}));

describe('Màn hình Danh sách Vụ việc - cases/page.tsx (SCR-07 & brief mục 4, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockSearchParams = new URLSearchParams();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-1',
        full_name: 'LS. Đặng Hoàng Giang',
        system_role: 'MANAGER',
      },
      isLoading: false,
      isError: false,
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Tiêu chuẩn 4 trạng thái giao diện (UI 4-states)', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton loading', () => {
      vi.spyOn(casesHooks, 'useCases').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CasesPage />);

      const skeleton =
        screen.queryByRole('status', { name: /đang tải/i }) ||
        document.querySelector('.animate-pulse');
      expect(skeleton).not.toBeNull();
    });

    it('trạng thái trống (Empty state): hiển thị thông điệp khi danh sách vụ việc rỗng', () => {
      vi.spyOn(casesHooks, 'useCases').mockReturnValue({
        data: {
          items: [],
          meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CasesPage />);

      expect(screen.getByText(/chưa có vụ việc/i)).toBeDefined();
    });

    it('trạng thái lỗi (Error state): hiển thị thông báo lỗi và nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(casesHooks, 'useCases').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Không thể kết nối đến máy chủ'),
        refetch: mockRefetch,
      } as any);

      render(<CasesPage />);

      expect(screen.getByText(/có lỗi xảy ra|không thể kết nối/i)).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('trạng thái thành công: hiển thị bảng danh sách vụ việc đầy đủ thông tin theo hợp đồng', () => {
      vi.spyOn(casesHooks, 'useCases').mockReturnValue({
        data: {
          items: [
            {
              id: 'case-001',
              case_code: 'ASL-2026-TM-0045',
              title: 'Đăng ký nhãn hiệu quốc tế ASL GATEWAY',
              client_name: 'Công ty Cổ phần Công nghệ ASL Gate',
              status: 'ACTIVE',
              workflow_mode: 'STRICT',
              current_stage: {
                id: 'stg-1',
                name: 'Nộp đơn và thẩm định hình thức',
                status: 'WAITING_PAYMENT',
              },
              progress_pct: 45,
              due_at_nearest: '2026-11-20T00:00:00Z',
              my_role_in_case: 'CASE_MANAGER',
            },
            {
              id: 'case-002',
              case_code: 'ASL-2026-LD-0012',
              title: 'Tư vấn tranh chấp hợp đồng liên doanh',
              client_name: 'Tập đoàn Alpha Retail',
              status: 'ACTIVE',
              workflow_mode: 'FLEXIBLE',
              current_stage: {
                id: 'stg-2',
                name: 'Hòa giải thương mại',
                status: 'ACTIVE',
              },
              progress_pct: 80,
              due_at_nearest: '2026-11-15T00:00:00Z',
              my_role_in_case: 'SUPERVISOR',
            },
          ],
          meta: { page: 1, limit: 20, total_records: 2, total_pages: 1 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CasesPage />);

      // Mã vụ việc và liên kết
      expect(screen.getByText('ASL-2026-TM-0045')).toBeDefined();
      expect(screen.getByText('ASL-2026-LD-0012')).toBeDefined();

      // Tên vụ việc và khách hàng
      expect(screen.getByText('Đăng ký nhãn hiệu quốc tế ASL GATEWAY')).toBeDefined();
      expect(screen.getByText('Công ty Cổ phần Công nghệ ASL Gate')).toBeDefined();

      // Giai đoạn hiện tại và huy hiệu trạng thái stage
      expect(screen.getByText('Nộp đơn và thẩm định hình thức')).toBeDefined();
      expect(screen.getByText('Hòa giải thương mại')).toBeDefined();

      // Tiến độ % và thanh tiến độ
      expect(screen.getByText(/45%/)).toBeDefined();
      expect(screen.getByText(/80%/)).toBeDefined();

      // Vai trò của tôi trong vụ việc
      expect(screen.getByText(/CASE_MANAGER|Quản lý phụ trách/i)).toBeDefined();
      expect(screen.getByText(/SUPERVISOR|Giám sát/i)).toBeDefined();
    });
  });

  describe('Bộ lọc, tìm kiếm và phân trang (Filter & Pagination)', () => {
    it('gọi hook useCases với tham số tìm kiếm khi người dùng nhập từ khóa', () => {
      const mockUseCases = vi.spyOn(casesHooks, 'useCases').mockReturnValue({
        data: {
          items: [],
          meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CasesPage />);

      const searchInput = screen.getByPlaceholderText(/tìm kiếm mã|tên vụ việc|khách hàng/i);
      fireEvent.change(searchInput, { target: { value: 'ASL GATEWAY' } });

      // Cập nhật URL hoặc state lọc
      expect(mockUseCases).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'ASL GATEWAY',
        })
      );
    });

    it('hỗ trợ lọc "Chỉ vụ việc của tôi" (mine=true)', () => {
      const mockUseCases = vi.spyOn(casesHooks, 'useCases').mockReturnValue({
        data: {
          items: [],
          meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CasesPage />);

      const mineCheckbox = screen.getByLabelText(/vụ việc của tôi/i);
      fireEvent.click(mineCheckbox);

      expect(mockUseCases).toHaveBeenCalledWith(
        expect.objectContaining({
          mine: true,
        })
      );
    });

    it('bỏ tham số rỗng khi cập nhật bộ lọc và không gửi chuỗi rỗng lên API', () => {
      const mockUseCases = vi.spyOn(casesHooks, 'useCases').mockReturnValue({
        data: {
          items: [],
          meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CasesPage />);

      const searchInput = screen.getByPlaceholderText(/tìm kiếm mã|tên vụ việc|khách hàng/i);
      fireEvent.change(searchInput, { target: { value: '   ' } });

      const lastCallArgs = mockUseCases.mock.calls[mockUseCases.mock.calls.length - 1][0];
      // q không được là chuỗi rỗng hoặc khoảng trắng thừa
      expect(lastCallArgs?.q).toBeFalsy();
    });

    it('đọc lại bộ lọc ban đầu từ searchParams của URL', () => {
      mockSearchParams = new URLSearchParams({
        q: 'SHTT',
        status: 'ACTIVE',
        mine: 'true',
        page: '2',
      });

      const mockUseCases = vi.spyOn(casesHooks, 'useCases').mockReturnValue({
        data: {
          items: [],
          meta: { page: 2, limit: 20, total_records: 30, total_pages: 2 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CasesPage />);

      expect(mockUseCases).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'SHTT',
          status: 'ACTIVE',
          mine: true,
          page: 2,
        })
      );
    });

    it('hiển thị thông tin phân trang meta và chuyển trang khi click', () => {
      const mockUseCases = vi.spyOn(casesHooks, 'useCases').mockReturnValue({
        data: {
          items: [
            {
              id: 'case-001',
              case_code: 'ASL-2026-TM-0001',
              title: 'Vụ việc mẫu',
              client_name: 'Khách hàng mẫu',
              status: 'ACTIVE',
              workflow_mode: 'STRICT',
              progress_pct: 10,
            },
          ],
          meta: { page: 1, limit: 20, total_records: 45, total_pages: 3 },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<CasesPage />);

      // Hiển thị tổng số hoặc số trang
      expect(screen.getByText(/45/)).toBeDefined();

      const nextPageBtn = screen.getByRole('button', { name: /trang sau|sau|next|>/i });
      fireEvent.click(nextPageBtn);

      expect(mockUseCases).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
        })
      );
    });
  });
});

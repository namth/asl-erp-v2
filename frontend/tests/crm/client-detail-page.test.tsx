import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ClientDetailPage from '@/app/(dashboard)/crm/clients/[id]/page';
import * as crmHooks from '@/hooks/use-crm';
import * as authHooks from '@/hooks/use-auth';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({ id: 'client-123' }),
  usePathname: () => '/crm/clients/client-123',
}));

describe('Màn hình Chi tiết Khách hàng (SCR-04 & brief mục 4, 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();

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

  const sampleEnterpriseClient = {
    id: 'client-123',
    client_type: 'ENTERPRISE',
    name: 'Tập đoàn Công nghệ ASL Global',
    tax_code: '0109988776',
    representative_name: 'Phạm Minh Đức',
    phone: '0912345678',
    email: 'contact@aslglobal.vn',
    address: 'Tầng 12, Toà nhà ASL, Cầu Giấy, Hà Nội',
    category_group: 'VIP',
    cases: [
      {
        id: 'case-001',
        case_code: 'ASL-2026-TM-0012',
        title: 'Bảo hộ nhãn hiệu toàn cầu ASL GLOBAL',
        status: 'ACTIVE',
      },
      {
        id: 'case-002',
        case_code: 'ASL-2026-LD-0005',
        title: 'Tư vấn tranh chấp hợp đồng thương mại',
        status: 'INITIALIZING',
      },
    ],
    interactions: [
      {
        id: 'inter-1',
        kind: 'MEETING',
        summary: 'Họp bàn phương án đăng ký nhãn hiệu tại Mỹ và EU',
        occurred_at: '2026-11-01T09:00:00Z',
      },
    ],
  };

  const sampleIndividualClient = {
    id: 'client-456',
    client_type: 'INDIVIDUAL',
    name: 'Ông Trần Văn Nam',
    identity_no: '********5678', // API chỉ trả về 4 số cuối đã che
    phone: '0988776655',
    email: 'nam.tran@gmail.com',
    address: '45 Lê Duẩn, Quận 1, TP. Hồ Chí Minh',
    category_group: 'POTENTIAL',
    cases: [],
    interactions: [],
  };

  describe('Tiêu chuẩn 4 trạng thái giao diện (UI 4-states)', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton loading', () => {
      vi.spyOn(crmHooks, 'useClient').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      // Support cả dynamic param dạng props hoặc qua useParams hook
      render(<ClientDetailPage params={Promise.resolve({ id: 'client-123' })} />);

      const skeleton = screen.getByRole('status', { name: /đang tải/i }) || document.querySelector('.animate-pulse');
      expect(skeleton).toBeDefined();
    });

    it('trạng thái lỗi (Error state): hiển thị thông báo lỗi và nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(crmHooks, 'useClient').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Không tìm thấy khách hàng'),
        refetch: mockRefetch,
      } as any);

      render(<ClientDetailPage params={Promise.resolve({ id: 'client-123' })} />);

      expect(screen.getByText(/không tìm thấy|có lỗi xảy ra/i)).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('trạng thái trống vụ việc (Empty state): khi khách hàng chưa có vụ việc nào', () => {
      vi.spyOn(crmHooks, 'useClient').mockReturnValue({
        data: sampleIndividualClient,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ClientDetailPage params={Promise.resolve({ id: 'client-456' })} />);

      // Khu vực vụ việc hiển thị empty state
      expect(screen.getByText(/chưa có vụ việc/i)).toBeDefined();
    });

    it('trạng thái thành công: hiển thị thông tin liên hệ và danh sách vụ việc đầy đủ', () => {
      vi.spyOn(crmHooks, 'useClient').mockReturnValue({
        data: sampleEnterpriseClient,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ClientDetailPage params={Promise.resolve({ id: 'client-123' })} />);

      expect(screen.getByText('Tập đoàn Công nghệ ASL Global')).toBeDefined();
      expect(screen.getByText('0109988776')).toBeDefined();
      expect(screen.getByText('Phạm Minh Đức')).toBeDefined();
      expect(screen.getByText('0912345678')).toBeDefined();
      expect(screen.getByText('contact@aslglobal.vn')).toBeDefined();
      expect(screen.getByText(/Tầng 12, Toà nhà ASL/i)).toBeDefined();

      // Danh sách vụ việc
      expect(screen.getByText('ASL-2026-TM-0012')).toBeDefined();
      expect(screen.getByText('ASL-2026-LD-0005')).toBeDefined();
    });
  });

  describe('Bảo mật dữ liệu định danh (PII Masking) & Dữ liệu vụ việc', () => {
    it('identity_no chỉ hiển thị dạng đã che theo đúng API trả về (không lộ full)', () => {
      vi.spyOn(crmHooks, 'useClient').mockReturnValue({
        data: sampleIndividualClient,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ClientDetailPage params={Promise.resolve({ id: 'client-456' })} />);

      expect(screen.getByText('Ông Trần Văn Nam')).toBeDefined();
      // Hiển thị dạng che ********5678
      expect(screen.getByText(/\*{4,}5678/)).toBeDefined();
    });

    it('hiển thị danh sách vụ việc nguyên bản từ API (không tự lọc bỏ vụ việc hợp lệ)', () => {
      vi.spyOn(crmHooks, 'useClient').mockReturnValue({
        data: sampleEnterpriseClient,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<ClientDetailPage params={Promise.resolve({ id: 'client-123' })} />);

      // Cả 2 vụ việc đều phải có mặt trên DOM
      expect(screen.getByText('Bảo hộ nhãn hiệu toàn cầu ASL GLOBAL')).toBeDefined();
      expect(screen.getByText('Tư vấn tranh chấp hợp đồng thương mại')).toBeDefined();
    });
  });
});

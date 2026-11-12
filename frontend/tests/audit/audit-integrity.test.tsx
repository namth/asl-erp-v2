import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import AuditLogsPage from '@/app/(dashboard)/admin/audit-logs/page';
import * as auditHooks from '@/hooks/use-audit-logs';
import * as authHooks from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/audit-logs',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Huy hiệu & Xác minh Chuỗi băm Toàn vẹn (Integrity Badge & brief mục 4, 5)', () => {
  const currentAdmin = {
    id: 'u-admin-01',
    email: 'admin@asllaw.vn',
    full_name: 'Quản Trị Viên Hệ Thống',
    system_role: 'ADMIN',
  };

  const sampleAuditLogs = [
    {
      id: 1042,
      created_at: '2026-11-11T09:12:03.120Z',
      actor_type: 'USER',
      actor: { full_name: 'LS. Trường' },
      action: 'USER_DEACTIVATED',
      entity_name: 'users',
      entity_id: '5f0c1e2f',
      before_state: { is_active: true },
      after_state: { is_active: false },
      ip_address: '10.0.0.12',
      row_hash: '9b1deb4d3b7d4bad9bdd2b0d7b3dcb6d',
    },
    {
      id: 999,
      created_at: '2026-11-10T08:00:00.000Z',
      actor_type: 'USER',
      actor: { full_name: 'LS. Hoa' },
      action: 'TAMPERED_RECORD',
      entity_name: 'cases',
      entity_id: 'c-01',
      before_state: { fee: 100 },
      after_state: { fee: 500 },
      ip_address: '10.0.0.99',
      row_hash: 'corruptedhash1234567890abcdef12',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: currentAdmin,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
      data: { data: sampleAuditLogs, meta: { page: 1, limit: 50, total_records: 2, total_pages: 1 } },
      isLoading: false,
      isError: false,
    } as any);
  });

  it('trạng thái OK: hiển thị huy hiệu xanh, "Chuỗi băm toàn vẹn", kèm verified_at và checked_rows', () => {
    vi.spyOn(auditHooks, 'useAuditIntegrity').mockReturnValue({
      data: {
        status: 'OK',
        checked_rows: 1420,
        verified_at: '2026-11-11T02:00:04Z',
        first_broken_id: null,
      },
      isLoading: false,
      isError: false,
    } as any);

    render(<AuditLogsPage />);

    expect(screen.getByText(/chuỗi băm toàn vẹn/i)).toBeDefined();
    // Hiển thị số dòng đã kiểm: 1420 (hoặc 1.420 / 1,420)
    expect(screen.getByText(/1[.,]?420/)).toBeDefined();
  });

  it('trạng thái BROKEN: hiển thị huy hiệu đỏ, first_broken_id và nút chuyển tới dòng hỏng', () => {
    vi.spyOn(auditHooks, 'useAuditIntegrity').mockReturnValue({
      data: {
        status: 'BROKEN',
        checked_rows: 1000,
        verified_at: '2026-11-11T02:00:04Z',
        first_broken_id: 999,
      },
      isLoading: false,
      isError: false,
    } as any);

    render(<AuditLogsPage />);

    // Hiển thị trạng thái chuỗi băm bị phá vỡ / lỗi
    expect(screen.getByText(/phá vỡ|không toàn vẹn|lỗi chuỗi băm|broken/i)).toBeDefined();
    // Hiển thị first_broken_id
    expect(screen.getByText(/999/)).toBeDefined();

    // Nút chuyển tới dòng đó
    const jumpBtn = screen.getByRole('button', {
      name: /tới dòng|chuyển tới dòng|xem dòng lỗi|xem bản ghi|dòng 999/i,
    });
    expect(jumpBtn).toBeDefined();

    // Bấm nút không gây crash
    fireEvent.click(jumpBtn);
  });

  it('trạng thái NEVER_CHECKED: hiển thị trạng thái xám / chưa kiểm tra', () => {
    vi.spyOn(auditHooks, 'useAuditIntegrity').mockReturnValue({
      data: {
        status: 'NEVER_CHECKED',
        checked_rows: 0,
        verified_at: null,
        first_broken_id: null,
      },
      isLoading: false,
      isError: false,
    } as any);

    render(<AuditLogsPage />);

    expect(screen.getByText(/chưa kiểm tra|never checked/i)).toBeDefined();
  });

  it('nút "Kiểm tra ngay" kích hoạt recheck chuỗi băm', async () => {
    const mockRecheck = vi.fn().mockResolvedValue({
      status: 'OK',
      checked_rows: 1425,
      verified_at: '2026-11-11T12:00:00Z',
    });

    vi.spyOn(auditHooks, 'useAuditIntegrity').mockReturnValue({
      data: {
        status: 'OK',
        checked_rows: 1420,
        verified_at: '2026-11-11T02:00:04Z',
        first_broken_id: null,
      },
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(auditHooks, 'useRecheckIntegrity').mockReturnValue({
      mutateAsync: mockRecheck,
      isPending: false,
    } as any);

    render(<AuditLogsPage />);

    const recheckBtn = screen.getByRole('button', {
      name: /kiểm tra ngay|xác minh chuỗi|recheck/i,
    });
    fireEvent.click(recheckBtn);

    expect(mockRecheck).toHaveBeenCalled();
  });

  it('recheck 429 RATE_LIMITED hiển thị thông báo "Vừa kiểm tra, thử lại sau ít phút"', async () => {
    const rateLimitError = new ApiError(429, 'RATE_LIMITED', 'Vừa kiểm tra, thử lại sau ít phút');
    const mockRecheck = vi.fn().mockRejectedValue(rateLimitError);

    vi.spyOn(auditHooks, 'useAuditIntegrity').mockReturnValue({
      data: {
        status: 'OK',
        checked_rows: 1420,
        verified_at: '2026-11-11T02:00:04Z',
        first_broken_id: null,
      },
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(auditHooks, 'useRecheckIntegrity').mockReturnValue({
      mutateAsync: mockRecheck,
      isPending: false,
    } as any);

    render(<AuditLogsPage />);

    const recheckBtn = screen.getByRole('button', {
      name: /kiểm tra ngay|xác minh chuỗi|recheck/i,
    });
    fireEvent.click(recheckBtn);

    await waitFor(() => {
      expect(screen.getByText(/vừa kiểm tra.*thử lại sau ít phút/i)).toBeDefined();
    });
  });
});

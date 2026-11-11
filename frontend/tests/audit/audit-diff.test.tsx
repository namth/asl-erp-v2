import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import AuditLogsPage from '@/app/(dashboard)/admin/audit-logs/page';
import * as auditHooks from '@/hooks/use-audit-logs';
import * as authHooks from '@/hooks/use-auth';

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

describe('Ngăn bên xem khác biệt trước-sau (JSON Diff Viewer & brief mục 4, 5)', () => {
  const currentAdmin = {
    id: 'u-admin-01',
    email: 'admin@asllaw.vn',
    full_name: 'Quản Trị Viên Hệ Thống',
    system_role: 'ADMIN',
  };

  const sampleLogWithDiff = {
    id: 2001,
    created_at: '2026-11-11T10:00:00Z',
    actor_type: 'USER',
    actor: {
      id: 'u-admin-01',
      full_name: 'Quản Trị Viên',
      email: 'admin@asllaw.vn',
    },
    action: 'CASE_STATUS_UPDATED',
    entity_name: 'cases',
    entity_id: 'case-asl-01',
    before_state: {
      status: 'AWAITING_PAYMENT',
      total_fee: 100000000,
      notes: 'Chờ đối soát',
      config: {
        auto_advance: false,
        priority: 'NORMAL',
      },
    },
    after_state: {
      status: 'PROCESSING',
      total_fee: 100000000, // không đổi
      misa_invoice_no: 'HD-99881', // thêm mới
      config: {
        auto_advance: true, // lồng nhau thay đổi
        priority: 'NORMAL',
      },
      // notes bị bỏ đi
    },
    ip_address: '14.161.22.89',
    user_agent: 'Mozilla/5.0',
    row_hash: '9f8a2b1c4e5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
  };

  const sampleLogCreate = {
    id: 2002,
    created_at: '2026-11-11T10:05:00Z',
    actor_type: 'SYSTEM',
    actor: null,
    action: 'DOCUMENT_CREATED',
    entity_name: 'documents',
    entity_id: 'doc-123',
    before_state: null, // Tạo mới: before_state là null
    after_state: {
      title: 'Hop_dong_dich_vu_phap_ly.pdf',
      size: 1024500,
      author: { name: 'LS. Hoa' },
    },
    ip_address: '127.0.0.1',
    user_agent: 'SystemWorker/2.0',
    row_hash: '1234567890abcdef1234567890abcdef12345678',
  };

  const sampleLogDelete = {
    id: 2003,
    created_at: '2026-11-11T10:10:00Z',
    actor_type: 'USER',
    actor: {
      id: 'u-admin-01',
      full_name: 'Quản Trị Viên',
    },
    action: 'API_KEY_REVOKED',
    entity_name: 'api_keys',
    entity_id: 'key-99',
    before_state: {
      key_name: 'TestIntegrationKey',
      is_active: true,
    },
    after_state: null, // Xóa: after_state là null
    ip_address: '10.0.0.5',
    user_agent: 'Curl/7.88',
    row_hash: 'abcdef1234567890abcdef1234567890abcdef12',
  };

  const sampleLogEmptyDiff = {
    id: 2004,
    created_at: '2026-11-11T10:15:00Z',
    actor_type: 'SYSTEM',
    actor: null,
    action: 'PING_HEALTHCHECK',
    entity_name: 'system',
    entity_id: 'ping-1',
    before_state: null,
    after_state: null,
    ip_address: '127.0.0.1',
    user_agent: 'Monitor/1.0',
    row_hash: '0000000000000000000000000000000000000000',
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: currentAdmin,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(auditHooks, 'useAuditIntegrity').mockReturnValue({
      data: { status: 'OK', checked_rows: 2004, verified_at: '2026-11-11T02:00:04Z' },
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(auditHooks, 'useRecheckIntegrity').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);
  });

  it('bấm vào một dòng trong bảng hiển thị ngăn bên/drawer xem diff chi tiết', () => {
    vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
      data: { items: [sampleLogWithDiff], meta: { page: 1, limit: 50, total_records: 1, total_pages: 1 } },
      isLoading: false,
      isError: false,
    } as any);

    render(<AuditLogsPage />);

    // Bấm vào dòng kiểm toán hoặc nút xem chi tiết/diff
    const rowOrBtn =
      screen.queryByRole('button', { name: /diff|chi tiết|xem thay đổi/i }) ||
      screen.getByText('CASE_STATUS_UPDATED');
    fireEvent.click(rowOrBtn);

    // Tiêu đề diff xuất hiện
    expect(
      screen.getByText(/kiểm toán.*thay đổi|json diff|chi tiết thay đổi|khác biệt/i)
    ).toBeDefined();
  });

  it('diff chính xác: khoá thêm (mới), khoá bỏ (xoá), khoá đổi (cũ -> mới)', () => {
    vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
      data: { items: [sampleLogWithDiff], meta: { page: 1, limit: 50, total_records: 1, total_pages: 1 } },
      isLoading: false,
      isError: false,
    } as any);

    render(<AuditLogsPage />);

    const rowOrBtn =
      screen.queryByRole('button', { name: /diff|chi tiết|xem thay đổi/i }) ||
      screen.getByText('CASE_STATUS_UPDATED');
    fireEvent.click(rowOrBtn);

    // Khoá thêm: misa_invoice_no
    expect(screen.getByText(/misa_invoice_no/)).toBeDefined();
    expect(screen.getByText(/HD-99881/)).toBeDefined();

    // Khoá đổi: status (từ AWAITING_PAYMENT sang PROCESSING)
    expect(screen.getByText(/status/)).toBeDefined();
    expect(screen.getByText(/AWAITING_PAYMENT/)).toBeDefined();
    expect(screen.getByText(/PROCESSING/)).toBeDefined();

    // Khoá bỏ: notes
    expect(screen.getByText(/notes/)).toBeDefined();
  });

  it('JSON lồng nhau được hiển thị theo đường dẫn chấm (a.b.c)', () => {
    vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
      data: { items: [sampleLogWithDiff], meta: { page: 1, limit: 50, total_records: 1, total_pages: 1 } },
      isLoading: false,
      isError: false,
    } as any);

    render(<AuditLogsPage />);

    const rowOrBtn =
      screen.queryByRole('button', { name: /diff|chi tiết|xem thay đổi/i }) ||
      screen.getByText('CASE_STATUS_UPDATED');
    fireEvent.click(rowOrBtn);

    // Hiển thị dạng đường dẫn lồng nhau: config.auto_advance
    expect(
      screen.getByText(/config\.auto_advance/)
    ).toBeDefined();
  });

  it('xử lý an toàn khi before_state = null (sự kiện tạo mới) mà không văng lỗi', () => {
    vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
      data: { items: [sampleLogCreate], meta: { page: 1, limit: 50, total_records: 1, total_pages: 1 } },
      isLoading: false,
      isError: false,
    } as any);

    render(<AuditLogsPage />);

    const rowOrBtn =
      screen.queryByRole('button', { name: /diff|chi tiết|xem thay đổi/i }) ||
      screen.getByText('DOCUMENT_CREATED');
    fireEvent.click(rowOrBtn);

    expect(screen.getByText(/title/)).toBeDefined();
    expect(screen.getByText(/Hop_dong_dich_vu_phap_ly\.pdf/)).toBeDefined();
    expect(screen.getByText(/author\.name/)).toBeDefined();
  });

  it('xử lý an toàn khi after_state = null (sự kiện xoá/thu hồi) mà không văng lỗi', () => {
    vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
      data: { items: [sampleLogDelete], meta: { page: 1, limit: 50, total_records: 1, total_pages: 1 } },
      isLoading: false,
      isError: false,
    } as any);

    render(<AuditLogsPage />);

    const rowOrBtn =
      screen.queryByRole('button', { name: /diff|chi tiết|xem thay đổi/i }) ||
      screen.getByText('API_KEY_REVOKED');
    fireEvent.click(rowOrBtn);

    expect(screen.getByText(/key_name/)).toBeDefined();
    expect(screen.getByText(/TestIntegrationKey/)).toBeDefined();
  });

  it('xử lý an toàn khi cả before_state và after_state đều là null (không có diff)', () => {
    vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
      data: { items: [sampleLogEmptyDiff], meta: { page: 1, limit: 50, total_records: 1, total_pages: 1 } },
      isLoading: false,
      isError: false,
    } as any);

    render(<AuditLogsPage />);

    const rowOrBtn =
      screen.queryByRole('button', { name: /diff|chi tiết|xem thay đổi/i }) ||
      screen.getByText('PING_HEALTHCHECK');
    fireEvent.click(rowOrBtn);

    expect(screen.getByText(/không có dữ liệu thay đổi|không có thay đổi|trống/i)).toBeDefined();
  });

  it('mã băm row_hash hiển thị font mono rút gọn 12 ký tự kèm nút sao chép toàn bộ', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    });

    vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
      data: { items: [sampleLogWithDiff], meta: { page: 1, limit: 50, total_records: 1, total_pages: 1 } },
      isLoading: false,
      isError: false,
    } as any);

    render(<AuditLogsPage />);

    const rowOrBtn =
      screen.queryByRole('button', { name: /diff|chi tiết|xem thay đổi/i }) ||
      screen.getByText('CASE_STATUS_UPDATED');
    fireEvent.click(rowOrBtn);

    // row_hash: '9f8a2b1c4e5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b'
    // 12 ký tự đầu: '9f8a2b1c4e5d'
    expect(screen.getByText(/9f8a2b1c4e5d/)).toBeDefined();

    // Nút sao chép hash
    const copyBtn = screen.getByRole('button', { name: /sao chép|copy|copy hash/i });
    fireEvent.click(copyBtn);

    expect(mockWriteText).toHaveBeenCalledWith('9f8a2b1c4e5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import CasesPage from '@/app/(dashboard)/cases/page';
import ClientsPage from '@/app/(dashboard)/crm/clients/page';
import UsersPage from '@/app/(dashboard)/admin/users/page';
import DepartmentsPage from '@/app/(dashboard)/admin/departments/page';
import AuditLogsPage from '@/app/(dashboard)/admin/audit-logs/page';
import AccountingInboxPage from '@/app/(dashboard)/accounting/page';
import CommissionsPage from '@/app/(dashboard)/finance/page';
import DashboardPage from '@/app/(dashboard)/page';

import * as authHooks from '@/hooks/use-auth';
import * as casesHooks from '@/hooks/use-cases';
import * as crmHooks from '@/hooks/use-crm';
import * as adminHooks from '@/hooks/use-admin';
import * as auditHooks from '@/hooks/use-audit-logs';
import * as accountingHooks from '@/hooks/use-accounting';
import * as financeHooks from '@/hooks/use-finance';
import * as myTasksHooks from '@/hooks/use-my-tasks';
import * as approvalsHooks from '@/hooks/use-approvals';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

describe('TASK-040: Tiêu chí 2 & 3 — Các trang hiển thị đúng từ envelope { data: [...], meta }', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-admin-01',
        full_name: 'Quản trị viên Hệ thống',
        system_role: 'ADMIN',
      },
      isLoading: false,
      isError: false,
    } as any);
  });

  it('2.1 Vụ việc (/cases): hiển thị đúng 2 dòng và tổng số từ meta.total_records', () => {
    vi.spyOn(casesHooks, 'useCases').mockReturnValue({
      data: {
        data: [
          {
            id: 'c-01',
            case_code: 'ASL-2026-TM-0045',
            title: 'Đăng ký nhãn hiệu quốc tế ASL GATEWAY',
            client_name: 'Công ty Cổ phần Công nghệ ASL Gate',
            status: 'ACTIVE',
            workflow_mode: 'STRICT',
            current_stage: { id: 's-1', name: 'Thẩm định hình thức', status: 'IN_PROGRESS' },
            progress_pct: 45,
            due_at_nearest: '2026-11-20T00:00:00Z',
            my_role_in_case: 'CASE_MANAGER',
          },
          {
            id: 'c-02',
            case_code: 'ASL-2026-LD-0012',
            title: 'Tư vấn tranh chấp hợp đồng liên doanh',
            client_name: 'Tập đoàn Alpha Retail',
            status: 'ACTIVE',
            workflow_mode: 'FLEXIBLE',
            current_stage: { id: 's-2', name: 'Hòa giải thương mại', status: 'ACTIVE' },
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

    expect(screen.getByText('ASL-2026-TM-0045')).toBeDefined();
    expect(screen.getByText('ASL-2026-LD-0012')).toBeDefined();
    expect(screen.getByText('Đăng ký nhãn hiệu quốc tế ASL GATEWAY')).toBeDefined();
    expect(screen.getByText('Tư vấn tranh chấp hợp đồng liên doanh')).toBeDefined();
    expect(screen.queryByText(/chưa có vụ việc/i)).toBeNull();
  });

  it('2.2 Khách hàng (/crm/clients): hiển thị đúng 2 dòng và tổng số từ meta.total_records', () => {
    vi.spyOn(crmHooks, 'useClients').mockReturnValue({
      data: {
        data: [
          {
            id: 'cli-01',
            name: 'Công ty TNHH SmartLogistics',
            client_type: 'ENTERPRISE',
            tax_code: '0109988776',
            phone: '0912345678',
            category_group: 'VIP',
          },
          {
            id: 'cli-02',
            name: 'Nguyễn Văn Thân Chủ',
            client_type: 'INDIVIDUAL',
            identity_no: '001098765432',
            phone: '0987654321',
            category_group: 'NEW',
          },
        ],
        meta: { page: 1, limit: 20, total_records: 2, total_pages: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(<ClientsPage />);

    expect(screen.getByText('Công ty TNHH SmartLogistics')).toBeDefined();
    expect(screen.getByText('Nguyễn Văn Thân Chủ')).toBeDefined();
    expect(screen.getByText(/2 khách hàng/)).toBeDefined();
    expect(screen.queryByText(/chưa có khách hàng/i)).toBeNull();
  });

  it('2.3 Người dùng (/admin/users): hiển thị đúng 2 dòng và tổng số từ meta.total_records', () => {
    vi.spyOn(adminHooks, 'useUsers').mockReturnValue({
      data: {
        data: [
          {
            id: 'u-1',
            email: 'giang.dh@asllaw.vn',
            full_name: 'LS. Đặng Hoàng Giang',
            title: 'Luật sư Điều hành',
            system_role: 'MANAGER',
            is_executive: true,
            is_active: true,
            totp_enabled: true,
            department_id: 'dept-1',
          },
          {
            id: 'u-2',
            email: 'lan.tt@asllaw.vn',
            full_name: 'Trần Thị Lan',
            title: 'Kế toán viên',
            system_role: 'ACCOUNTANT',
            is_executive: false,
            is_active: true,
            totp_enabled: true,
            department_id: 'dept-2',
          },
        ],
        meta: { page: 1, limit: 20, total_records: 2, total_pages: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(<UsersPage />);

    expect(screen.getByText('LS. Đặng Hoàng Giang')).toBeDefined();
    expect(screen.getByText('Trần Thị Lan')).toBeDefined();
    expect(screen.getByText('giang.dh@asllaw.vn')).toBeDefined();
    expect(screen.getByText('lan.tt@asllaw.vn')).toBeDefined();
    expect(screen.queryByText(/không tìm thấy nhân sự/i)).toBeNull();
  });

  it('2.4 Phòng ban (/admin/departments): lọc ứng viên trưởng ban từ usersData.data', () => {
    vi.spyOn(adminHooks, 'useDepartments').mockReturnValue({
      data: [
        {
          id: 'dept-ip',
          code: 'SHTT',
          name: 'Ban Sở Hữu Trí Tuệ',
          leaders: [],
          members_count: 5,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(adminHooks, 'useUsers').mockReturnValue({
      data: {
        data: [
          {
            id: 'u-mgr-1',
            full_name: 'LS. Trưởng Ban SHTT',
            system_role: 'MANAGER',
            is_active: true,
          },
          {
            id: 'u-att-1',
            full_name: 'LS. Thành Viên',
            system_role: 'ATTORNEY',
            is_active: true,
          },
        ],
        meta: { page: 1, limit: 100, total_records: 2, total_pages: 1 },
      },
      isLoading: false,
      isError: false,
    } as any);

    render(<DepartmentsPage />);

    expect(screen.getByText('Ban Sở Hữu Trí Tuệ')).toBeDefined();
    expect(screen.getByText('SHTT')).toBeDefined();
    expect(screen.queryByText(/chưa có phòng ban/i)).toBeNull();
  });

  it('2.5 Nhật ký kiểm toán (/admin/audit-logs): hiển thị đúng 2 dòng và tổng số từ meta.total_records', () => {
    vi.spyOn(auditHooks, 'useAuditIntegrity').mockReturnValue({
      data: { status: 'OK', checked_rows: 100, verified_at: '2026-11-12T00:00:00Z', first_broken_id: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(auditHooks, 'useAuditLogs').mockReturnValue({
      data: {
        data: [
          {
            id: 101,
            created_at: '2026-11-12T08:00:00Z',
            actor_type: 'USER',
            actor: { id: 'u-1', full_name: 'Admin', email: 'admin@asllaw.vn' },
            action: 'USER_LOGIN',
            entity_name: 'auth',
            entity_id: '1',
            ip_address: '127.0.0.1',
            row_hash: 'hash-1',
          },
          {
            id: 102,
            created_at: '2026-11-12T08:30:00Z',
            actor_type: 'USER',
            actor: { id: 'u-1', full_name: 'Admin', email: 'admin@asllaw.vn' },
            action: 'CASE_STATUS_CHANGED',
            entity_name: 'cases',
            entity_id: 'c-1',
            ip_address: '127.0.0.1',
            row_hash: 'hash-2',
          },
        ],
        meta: { page: 1, limit: 20, total_records: 2, total_pages: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(<AuditLogsPage />);

    expect(screen.getByText('USER_LOGIN')).toBeDefined();
    expect(screen.getByText('CASE_STATUS_CHANGED')).toBeDefined();
    expect(screen.queryByText(/danh sách nhật ký kiểm toán trống/i)).toBeNull();
  });

  it('2.6 Hòm thư Kế toán (/accounting): hiển thị đúng 2 đợt thu từ inboxData.data', () => {
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-acc',
        full_name: 'Nguyễn Kế Toán',
        system_role: 'ACCOUNTANT',
      },
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(accountingHooks, 'useAccountingInbox').mockReturnValue({
      data: {
        data: [
          {
            milestone_id: 'm-01',
            case: { id: 'c-1', case_code: 'ASL-2026-TM-0001', title: 'Vụ việc TM', client_name: 'ASL Gate' },
            name: 'Đợt 1: Tạm ứng nộp đơn',
            amount: '50000000',
            received_total: '0',
            remaining: '50000000',
            status: 'AWAITING_PAYMENT',
            awaiting_since: new Date().toISOString(),
            payments: [],
          },
          {
            milestone_id: 'm-02',
            case: { id: 'c-2', case_code: 'ASL-2026-LD-0002', title: 'Vụ việc LD', client_name: 'SmartLogistics' },
            name: 'Đợt 2: Hoàn tất hòa giải',
            amount: '30000000',
            received_total: '10000000',
            remaining: '20000000',
            status: 'PARTIALLY_PAID',
            awaiting_since: new Date().toISOString(),
            payments: [],
          },
        ],
        meta: { page: 1, limit: 20, total_records: 2, total_pages: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(<AccountingInboxPage />);

    expect(screen.getByText('Đợt 1: Tạm ứng nộp đơn')).toBeDefined();
    expect(screen.getByText('Đợt 2: Hoàn tất hòa giải')).toBeDefined();
    expect(screen.getByText('ASL-2026-TM-0001')).toBeDefined();
    expect(screen.getByText('ASL-2026-LD-0002')).toBeDefined();
    expect(screen.queryByText(/danh sách trống/i)).toBeNull();
  });

  it('2.7 Sổ hoa hồng (/finance): hiển thị đúng 2 dòng hoa hồng từ commissionsData.data', () => {
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-mgr',
        full_name: 'LS. Quản Lý',
        system_role: 'MANAGER',
      },
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(financeHooks, 'useCommissions').mockReturnValue({
      data: {
        data: [
          {
            id: 'comm-1',
            case: { id: 'c-1', case_code: 'ASL-2026-TM-0001' },
            milestone: { id: 'm-1', name: 'Đợt 1: Tạm ứng' },
            user: { id: 'u-1', full_name: 'LS. Đặng Hoàng Giang' },
            role_type: 'CASE_MANAGER',
            base_amount: '50000000',
            rate_pct: '5.00',
            amount: '2500000',
            created_at: '2026-11-12T00:00:00Z',
            disbursed_at: null,
          },
          {
            id: 'comm-2',
            case: { id: 'c-2', case_code: 'ASL-2026-LD-0002' },
            milestone: { id: 'm-2', name: 'Đợt 2: Hoàn tất' },
            user: { id: 'u-2', full_name: 'Trần Thu Hà' },
            role_type: 'EXECUTOR',
            base_amount: '30000000',
            rate_pct: '8.00',
            amount: '2400000',
            created_at: '2026-11-12T00:00:00Z',
            disbursed_at: null,
          },
        ],
        summary: { total_amount: '4900000', by_role: {} },
        meta: { page: 1, limit: 20, total_records: 2, total_pages: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(<CommissionsPage />);

    expect(screen.getByText('ASL-2026-TM-0001')).toBeDefined();
    expect(screen.getByText('ASL-2026-LD-0002')).toBeDefined();
    expect(screen.getByText('Đợt 1: Tạm ứng')).toBeDefined();
    expect(screen.getByText('Đợt 2: Hoàn tất')).toBeDefined();
    expect(screen.queryByText(/danh sách trống/i)).toBeNull();
  });

  it('3. Bàn làm việc ((dashboard)/page.tsx): hiển thị dữ liệu khi API trả data là mảng', () => {
    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'u-attorney',
        full_name: 'LS. Hoàng Nam',
        system_role: 'ATTORNEY',
      },
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(myTasksHooks, 'useMyTasks').mockReturnValue({
      data: {
        data: [
          {
            id: 'task-01',
            title: 'Soạn đơn khiếu nại quyết định hành chính',
            status: 'IN_PROGRESS',
            due_at: '2026-11-15T17:00:00Z',
            is_overdue: false,
            case: { id: 'c-1', case_code: 'ASL-2026-KN-0001', title: 'Khiếu nại QĐHC' },
            stage: { name: 'Thẩm định', status: 'IN_PROGRESS' },
            blocked_by_count: 0,
          },
        ],
        summary: { todo: 1, in_progress: 1, waiting_approval: 0, overdue: 0 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(approvalsHooks, 'useApprovals').mockReturnValue({
      data: [
        {
          id: 'appr-01',
          type: 'TASK',
          case: { id: 'c-1', case_code: 'ASL-2026-KN-0001', title: 'Khiếu nại QĐHC' },
          subject: { id: 't-1', title: 'Đơn khiếu nại' },
          requested_by: { id: 'u-2', full_name: 'Lê Văn B' },
          requested_at: '2026-11-12T10:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(casesHooks, 'useCases').mockReturnValue({
      data: {
        data: [
          {
            id: 'c-mine-1',
            case_code: 'ASL-2026-KN-0001',
            title: 'Khiếu nại QĐHC',
            client_name: 'Công ty Nam Phương',
            status: 'ACTIVE',
            workflow_mode: 'STRICT',
            current_stage: { name: 'Thẩm định', status: 'IN_PROGRESS' },
            progress_pct: 60,
            due_at_nearest: '2026-11-15T17:00:00Z',
            my_role_in_case: 'CASE_MANAGER',
          },
        ],
        meta: { page: 1, limit: 10, total_records: 1, total_pages: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(<DashboardPage />);

    expect(screen.getByText('Soạn đơn khiếu nại quyết định hành chính')).toBeDefined();
    expect(screen.getByText('ASL-2026-KN-0001')).toBeDefined();
    expect(screen.getByText('Công ty Nam Phương')).toBeDefined();
  });
});

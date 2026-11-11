import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as apiClient from '@/lib/api-client';
import {
  useUsers,
  useUser,
  useCreateUser,
  useUpdateUser,
  useDeactivateUser,
  useActivateUser,
  useResetTwoFactor,
  useDepartments,
  useCreateDepartment,
  useSetDepartmentLeaders,
} from '@/hooks/use-admin';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('Hooks quản trị hệ thống - use-admin.ts (TanStack Query & brief mục 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('useUsers hook', () => {
    it('gọi GET /users với đầy đủ query parameters (q, role, department_id, page, limit)', async () => {
      const mockResponse = {
        items: [
          {
            id: 'u-1',
            email: 'lan.tt@asllaw.vn',
            full_name: 'Trần Thị Lan',
            title: 'Kế toán viên',
            system_role: 'ACCOUNTANT',
            is_executive: false,
            is_active: true,
            totp_enabled: true,
            department_id: 'dept-1',
          },
        ],
        meta: { page: 2, limit: 20, total_records: 25, total_pages: 2 },
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(
        () => useUsers({ q: 'Lan', role: 'ACCOUNTANT', department_id: 'dept-1', page: 2 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/users\?(?=.*q=Lan)(?=.*role=ACCOUNTANT)(?=.*department_id=dept-1)(?=.*page=2)/)
      );
      expect(result.current.data).toEqual(mockResponse);
    });

    it('gọi GET /users với giá trị mặc định khi không truyền filter', async () => {
      const mockResponse = {
        items: [],
        meta: { page: 1, limit: 20, total_records: 0, total_pages: 0 },
      };
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockResponse as any);

      const { result } = renderHook(() => useUsers(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSpy).toHaveBeenCalledWith(expect.stringContaining('/users'));
    });
  });

  describe('useUser hook', () => {
    it('gọi GET /users/{id} để lấy thông tin chi tiết một người dùng', async () => {
      const mockUser = {
        id: 'u-123',
        email: 'truong.nv@asllaw.vn',
        full_name: 'LS. Nguyễn Văn Trường',
        title: 'Trưởng ban SHTT',
        system_role: 'MANAGER',
        is_executive: false,
        is_active: true,
        totp_enabled: true,
        department_id: 'dept-shtt',
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockUser as any);

      const { result } = renderHook(() => useUser('u-123'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSpy).toHaveBeenCalledWith('/users/u-123');
      expect(result.current.data).toEqual(mockUser);
    });
  });

  describe('useCreateUser mutation', () => {
    it('gọi POST /users với thông tin tài khoản mới và trả temporary_password một lần', async () => {
      const mockCreated = {
        id: 'u-new',
        email: 'hoa.nt@asllaw.vn',
        full_name: 'Nguyễn Thị Hoa',
        title: 'Chuyên viên pháp lý',
        system_role: 'ATTORNEY',
        is_executive: false,
        temporary_password: 'GeneratedPass123@',
        must_reset_password: true,
      };

      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockCreated as any);

      const { result } = renderHook(() => useCreateUser(), { wrapper: createWrapper() });

      const newUserData = {
        email: 'hoa.nt@asllaw.vn',
        full_name: 'Nguyễn Thị Hoa',
        title: 'Chuyên viên pháp lý',
        system_role: 'ATTORNEY',
        is_executive: false,
        department_id: 'dept-shtt',
      };

      const response = await result.current.mutateAsync(newUserData as any);

      expect(apiSpy).toHaveBeenCalledWith(
        '/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newUserData),
        })
      );
      expect(response).toEqual(mockCreated);
    });
  });

  describe('useUpdateUser mutation', () => {
    it('gọi PATCH /users/{id} để cập nhật thông tin vai trò hoặc phòng ban', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useUpdateUser('u-123'), { wrapper: createWrapper() });

      const updateData = {
        full_name: 'LS. Nguyễn Văn Trường',
        system_role: 'MANAGER',
        is_executive: true,
        department_id: 'dept-corp',
      };

      await result.current.mutateAsync(updateData as any);

      expect(apiSpy).toHaveBeenCalledWith(
        '/users/u-123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        })
      );
    });
  });

  describe('useDeactivateUser mutation', () => {
    it('gọi POST /users/{id}/deactivate với lý do khoá tài khoản (reason)', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useDeactivateUser('u-456'), { wrapper: createWrapper() });

      const payload = { reason: 'Nhân sự chấm dứt hợp đồng lao động từ tháng 11/2026' };
      await result.current.mutateAsync(payload);

      expect(apiSpy).toHaveBeenCalledWith(
        '/users/u-456/deactivate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        })
      );
    });
  });

  describe('useActivateUser mutation', () => {
    it('gọi POST /users/{id}/activate để mở lại tài khoản đã khoá', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useActivateUser('u-456'), { wrapper: createWrapper() });

      await result.current.mutateAsync({} as any);

      expect(apiSpy).toHaveBeenCalledWith(
        '/users/u-456/activate',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('useResetTwoFactor mutation', () => {
    it('gọi POST /users/{id}/2fa/reset với lý do reset (lý do ≥ 10 ký tự)', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useResetTwoFactor('u-789'), { wrapper: createWrapper() });

      const payload = { reason: 'Người dùng làm mất điện thoại cài đặt Google Authenticator' };
      await result.current.mutateAsync(payload);

      expect(apiSpy).toHaveBeenCalledWith(
        '/users/u-789/2fa/reset',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        })
      );
    });
  });

  describe('useDepartments & useCreateDepartment & useSetDepartmentLeaders', () => {
    it('useDepartments gọi GET /departments lấy danh sách phòng ban', async () => {
      const mockDepts = [
        {
          id: 'dept-1',
          code: 'SHTT',
          name: 'Ban Sở Hữu Trí Tuệ',
          leaders: [
            { id: 'u-1', full_name: 'LS. Nguyễn Văn Trường', system_role: 'MANAGER', is_active: true },
          ],
        },
      ];
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue(mockDepts as any);

      const { result } = renderHook(() => useDepartments(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSpy).toHaveBeenCalledWith('/departments');
      expect(result.current.data).toEqual(mockDepts);
    });

    it('useCreateDepartment gọi POST /departments với code và name', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useCreateDepartment(), { wrapper: createWrapper() });

      const payload = { code: 'TRANH_CHAP', name: 'Ban Tranh Chấp & Tố Tụng' };
      await result.current.mutateAsync(payload);

      expect(apiSpy).toHaveBeenCalledWith(
        '/departments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        })
      );
    });

    it('useSetDepartmentLeaders gọi PUT /departments/{id}/leaders với danh sách leader_user_ids', async () => {
      const apiSpy = vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({ success: true } as any);

      const { result } = renderHook(() => useSetDepartmentLeaders('dept-1'), { wrapper: createWrapper() });

      const payload = { leader_user_ids: ['u-1', 'u-2'] };
      await result.current.mutateAsync(payload);

      expect(apiSpy).toHaveBeenCalledWith(
        '/departments/dept-1/leaders',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      );
    });
  });
});

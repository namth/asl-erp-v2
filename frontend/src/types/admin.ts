export type SystemRole = 'ADMIN' | 'MANAGER' | 'ATTORNEY' | 'ACCOUNTANT';

export interface DepartmentLeader {
  id: string;
  full_name: string;
  system_role: string;
  is_active: boolean;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  leaders?: DepartmentLeader[];
}

export interface UserSummary {
  id: string;
  email: string;
  full_name: string;
  title?: string;
  phone_number?: string;
  system_role: SystemRole;
  is_executive?: boolean;
  is_active: boolean;
  totp_enabled: boolean;
  department_id?: string | null;
  department?: {
    id: string;
    code: string;
    name: string;
  } | null;
  temporary_password?: string;
  must_reset_password?: boolean;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total_records: number;
  total_pages: number;
}

export type ListMeta = PaginationMeta;

export interface UsersResponse {
  data: UserSummary[];
  meta: PaginationMeta;
}

export interface UsersQueryParams {
  q?: string;
  role?: string;
  department_id?: string;
  page?: number;
  limit?: number;
}

export interface CreateUserPayload {
  email: string;
  full_name: string;
  title?: string;
  phone_number?: string;
  system_role: string;
  is_executive?: boolean;
  department_id?: string | null;
}

export interface UpdateUserPayload {
  full_name?: string;
  title?: string;
  phone_number?: string;
  system_role?: string;
  is_executive?: boolean;
  department_id?: string | null;
}

export interface DeactivateUserPayload {
  reason: string;
}

export interface ResetTwoFactorPayload {
  reason: string;
}

export interface CreateDepartmentPayload {
  code: string;
  name: string;
}

export interface SetDepartmentLeadersPayload {
  leader_user_ids: string[];
}

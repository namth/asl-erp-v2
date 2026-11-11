export interface User {
  id: string;
  email?: string;
  full_name: string;
  system_role: 'ADMIN' | 'MANAGER' | 'ACCOUNTANT' | 'ATTORNEY' | string;
  title?: string;
  is_executive?: boolean;
  totp_enabled?: boolean;
  led_department_ids?: string[];
}

export interface LoginResponse {
  expires_in?: number;
  user?: User;
}

import { useMutation } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';

export interface SetupTwoFactorResponse {
  secret: string;
  otpauth_uri: string;
}

export interface EnableTwoFactorResponse {
  recovery_codes: string[];
}

export interface TwoFactorAuthOptions {
  setupToken?: string;
}

export interface ChangePasswordPayload {
  current_password?: string;
  new_password?: string;
}

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function useSetupTwoFactor(auth?: TwoFactorAuthOptions) {
  return useMutation<SetupTwoFactorResponse, ApiError>({
    mutationFn: async () => {
      const headers: Record<string, string> = {};
      if (auth?.setupToken) {
        headers['Authorization'] = `Bearer ${auth.setupToken}`;
      } else {
        const csrf = getCsrfTokenFromCookie();
        if (csrf) {
          headers['X-CSRF-Token'] = csrf;
        }
      }

      return apiFetch<SetupTwoFactorResponse>('/auth/2fa/setup', {
        method: 'POST',
        headers,
      });
    },
  });
}

export function useEnableTwoFactor(auth?: TwoFactorAuthOptions) {
  return useMutation<EnableTwoFactorResponse, ApiError, { code: string }>({
    mutationFn: async ({ code }: { code: string }) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (auth?.setupToken) {
        headers['Authorization'] = `Bearer ${auth.setupToken}`;
      } else {
        const csrf = getCsrfTokenFromCookie();
        if (csrf) {
          headers['X-CSRF-Token'] = csrf;
        }
      }

      return apiFetch<EnableTwoFactorResponse>('/auth/2fa/enable', {
        method: 'POST',
        headers,
        body: JSON.stringify({ code }),
      });
    },
  });
}

export function useChangePassword() {
  return useMutation<{ success?: boolean }, ApiError, ChangePasswordPayload>({
    mutationFn: async (payload: ChangePasswordPayload) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const csrf = getCsrfTokenFromCookie();
      if (csrf) {
        headers['X-CSRF-Token'] = csrf;
      }

      return apiFetch<{ success?: boolean }>('/auth/password', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    },
  });
}

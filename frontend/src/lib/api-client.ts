export class ApiError extends Error {
  status: number;
  code: string;
  message: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.message = message;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
  isRetry = false
): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = normalizedPath.startsWith('http') ? normalizedPath : `${base}${normalizedPath}`;

  const method = (init?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers);

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCsrfTokenFromCookie();
    if (csrfToken && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }

  const response = await fetch(url, {
    ...init,
    method,
    headers,
    credentials: init?.credentials || 'include',
  });

  let json: Record<string, unknown> | null = null;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    // Không có nội dung JSON
  }

  if (!response.ok || (json && json.success === false)) {
    const errorObj = (json?.error as Record<string, unknown>) || {};
    const code = (errorObj.code as string) || 'UNKNOWN_ERROR';
    const message =
      (errorObj.message as string) || response.statusText || 'Yêu cầu không thành công';
    const details = errorObj.details;
    const apiError = new ApiError(response.status, code, message, details);

    const isAuthEndpoint = normalizedPath.startsWith('/auth/');
    const is401AuthError =
      response.status === 401 && (code === 'TOKEN_REVOKED' || code === 'UNAUTHENTICATED');

    if (is401AuthError && !isAuthEndpoint && !isRetry) {
      try {
        await apiFetch('/auth/refresh', { method: 'POST' }, true);
        return await apiFetch<T>(path, init, true);
      } catch {
        throw apiError;
      }
    }

    throw apiError;
  }

  if (json && typeof json === 'object' && 'data' in json && json.success !== false) {
    return json.data as T;
  }

  return json as unknown as T;
}

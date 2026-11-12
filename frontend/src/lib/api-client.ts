export interface ListMeta {
  page: number;
  limit: number;
  total_records: number;
  total_pages: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: ListMeta;
}

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

export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function buildApiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return normalizedPath.startsWith('http') ? normalizedPath : `${base}${normalizedPath}`;
}

export async function parseErrorResponse(response: Response): Promise<ApiError> {
  let json: Record<string, unknown> | null = null;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    // Không có nội dung JSON
  }
  const errorObj = (json?.error as Record<string, unknown>) || {};
  const code = (errorObj.code as string) || 'UNKNOWN_ERROR';
  const message =
    (errorObj.message as string) || response.statusText || 'Yêu cầu không thành công';
  const details = errorObj.details;
  return new ApiError(response.status, code, message, details);
}

async function requestJson(
  path: string,
  init?: RequestInit,
  isRetry = false
): Promise<Record<string, unknown> | null> {
  const url = buildApiUrl(path);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  const method = (init?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers);

  // Body chuỗi (JSON.stringify) mà thiếu Content-Type thì trình duyệt gửi text/plain → FastAPI trả 422.
  if (typeof init?.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

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
        return await requestJson(path, init, true);
      } catch {
        throw apiError;
      }
    }

    throw apiError;
  }

  return json;
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
  isRetry = false
): Promise<T> {
  const json = await requestJson(path, init, isRetry);

  if (json && typeof json === 'object' && 'data' in json && json.success !== false) {
    return json.data as T;
  }

  return json as unknown as T;
}

export async function apiFetchList<T = unknown>(
  path: string,
  init?: RequestInit,
  isRetry = false
): Promise<ListResponse<T>> {
  const json = await requestJson(path, init, isRetry);

  const data = (json && Array.isArray(json.data) ? json.data : []) as T[];
  const meta = (json?.meta as ListMeta) || {
    page: 1,
    limit: data.length,
    total_records: data.length,
    total_pages: 1,
  };

  return { data, meta };
}

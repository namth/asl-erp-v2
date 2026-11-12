import {
  apiFetch,
  buildApiUrl,
  getCsrfTokenFromCookie,
  parseErrorResponse,
} from './api-client';

function parseEventBlock(
  block: string,
  onEvent?: (event: string, data: unknown) => void
): void {
  if (!block.trim()) return;
  const lines = block.split(/\r\n|\r|\n/);
  let eventType = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(':')) {
      continue;
    }
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      let val = line.slice(5);
      if (val.startsWith(' ')) {
        val = val.slice(1);
      }
      dataLines.push(val);
    }
  }

  if (dataLines.length > 0 || eventType !== 'message') {
    const rawData = dataLines.join('\n');
    let parsed: unknown = rawData;
    if (rawData) {
      try {
        parsed = JSON.parse(rawData);
      } catch {
        parsed = rawData;
      }
    }
    onEvent?.(eventType, parsed);
  }
}

export async function apiStream(
  path: string,
  init?: RequestInit,
  onEvent?: (event: string, data: unknown) => void,
  isRetry = false
): Promise<void> {
  const url = buildApiUrl(path);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  const method = (init?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'text/event-stream');
  }

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

  if (!response.ok) {
    const apiError = await parseErrorResponse(response);

    const isAuthEndpoint = normalizedPath.startsWith('/auth/');
    const is401AuthError =
      response.status === 401 &&
      (apiError.code === 'TOKEN_REVOKED' || apiError.code === 'UNAUTHENTICATED');

    if (is401AuthError && !isAuthEndpoint && !isRetry) {
      try {
        await apiFetch('/auth/refresh', { method: 'POST' }, true);
        return await apiStream(path, init, onEvent, true);
      } catch {
        throw apiError;
      }
    }

    throw apiError;
  }

  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      while (true) {
        const match = /(?:\r\n\r\n|\r\n\n|\n\r\n|\n\n|\r\r)/.exec(buffer);
        if (!match) break;
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        parseEventBlock(block, onEvent);
      }
      if (buffer.trim()) {
        parseEventBlock(buffer, onEvent);
        buffer = '';
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const match = /(?:\r\n\r\n|\r\n\n|\n\r\n|\n\n|\r\r)/.exec(buffer);
      if (!match) {
        break;
      }
      const block = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      parseEventBlock(block, onEvent);
    }
  }
}

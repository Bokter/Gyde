export class SessionExpiredError extends Error {}

/**
 * Calls a dashboard route. Without a session the middleware redirects to the login page, so a
 * redirect or a 401 both mean "sign in again". Server error texts are never shown to the user.
 */
export async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (response.redirected || response.status === 401) throw new SessionExpiredError();
  const body = response.headers.get('content-type')?.includes('application/json')
    ? ((await response.json()) as T)
    : (undefined as T);
  return { status: response.status, body };
}

export function messageFor(error: unknown, fallback: string): string {
  return error instanceof SessionExpiredError
    ? 'Tu sesión expiró. Recarga la página e inicia sesión de nuevo.'
    : fallback;
}

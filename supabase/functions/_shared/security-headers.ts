// Cabeceras de seguridad HTTP estándar de OWASP para Edge Functions y APIs
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
};

export function securityResponse(
  body: unknown,
  init?: ResponseInit,
): Response {
  const mergedHeaders = new Headers(SECURITY_HEADERS);

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      mergedHeaders.set(key, value);
    });
  }

  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(payload, {
    ...init,
    headers: mergedHeaders,
  });
}


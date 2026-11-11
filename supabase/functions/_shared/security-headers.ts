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
  // CORS: la app web se sirve desde otro origen (Nginx) y llama a las
  // Edge Functions en *.supabase.co. Sin estas cabeceras el navegador
  // bloquea el preflight y el login falla solo en web.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-api-version, apikey, content-type, x-webhook-secret, cf-turnstile-response',
  'Access-Control-Max-Age': '86400',
};

export function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: SECURITY_HEADERS,
  });
}

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


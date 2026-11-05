// Supabase Edge Function: auth-login
// Autenticación segura de usuarios mediante correo o @username.
// Seguridad:
// 1. Resuelve el correo internamente con service_role en el servidor.
// 2. JAMÁS devuelve el correo electrónico al cliente antes de que la contraseña sea verificada.
// 3. Rate limiting server-side distribuido por IP y por cuenta mediante Postgres.
// 4. Verificación de bot / Cloudflare Turnstile obligatoria.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { securityResponse } from '../_shared/security-headers.ts';

type LoginBody = {
  identifier?: string;
  password?: string;
  turnstileToken?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return securityResponse({ error: 'method_not_allowed' }, { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return securityResponse({ error: 'server_misconfigured' }, { status: 500 });
    }

    const body = (await req.json().catch(() => ({}))) as LoginBody;
    const identifier = body.identifier?.trim() ?? '';
    const password = body.password ?? '';
    const turnstileToken =
      body.turnstileToken || req.headers.get('cf-turnstile-response') || '';

    // Obtener IP del cliente
    const clientIp =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown-ip';

    // -------------------------------------------------------------------------
    // 1. VERIFICACIÓN DE CLOUDFLARE TURNSTILE (SI ESTÁ CONFIGURADO)
    // -------------------------------------------------------------------------
    if (turnstileSecret) {
      if (!turnstileToken) {
        return securityResponse(
          { error: 'Verificación de seguridad (Turnstile) requerida.' },
          { status: 403 },
        );
      }

      const verifyForm = new FormData();
      verifyForm.append('secret', turnstileSecret);
      verifyForm.append('response', turnstileToken);
      if (clientIp !== 'unknown-ip') {
        verifyForm.append('remoteip', clientIp);
      }

      const verifyRes = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          body: verifyForm,
        },
      );

      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyData?.success) {
        return securityResponse(
          { error: 'Validación de captcha fallida o expirada.' },
          { status: 403 },
        );
      }
    }

    if (!identifier || !password) {
      return securityResponse(
        { error: 'Usuario o contraseña incorrectos.' },
        { status: 400 },
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // -------------------------------------------------------------------------
    // 2. RATE LIMITING SERVER-SIDE DISTRIBUIDO EN POSTGRES
    // -------------------------------------------------------------------------
    // Rate limit por IP: máx 15 intentos cada 60 segundos
    const { data: ipAllowed } = await adminClient.rpc('check_auth_rate_limit', {
      p_key: `ip:${clientIp}`,
      p_max_attempts: 15,
      p_window_seconds: 60,
    });

    if (ipAllowed === false) {
      return securityResponse(
        { error: 'Demasiadas solicitudes desde esta red. Por favor, espera un minuto.' },
        { status: 429 },
      );
    }

    // Rate limit por identificador: máx 5 intentos cada 60 segundos
    const { data: identAllowed } = await adminClient.rpc('check_auth_rate_limit', {
      p_key: `ident:${identifier.toLowerCase()}`,
      p_max_attempts: 5,
      p_window_seconds: 60,
    });

    if (identAllowed === false) {
      return securityResponse(
        { error: 'Demasiados intentos para esta cuenta. Por favor, espera un minuto.' },
        { status: 429 },
      );
    }

    // -------------------------------------------------------------------------
    // 3. RESOLUCIÓN DE IDENTIFICADOR Y AUTENTICACIÓN
    // -------------------------------------------------------------------------
    let targetEmail = identifier;

    // Si el identificador no es un email, resolverlo internamente en el backend
    if (!identifier.includes('@')) {
      const cleanUsername = identifier.replace(/^@/, '').toLowerCase();

      const { data: userRow, error: resolveErr } = await adminClient
        .from('profiles')
        .select('id')
        .ilike('username', cleanUsername)
        .maybeSingle();

      if (resolveErr || !userRow?.id) {
        // Respuesta genérica para mitigar enumeración de usuarios
        return securityResponse(
          { error: 'Usuario o contraseña incorrectos.' },
          { status: 401 },
        );
      }

      // Obtener el email del usuario de auth.users vía admin
      const { data: userData, error: userErr } =
        await adminClient.auth.admin.getUserById(userRow.id);

      if (userErr || !userData?.user?.email) {
        return securityResponse(
          { error: 'Usuario o contraseña incorrectos.' },
          { status: 401 },
        );
      }

      targetEmail = userData.user.email;
    }

    // Intentar inicio de sesión con las credenciales
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: sessionData, error: authErr } =
      await authClient.auth.signInWithPassword({
        email: targetEmail,
        password,
      });

    if (authErr || !sessionData?.session) {
      return securityResponse(
        { error: 'Usuario o contraseña incorrectos.' },
        { status: 401 },
      );
    }

    return securityResponse({
      session: sessionData.session,
      user: sessionData.user,
    });
  } catch {
    return securityResponse(
      { error: 'Error en el servicio de autenticación.' },
      { status: 500 },
    );
  }
});

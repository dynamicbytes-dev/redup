// Supabase Edge Function: auth-login
// Autenticación segura de usuarios mediante correo o @username.
// Seguridad:
// 1. Resuelve el correo internamente con service_role en el servidor.
// 2. JAMÁS devuelve el correo electrónico al cliente antes de que la contraseña sea verificada.
// 3. Previene la enumeración de correos y cuentas devolviendo siempre error genérico ante fallos.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { securityResponse } from '../_shared/security-headers.ts';

type LoginBody = {
  identifier?: string;
  password?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return securityResponse({ error: 'method_not_allowed' }, { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return securityResponse({ error: 'server_misconfigured' }, { status: 500 });
    }

    const body = (await req.json().catch(() => ({}))) as LoginBody;
    const identifier = body.identifier?.trim() ?? '';
    const password = body.password ?? '';

    if (!identifier || !password) {
      return securityResponse(
        { error: 'Usuario o contraseña incorrectos.' },
        { status: 400 },
      );
    }

    let targetEmail = identifier;

    // Si el identificador no es un email, resolverlo internamente en el backend
    if (!identifier.includes('@')) {
      const cleanUsername = identifier.replace(/^@/, '').toLowerCase();
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

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


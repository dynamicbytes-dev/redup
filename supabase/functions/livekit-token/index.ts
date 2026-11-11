// Supabase Edge Function: livekit-token
// Emite un JWT firmado (HS256) compatible con LiveKit para la sala de una conversación.
// Seguridad:
// 1. Exige autenticación obligatoria del usuario con sesión activa.
// 2. Valida pertenencia: El usuario DEBE ser miembro de la conversación solicitada.
// 3. Blindaje de Sala (Room Binding): La sala solicitada DEBE estar estrictamente vinculada
//    a la conversación en call_logs o comenzar con el prefijo canónico 'redup-<conversationId>'.
//    Impide que un miembro de una conversación use un token para escuchar llamadas de otra sala ajena.
// 4. Previene suplantación de identidad: El nombre del participante se lee del perfil verificado.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsPreflightResponse,
  securityResponse,
} from '../_shared/security-headers.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signLiveKitJwt(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data),
  );

  return `${data}.${base64UrlEncode(new Uint8Array(signature))}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse();
  }

  if (req.method !== 'POST') {
    return securityResponse({ error: 'method_not_allowed' }, { status: 405 });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const livekitUrl = Deno.env.get('LIVEKIT_URL') ?? '';
    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY') ?? '';
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET') ?? '';

    if (!authHeader) {
      return securityResponse({ error: 'unauthorized: missing token' }, { status: 401 });
    }

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();

    if (authError || !user) {
      return securityResponse({ error: 'unauthorized: invalid session' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      conversationId?: string;
      roomName?: string;
      displayName?: string;
    };

    const conversationId = body?.conversationId?.trim();
    const requestedRoom = body?.roomName?.trim();

    if (!conversationId || !requestedRoom) {
      return securityResponse({ error: 'bad_request: missing conversationId or roomName' }, { status: 400 });
    }

    if (!UUID_REGEX.test(conversationId)) {
      return securityResponse({ error: 'bad_request: invalid conversationId UUID' }, { status: 400 });
    }

    // =========================================================================
    // 1. VALIDAR QUE EL USUARIO PERTENEZCA A LA CONVERSACIÓN
    // =========================================================================
    const { data: membership } = await client
      .from('conversation_members')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return securityResponse(
        { error: 'forbidden: you are not a member of this conversation' },
        { status: 403 },
      );
    }

    // =========================================================================
    // 2. BLINDAJE DE SALA: COMPROBAR QUE LA SALA PERTENECE A ESTA CONVERSACIÓN
    // =========================================================================
    // La sala debe:
    // a) Existir registrada en call_logs para esta conversación específica (y no estar finalizada).
    // O b) Seguir el formato canónico estricto 'redup-<conversationId>' o prefijado por el UUID completo.
    const canonicalPrefix = `redup-${conversationId}`;
    const isCanonical = requestedRoom === canonicalPrefix || requestedRoom.startsWith(`${canonicalPrefix}-`);

    let isBound = isCanonical;

    if (!isBound) {
      const { data: callLog } = await client
        .from('call_logs')
        .select('id, conversation_id, status, room_name')
        .eq('conversation_id', conversationId)
        .eq('room_name', requestedRoom)
        .maybeSingle();

      if (callLog) {
        // Si la llamada ya terminó, no se permite unirse a la sala
        if (['completed', 'declined', 'missed'].includes(callLog.status)) {
          return securityResponse(
            { error: 'forbidden: call session has already ended' },
            { status: 403 },
          );
        }
        isBound = true;
      }
    }

    // Si la sala solicitada no pertenece a esta conversación, bloqueamos el intento de espionaje
    if (!isBound) {
      return securityResponse(
        { error: 'forbidden: requested room is not bound to this conversation' },
        { status: 403 },
      );
    }

    if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
      return securityResponse({
        configured: false,
        url: null,
        token: null,
        roomName: requestedRoom,
      });
    }

    // =========================================================================
    // 3. OBTENER IDENTIDAD VERIFICADA DEL USUARIO (ANTI-SPOOFING DE NOMBRE)
    // =========================================================================
    const { data: profile } = await client
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .maybeSingle();

    const verifiedName =
      profile?.display_name || profile?.username || user.email || 'Usuario';

    const nowSec = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iss: livekitApiKey,
      sub: user.id,
      name: verifiedName,
      nbf: nowSec,
      exp: nowSec + 60 * 60, // 1 hora de validez
      video: {
        room: requestedRoom,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      },
    };

    const token = await signLiveKitJwt(jwtPayload, livekitApiSecret);

    return securityResponse({
      configured: true,
      url: livekitUrl,
      token,
      roomName: requestedRoom,
    });
  } catch (err) {
    return securityResponse({ error: String(err) }, { status: 500 });
  }
});

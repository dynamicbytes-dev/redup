// Supabase Edge Function: livekit-token
// Emite un JWT firmado (HS256) compatible con LiveKit para la sala de una conversación
// tras verificar que el usuario autenticado pertenece a la conversación.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { securityResponse } from '../_shared/security-headers.ts';

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
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const livekitUrl = Deno.env.get('LIVEKIT_URL') ?? '';
    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY') ?? '';
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET') ?? '';

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();

    if (authError || !user) {
      return securityResponse({ error: 'unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      conversationId?: string;
      roomName?: string;
      displayName?: string;
    };

    if (!body.conversationId || !body.roomName) {
      return securityResponse({ error: 'missing_params' }, { status: 400 });
    }

    const { data: membership } = await client
      .from('conversation_members')
      .select('conversation_id')
      .eq('conversation_id', body.conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return securityResponse({ error: 'forbidden' }, { status: 403 });
    }

    if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
      return securityResponse({
        configured: false,
        url: null,
        token: null,
        roomName: body.roomName,
      });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iss: livekitApiKey,
      sub: user.id,
      name: body.displayName ?? user.email ?? 'Redup User',
      nbf: nowSec,
      exp: nowSec + 60 * 60,
      video: {
        room: body.roomName,
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
      roomName: body.roomName,
    });
  } catch (err) {
    return securityResponse({ error: String(err) }, { status: 500 });
  }
});


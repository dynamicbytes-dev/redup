// Supabase Edge Function: push-notify
// Despacha notificaciones push verificadas para mensajes de chat.
// Seguridad:
// 1. Exige autenticación obligatoria: Webhook Secret autorizado O token JWT de usuario válido.
// 2. Consulta el mensaje REAL en la base de datos (Postgres) por su UUID. Nunca confía en el body HTTP.
// 3. Valida que el invocador sea el autor legítimo del mensaje y miembro de la conversación.
// 4. Respeta bloqueos entre usuarios y conversaciones silenciadas.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsPreflightResponse,
  securityResponse,
} from '../_shared/security-headers.ts';

type PushNotifyRequestBody = {
  // Soporta formato Database Webhook ({ record: { id } }) o llamada de API ({ messageId })
  record?: { id?: string };
  messageId?: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatMessagePreview(kind: string, body: string | null): string {
  if (kind === 'image') return body ? `📷 ${body}` : '📷 Foto';
  if (kind === 'audio') return '🎤 Nota de voz';
  if (kind === 'file') return body ? `📎 ${body}` : '📎 Archivo';
  return body ?? 'Nuevo mensaje';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse();
  }

  if (req.method !== 'POST') {
    return securityResponse({ error: 'method_not_allowed' }, { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const webhookSecretEnv = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return securityResponse({ error: 'server_misconfigured' }, { status: 500 });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const incomingWebhookSecret = req.headers.get('x-webhook-secret') ?? '';

    // =========================================================================
    // 1. AUTENTICACIÓN DEL INVOCADOR
    // =========================================================================
    const isAuthorizedWebhook =
      Boolean(webhookSecretEnv) && incomingWebhookSecret === webhookSecretEnv;

    let authenticatedUserId: string | null = null;

    if (!isAuthorizedWebhook) {
      // Si no es un webhook con secreto de sistema, DEBE ser un usuario autenticado con JWT
      if (!authHeader) {
        return securityResponse(
          { error: 'unauthorized: missing authorization header or webhook secret' },
          { status: 401 },
        );
      }

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const {
        data: { user },
        error: authError,
      } = await userClient.auth.getUser();

      if (authError || !user) {
        return securityResponse(
          { error: 'unauthorized: invalid session token' },
          { status: 401 },
        );
      }

      authenticatedUserId = user.id;
    }

    // =========================================================================
    // 2. PARSEO Y VALIDACIÓN DEL IDENTIFICADOR DE MENSAJE
    // =========================================================================
    const body = (await req.json().catch(() => ({}))) as PushNotifyRequestBody;
    const messageId = body?.record?.id ?? body?.messageId;

    if (!messageId || typeof messageId !== 'string' || !UUID_REGEX.test(messageId)) {
      return securityResponse(
        { error: 'bad_request: invalid or missing messageId UUID' },
        { status: 400 },
      );
    }

    // =========================================================================
    // 3. CONSULTA DEL MENSAJE REAL EN POSTGRES (SOURCE OF TRUTH)
    // =========================================================================
    // NUNCA confiamos en kind, body, sender_id o conversation_id provistos en el request.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: realMessage, error: msgError } = await admin
      .from('messages')
      .select('id, conversation_id, sender_id, kind, body, created_at, deleted_at')
      .eq('id', messageId)
      .maybeSingle();

    if (msgError || !realMessage || realMessage.deleted_at) {
      return securityResponse(
        { error: 'not_found: message does not exist or has been deleted' },
        { status: 404 },
      );
    }

    // Mensajes de sistema no disparan push
    if (realMessage.kind === 'system') {
      return securityResponse({ skipped: true, reason: 'system_message' });
    }

    // Prevención de Replay Attacks: el mensaje debe ser reciente (máx 10 minutos)
    const messageAgeMs = Date.now() - new Date(realMessage.created_at).getTime();
    if (messageAgeMs > 10 * 60 * 1000) {
      return securityResponse(
        { error: 'bad_request: message is too old for push notification' },
        { status: 400 },
      );
    }

    // =========================================================================
    // 4. AUTORIZACIÓN: VERIFICAR QUE EL EMISOR COINCIDA Y SEA MIEMBRO
    // =========================================================================
    if (authenticatedUserId) {
      // El usuario autenticado solo puede enviar notificaciones para SUS PROPIOS mensajes
      if (realMessage.sender_id !== authenticatedUserId) {
        return securityResponse(
          { error: 'forbidden: you can only notify for your own messages' },
          { status: 403 },
        );
      }

      // El usuario autenticado debe pertenecer a la conversación
      const { data: callerMembership } = await admin
        .from('conversation_members')
        .select('conversation_id')
        .eq('conversation_id', realMessage.conversation_id)
        .eq('user_id', authenticatedUserId)
        .maybeSingle();

      if (!callerMembership) {
        return securityResponse(
          { error: 'forbidden: not a member of this conversation' },
          { status: 403 },
        );
      }
    }

    // =========================================================================
    // 5. LOCK ATÓMICO DE IDEMPOTENCIA EN POSTGRES
    // =========================================================================
    // Evita notificaciones duplicadas ante reintentos o llamadas concurrentes
    const { data: lockAcquired } = await admin.rpc('acquire_push_dispatch_lock', {
      p_message_id: messageId,
    });

    if (lockAcquired === false) {
      return securityResponse({
        ok: true,
        status: 'already_processed',
        message: 'Notification for this message has already been dispatched',
      });
    }

    // =========================================================================
    // 6. DESTINATARIOS REALES (SILENCIOS Y BLOQUEOS)
    // =========================================================================
    const [{ data: senderProfile }, { data: conv }, { data: members }, { data: blocks }] =
      await Promise.all([
        admin
          .from('profiles')
          .select('display_name, username')
          .eq('id', realMessage.sender_id)
          .maybeSingle(),
        admin
          .from('conversations')
          .select('type, name')
          .eq('id', realMessage.conversation_id)
          .maybeSingle(),
        admin
          .from('conversation_members')
          .select('user_id, muted_until')
          .eq('conversation_id', realMessage.conversation_id)
          .neq('user_id', realMessage.sender_id),
        admin
          .from('blocks')
          .select('blocker_id')
          .eq('blocked_id', realMessage.sender_id),
      ]);

    const blockerIds = new Set((blocks ?? []).map((b) => b.blocker_id));
    const now = Date.now();

    // Filtra destinatarios activos que no hayan silenciado la charla ni bloqueado al emisor
    const activeRecipientIds = (members ?? [])
      .filter((m) => !m.muted_until || new Date(m.muted_until).getTime() <= now)
      .map((m) => m.user_id)
      .filter((uid) => !blockerIds.has(uid));

    if (activeRecipientIds.length === 0) {
      return securityResponse({ sent: 0, reason: 'no_active_recipients' });
    }

    // =========================================================================
    // 6. OBTENCIÓN DE TOKENS EXPO Y ENVÍO SEGURO
    // =========================================================================
    const { data: tokens } = await admin
      .from('push_tokens')
      .select('token, user_id')
      .in('user_id', activeRecipientIds);

    const expoTokens = (tokens ?? [])
      .map((t) => t.token)
      .filter(
        (token) =>
          token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['),
      );

    if (expoTokens.length === 0) {
      return securityResponse({ sent: 0, reason: 'no_registered_push_tokens' });
    }

    const senderName = senderProfile?.display_name ?? senderProfile?.username ?? 'Redup';
    const isGroup = conv?.type === 'group';
    const title = isGroup && conv?.name ? conv.name : senderName;
    const preview = formatMessagePreview(realMessage.kind, realMessage.body);
    const bodyText = isGroup && conv?.name ? `${senderName}: ${preview}` : preview;

    const messages = expoTokens.map((to) => ({
      to,
      sound: 'default',
      title,
      body: bodyText,
      data: {
        conversationId: realMessage.conversation_id,
        messageId: realMessage.id,
        url: `/chat/${realMessage.conversation_id}`,
      },
    }));

    const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await pushResponse.json();

    // Registrar cantidad de destinatarios alcanzados para auditoría
    await admin.rpc('record_push_dispatch_count', {
      p_message_id: messageId,
      p_count: messages.length,
    }).catch(() => {});

    return securityResponse({ sent: messages.length, result });
  } catch (err) {
    return securityResponse({ error: String(err) }, { status: 500 });
  }
});

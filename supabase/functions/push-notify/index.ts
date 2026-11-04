// Supabase Edge Function: push-notify
// Recibe un Database Webhook (INSERT en public.messages) o una invocación directa
// y envía notificaciones push mediante Expo Push API respetando silencios y bloqueos.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type WebhookPayload = {
  type?: 'INSERT';
  table?: string;
  record?: {
    id: string;
    conversation_id: string;
    sender_id: string;
    kind: 'text' | 'image' | 'audio' | 'file' | 'system';
    body: string | null;
  };
};

function formatMessagePreview(kind: string, body: string | null): string {
  if (kind === 'image') return body ? `📷 ${body}` : '📷 Foto';
  if (kind === 'audio') return '🎤 Nota de voz';
  if (kind === 'file') return body ? `📎 ${body}` : '📎 Archivo';
  return body ?? 'Nuevo mensaje';
}

Deno.serve(async (req: Request) => {
  try {
    const payload = (await req.json()) as WebhookPayload;
    const record = payload.record;
    if (!record || record.kind === 'system') {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const [{ data: sender }, { data: conv }, { data: members }] = await Promise.all([
      admin
        .from('profiles')
        .select('display_name, username')
        .eq('id', record.sender_id)
        .maybeSingle(),
      admin
        .from('conversations')
        .select('type, name')
        .eq('id', record.conversation_id)
        .maybeSingle(),
      admin
        .from('conversation_members')
        .select('user_id, muted_until')
        .eq('conversation_id', record.conversation_id)
        .neq('user_id', record.sender_id),
    ]);

    const now = Date.now();
    const activeRecipientIds = (members ?? [])
      .filter((m) => !m.muted_until || new Date(m.muted_until).getTime() <= now)
      .map((m) => m.user_id);

    if (activeRecipientIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: tokens } = await admin
      .from('push_tokens')
      .select('token, user_id')
      .in('user_id', activeRecipientIds);

    const expoTokens = (tokens ?? [])
      .map((t) => t.token)
      .filter((token) => token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['));

    if (expoTokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const senderName = sender?.display_name ?? sender?.username ?? 'Redup';
    const title = conv?.type === 'group' && conv.name ? `${conv.name}` : senderName;
    const body =
      conv?.type === 'group'
        ? `${senderName}: ${formatMessagePreview(record.kind, record.body)}`
        : formatMessagePreview(record.kind, record.body);

    const messages = expoTokens.map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      data: {
        conversationId: record.conversation_id,
        messageId: record.id,
        url: `/chat/${record.conversation_id}`,
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
    return new Response(JSON.stringify({ sent: messages.length, result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});


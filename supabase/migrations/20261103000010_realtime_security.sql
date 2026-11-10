-- ============================================================================
-- Redup · Seguridad y Autorización de Canales Realtime (Supabase Realtime Authorization)
-- Elimina canales públicos sin autorización y protege topics privados contra escucha espía:
-- 1. conv:<conversation_id> (Mensajes, Typing Broadcast, Presencia)
-- 2. redup:call:<call_id> (Señalización privada de llamada activa)
-- 3. user:<user_id>:calls (Buzón privado de llamada entrante por usuario)
-- ============================================================================

-- 1. Función para autorizar la SUSCRIPCIÓN y LECTURA de eventos en canales privados
create or replace function public.can_access_realtime_topic(
  p_topic text,
  p_user uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  conv_match text[];
  call_match text[];
  user_match text[];
  target_conv uuid;
  target_call uuid;
  target_user uuid;
begin
  if p_user is null or p_topic is null then
    return false;
  end if;

  -- Canal de conversación: conv:<conversation_id>
  -- Solo miembros legítimos de la conversación pueden suscribirse
  conv_match := regexp_match(p_topic, '^conv:([0-9a-fA-F-]{36})$');
  if conv_match is not null then
    begin
      target_conv := conv_match[1]::uuid;
      return public.is_conversation_member(target_conv, p_user);
    exception when others then
      return false;
    end;
  end if;

  -- Canal de llamada activa: redup:call:<call_id>
  -- Solo miembros de la conversación asociada a la llamada pueden suscribirse
  call_match := regexp_match(p_topic, '^redup:call:([0-9a-fA-F-]{36})$');
  if call_match is not null then
    begin
      target_call := call_match[1]::uuid;
      return exists (
        select 1 from public.call_logs cl
        where cl.id = target_call
          and public.is_conversation_member(cl.conversation_id, p_user)
      );
    exception when others then
      return false;
    end;
  end if;

  -- Canal personal de llamadas entrantes: user:<user_id>:calls
  -- Solo el propio usuario puede suscribirse a su canal de llamadas
  user_match := regexp_match(p_topic, '^user:([0-9a-fA-F-]{36}):calls$');
  if user_match is not null then
    begin
      target_user := user_match[1]::uuid;
      return target_user = p_user;
    exception when others then
      return false;
    end;
  end if;

  -- Canal de presencia global redup:presence (solo usuarios autenticados)
  if p_topic = 'redup:presence' then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.can_access_realtime_topic(text, uuid) to authenticated, anon;

-- 2. Función para autorizar la EMISIÓN (broadcast) en canales privados
create or replace function public.can_broadcast_realtime_topic(
  p_topic text,
  p_user uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  user_match text[];
  target_user uuid;
begin
  if p_user is null or p_topic is null then
    return false;
  end if;

  -- Para canales de conversación, llamadas y presencia, rige la pertenencia autorizada
  if p_topic like 'conv:%' or p_topic like 'redup:call:%' or p_topic = 'redup:presence' then
    return public.can_access_realtime_topic(p_topic, p_user);
  end if;

  -- Para emitir aviso de llamada entrante a un destinatario específico: user:<target_user>:calls
  user_match := regexp_match(p_topic, '^user:([0-9a-fA-F-]{36}):calls$');
  if user_match is not null then
    begin
      target_user := user_match[1]::uuid;

      -- Bloqueo mutuo: no se permite emitir señal si alguno de los dos tiene bloqueado al otro
      if exists (
        select 1 from public.blocks b
        where (b.blocker_id = target_user and b.blocked_id = p_user)
           or (b.blocker_id = p_user and b.blocked_id = target_user)
      ) then
        return false;
      end if;

      -- Deben compartir al menos una conversación
      return exists (
        select 1 from public.conversation_members cm1
        join public.conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
        where cm1.user_id = p_user and cm2.user_id = target_user
      );
    exception when others then
      return false;
    end;
  end if;

  return false;
end;
$$;

grant execute on function public.can_broadcast_realtime_topic(text, uuid) to authenticated, anon;

-- 3. Políticas RLS en la tabla del sistema realtime.messages


drop policy if exists "realtime_messages_select_authorized" on realtime.messages;
create policy "realtime_messages_select_authorized"
  on realtime.messages for select
  to authenticated
  using (public.can_access_realtime_topic(topic, auth.uid()));

drop policy if exists "realtime_messages_insert_authorized" on realtime.messages;
create policy "realtime_messages_insert_authorized"
  on realtime.messages for insert
  to authenticated
  with check (public.can_broadcast_realtime_topic(topic, auth.uid()));


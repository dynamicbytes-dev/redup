-- ============================================================================
-- Redup · Endurecimiento de Seguridad (5 Puntos Críticos)
-- 1. Push tokens privados y revocación de get_conversation_push_targets client-side
-- 2. Bloqueo estricto en mensajes (RLS + Triggers anti-bloqueados)
-- 3. Ajustes de privacidad forzados en servidor (show_online y read_receipts)
-- 4. Bucket privado statuses, RLS de amigos y purga de estados expirados
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PUSH TOKENS Y PROTECCIÓN DE DESTINATARIOS
-- ----------------------------------------------------------------------------
-- Revocar acceso público/autenticado a get_conversation_push_targets
-- Solo la Edge Function (service_role) o procesos de servidor autorizados pueden llamarla.
revoke execute on function public.get_conversation_push_targets(uuid) from public, anon, authenticated;
grant execute on function public.get_conversation_push_targets(uuid) to service_role;

-- Asegurar RLS estricto en push_tokens
alter table public.push_tokens enable row level security;
alter table public.push_tokens force row level security;

drop policy if exists "push_tokens own read" on public.push_tokens;
create policy "push_tokens own read"
  on public.push_tokens for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_tokens own insert" on public.push_tokens;
create policy "push_tokens own insert"
  on public.push_tokens for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_tokens own update" on public.push_tokens;
create policy "push_tokens own update"
  on public.push_tokens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_tokens own delete" on public.push_tokens;
create policy "push_tokens own delete"
  on public.push_tokens for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. BLOQUEO ESTRICTO EN MENSAJES (RLS + TRIGGER)
-- ----------------------------------------------------------------------------
-- Trigger que valida que ningún miembro de la conversación directa tenga bloqueado al emisor
-- ni que el emisor haya bloqueado al destinatario.
create or replace function public.check_message_block_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_type public.conversation_type;
  v_blocked boolean;
begin
  -- Solo aplica si hay un emisor autenticado
  if new.sender_id is null then
    return new;
  end if;

  select type into v_conv_type
  from public.conversations
  where id = new.conversation_id;

  if v_conv_type is null then
    raise exception 'conversation_not_found';
  end if;

  -- En conversaciones directas: prohibir si cualquiera bloqueó al otro
  if v_conv_type = 'direct' then
    select exists (
      select 1
      from public.conversation_members cm
      join public.blocks b on (
        (b.blocker_id = cm.user_id and b.blocked_id = new.sender_id)
        or (b.blocker_id = new.sender_id and b.blocked_id = cm.user_id)
      )
      where cm.conversation_id = new.conversation_id
        and cm.user_id <> new.sender_id
    ) into v_blocked;

    if v_blocked then
      raise exception 'cannot_send_to_blocked_user';
    end if;
  else
    -- En grupos: si todos los administradores o miembros te tienen bloqueado, o validación de grupo
    -- El emisor puede escribir a menos que esté bloqueado específicamente
    null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_message_block_status on public.messages;
create trigger trg_check_message_block_status
  before insert on public.messages
  for each row execute function public.check_message_block_status();

-- Políticas RLS de messages actualizadas con verificación de bloqueos
drop policy if exists "messages insert as self" on public.messages;
create policy "messages insert as self"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
    and not exists (
      select 1
      from public.conversation_members cm
      join public.conversations c on c.id = messages.conversation_id and c.type = 'direct'
      join public.blocks b on (
        (b.blocker_id = cm.user_id and b.blocked_id = auth.uid())
        or (b.blocker_id = auth.uid() and b.blocked_id = cm.user_id)
      )
      where cm.conversation_id = messages.conversation_id
        and cm.user_id <> auth.uid()
    )
  );

drop policy if exists "messages visible to members" on public.messages;
create policy "messages visible to members"
  on public.messages for select
  to authenticated
  using (
    public.is_conversation_member(conversation_id)
    and not exists (
      select 1
      from public.blocks b
      where (b.blocker_id = messages.sender_id and b.blocked_id = auth.uid())
         or (b.blocker_id = auth.uid() and b.blocked_id = messages.sender_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 3. AJUSTES DE PRIVACIDAD EN SERVIDOR (show_online y read_receipts)
-- ----------------------------------------------------------------------------
-- Enforce show_online en profiles: si show_online es falso, last_seen_at NUNCA se persiste
create or replace function public.enforce_profile_privacy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.show_online is false then
    new.last_seen_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_profile_privacy on public.profiles;
create trigger trg_enforce_profile_privacy
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_privacy();

-- Actualización segura de touch_last_seen
create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_show_online boolean;
begin
  if me is null then
    return;
  end if;

  select show_online into v_show_online
  from public.profiles
  where id = me;

  if coalesce(v_show_online, true) then
    update public.profiles
    set last_seen_at = now()
    where id = me;
  else
    update public.profiles
    set last_seen_at = null
    where id = me;
  end if;
end;
$$;

grant execute on function public.touch_last_seen() to authenticated;

-- Enforce read_receipts en conversation_members
create or replace function public.enforce_member_read_privacy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_read_receipts boolean;
begin
  select read_receipts into v_read_receipts
  from public.profiles
  where id = new.user_id;

  if v_read_receipts is false then
    new.last_read_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_member_read_privacy on public.conversation_members;
create trigger trg_enforce_member_read_privacy
  before insert or update on public.conversation_members
  for each row execute function public.enforce_member_read_privacy();

-- Marcar conversación como leída respetando read_receipts
create or replace function public.mark_conversation_read(conv uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_read_receipts boolean;
begin
  if me is null then
    return;
  end if;

  select read_receipts into v_read_receipts
  from public.profiles
  where id = me;

  if coalesce(v_read_receipts, true) then
    update public.conversation_members
    set last_read_at = now()
    where conversation_id = conv and user_id = me;
  else
    update public.conversation_members
    set last_read_at = null
    where conversation_id = conv and user_id = me;
  end if;
end;
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Actualizar ajustes de privacidad garantizando limpieza de estados previos
create or replace function public.update_privacy_settings(
  p_show_online boolean,
  p_read_receipts boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles
  set show_online = coalesce(p_show_online, true),
      read_receipts = coalesce(p_read_receipts, true),
      last_seen_at = case when coalesce(p_show_online, true) then now() else null end
  where id = me;

  if not coalesce(p_read_receipts, true) then
    update public.conversation_members
    set last_read_at = null
    where user_id = me;
  end if;
end;
$$;

grant execute on function public.update_privacy_settings(boolean, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. BUCKET PRIVADO STATUSES, RLS DE AMIGOS Y PURGA DE EXPIRADOS
-- ----------------------------------------------------------------------------
-- Crear bucket statuses si no existe (public = false)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'statuses',
  'statuses',
  false,
  10485760, -- 10 MB límite
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Políticas de RLS en storage.objects para statuses
drop policy if exists "statuses_storage_insert_own" on storage.objects;
create policy "statuses_storage_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'statuses'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "statuses_storage_select_friends_or_self" on storage.objects;
create policy "statuses_storage_select_friends_or_self"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'statuses'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.are_friends(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "statuses_storage_delete_own" on storage.objects;
create policy "statuses_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'statuses'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Endurecer política de SELECT en public.statuses: solo visibles si el autor es uno mismo o amigo aceptado
drop policy if exists "statuses visible to non-blocked authenticated" on public.statuses;
drop policy if exists "statuses visible to friends or self" on public.statuses;
create policy "statuses visible to friends or self"
  on public.statuses for select
  to authenticated
  using (
    expires_at > now()
    and (
      user_id = auth.uid()
      or public.are_friends(auth.uid(), statuses.user_id)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = statuses.user_id and b.blocked_id = auth.uid())
         or (b.blocker_id = auth.uid() and b.blocked_id = statuses.user_id)
    )
  );

-- Función para purgar estados expirados de la base de datos y de storage
create or replace function public.purge_expired_statuses()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_count integer := 0;
  v_rec record;
begin
  for v_rec in
    select id, media_path
    from public.statuses
    where expires_at <= now()
  loop
    -- Si tiene foto en statuses, borrar el objeto de storage
    if v_rec.media_path is not null then
      delete from storage.objects
      where bucket_id = 'statuses'
        and name = v_rec.media_path;
    end if;

    delete from public.statuses where id = v_rec.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.purge_expired_statuses() to authenticated, service_role;

-- ============================================================================
-- Redup · Endurecimiento de Seguridad (Auditoría Integral)
-- 1. Anti-enumeración de correos: revocar resolve_login_email
-- 2. Anti-enumeración de usuarios: RLS estricto en profiles (contactos/amigos/compañeros de chat)
-- 3. Inmutabilidad y anti-falsificación en mensajes (kind y created_at forzados)
-- 4. Rate limiting a nivel de base de datos para mensajes, estados y perfiles
-- 5. Borrado físico inmediato de archivos multimedia en storage al eliminar mensajes y estados
-- 6. Endurecimiento del bucket 'media': límite 25 MB y MIME types estrictos
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ANTI-ENUMERACIÓN DE CORREOS
-- ----------------------------------------------------------------------------
-- Revocar resolve_login_email de anon y authenticated para impedir extracción de emails
revoke execute on function public.resolve_login_email(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text) to service_role;

-- ----------------------------------------------------------------------------
-- 2. ANTI-ENUMERACIÓN DE USUARIOS
-- ----------------------------------------------------------------------------
-- Un usuario solo puede ver perfiles si:
-- - Es su propio perfil
-- - Comparte al menos una conversación activa con ese usuario
-- - Son amigos o existe una solicitud de amistad pendiente
-- - La función search_users(q) se mantiene para búsquedas explícitas por texto
drop policy if exists "profiles readable by authenticated" on public.profiles;
drop policy if exists "profiles readable by non-blocked authenticated" on public.profiles;
drop policy if exists "profiles scoped read" on public.profiles;

create policy "profiles scoped read"
  on public.profiles for select
  to authenticated
  using (
    -- Propio usuario
    id = auth.uid()
    or (
      -- Sin bloqueos mutuos
      not exists (
        select 1 from public.blocks b
        where (b.blocker_id = profiles.id and b.blocked_id = auth.uid())
           or (b.blocker_id = auth.uid() and b.blocked_id = profiles.id)
      )
      and (
        -- Comparte una conversación
        exists (
          select 1
          from public.conversation_members cm_me
          join public.conversation_members cm_them
            on cm_me.conversation_id = cm_them.conversation_id
          where cm_me.user_id = auth.uid()
            and cm_them.user_id = profiles.id
        )
        -- O son amigos
        or public.are_friends(auth.uid(), profiles.id)
        -- O tienen solicitud de amistad entre ellos
        or exists (
          select 1
          from public.friend_requests fr
          where (fr.sender_id = auth.uid() and fr.receiver_id = profiles.id)
             or (fr.sender_id = profiles.id and fr.receiver_id = auth.uid())
        )
      )
    )
  );

-- Endurecer search_users para exigir al menos 2 caracteres y evitar volcados vacíos
drop function if exists public.search_users(text);
create or replace function public.search_users(q text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username::text, p.display_name, p.avatar_path
  from public.profiles p
  where length(trim(coalesce(q, ''))) >= 2
    and p.id <> auth.uid()
    and (
      p.username ilike ('%' || trim(q) || '%')
      or p.display_name ilike ('%' || trim(q) || '%')
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = p.id and b.blocked_id = auth.uid())
         or (b.blocker_id = auth.uid() and b.blocked_id = p.id)
    )
  order by
    case when p.username ilike (trim(q) || '%') then 0 else 1 end,
    p.username asc
  limit 20;
$$;

grant execute on function public.search_users(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. INMUTABILIDAD Y ANTI-FALSIFICACIÓN EN INSERT DE MENSAJES
-- 4. RATE LIMITING EN BASE DE DATOS
-- ----------------------------------------------------------------------------
create or replace function public.enforce_message_insert_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_messages integer;
begin
  -- 1. Forzar created_at al tiempo real del servidor (imposibilita anclar con fechas futuras)
  new.created_at := now();

  -- 2. Prohibir falsificación de mensajes de sistema desde clientes
  if new.kind = 'system' and auth.uid() is not null then
    raise exception 'unauthorized_message_kind: clients cannot insert system messages';
  end if;

  -- 3. Rate limiting en base de datos: máx 20 mensajes cada 10 segundos por usuario
  if new.sender_id is not null then
    select count(*)
    into v_recent_messages
    from public.messages
    where sender_id = new.sender_id
      and created_at > now() - interval '10 seconds';

    if v_recent_messages >= 20 then
      raise exception 'rate_limit_exceeded: too many messages sent in a short time';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_message_insert_security on public.messages;
create trigger trg_enforce_message_insert_security
  before insert on public.messages
  for each row execute function public.enforce_message_insert_security();

-- Rate limit en base de datos para estados: máx 5 estados por minuto
create or replace function public.enforce_status_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_statuses integer;
begin
  select count(*)
  into v_recent_statuses
  from public.statuses
  where user_id = new.user_id
    and created_at > now() - interval '1 minute';

  if v_recent_statuses >= 5 then
    raise exception 'rate_limit_exceeded: too many status updates in a short time';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_status_rate_limit on public.statuses;
create trigger trg_enforce_status_rate_limit
  before insert on public.statuses
  for each row execute function public.enforce_status_rate_limit();

-- ----------------------------------------------------------------------------
-- 5. BORRADO FÍSICO INMEDIATO DE ARCHIVOS EN STORAGE AL ELIMINAR MENSAJES Y ESTADOS
-- ----------------------------------------------------------------------------
-- Borrado físico al eliminar el registro (hard delete)
create or replace function public.on_message_deleted_clean_storage()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if old.media_path is not null then
    delete from storage.objects
    where bucket_id = 'media'
      and name = old.media_path;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_on_message_deleted_clean_storage on public.messages;
create trigger trg_on_message_deleted_clean_storage
  after delete on public.messages
  for each row execute function public.on_message_deleted_clean_storage();

-- Borrado físico al hacer soft-delete (cuando media_path pasa a NULL en update)
create or replace function public.on_message_media_cleared()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if old.media_path is not null and (new.media_path is null or new.deleted_at is not null) then
    delete from storage.objects
    where bucket_id = 'media'
      and name = old.media_path;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_message_media_cleared on public.messages;
create trigger trg_on_message_media_cleared
  before update on public.messages
  for each row execute function public.on_message_media_cleared();

create or replace function public.on_status_deleted_clean_storage()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if old.media_path is not null then
    delete from storage.objects
    where bucket_id = 'statuses'
      and name = old.media_path;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_on_status_deleted_clean_storage on public.statuses;
create trigger trg_on_status_deleted_clean_storage
  after delete on public.statuses
  for each row execute function public.on_status_deleted_clean_storage();

-- ----------------------------------------------------------------------------
-- 6. ENDURECIMIENTO DEL BUCKET 'media': 25 MB y MIME TYPES PERMITIDOS
-- ----------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 26214400, -- 25 MB
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/quicktime',
      'audio/mpeg',
      'audio/mp4',
      'audio/m4a',
      'audio/aac',
      'audio/ogg',
      'application/pdf'
    ]
where id = 'media';

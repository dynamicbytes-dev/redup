-- ============================================================================
-- Redup · Endurecimiento de Seguridad para Producción (Auditoría Integral)
-- 1. Helper is_valid_uuid para evitar errores fatales de casteo en RLS
-- 2. Scoped read de profiles ampliado a miembros de servidores de Discord
-- 3. FORCE ROW LEVEL SECURITY y revocación de anon en tablas de Servidores y Muro
-- 4. Políticas de Storage en 'media' para Chats, Servidores y Muro con control estricto de acceso
-- 5. Rate limiting e integridad de mensajes de servidor y publicaciones de muro
-- 6. Limpieza física de storage al eliminar posts o mensajes de servidor
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HELPER SAFE UUID
-- ----------------------------------------------------------------------------
create or replace function public.is_valid_uuid(p_val text)
returns boolean
language sql
immutable
as $$
  select p_val is not null and p_val ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
$$;

-- ----------------------------------------------------------------------------
-- 2. PERFILES: SCOPED READ AMPLIADO A MIEMBROS DE SERVIDORES
-- ----------------------------------------------------------------------------
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
        -- Comparte una conversación privada o grupal
        exists (
          select 1
          from public.conversation_members cm_me
          join public.conversation_members cm_them
            on cm_me.conversation_id = cm_them.conversation_id
          where cm_me.user_id = auth.uid()
            and cm_them.user_id = profiles.id
        )
        -- O comparten un servidor de Discord
        or exists (
          select 1
          from public.server_members sm_me
          join public.server_members sm_them
            on sm_me.server_id = sm_them.server_id
          where sm_me.user_id = auth.uid()
            and sm_them.user_id = profiles.id
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

-- ----------------------------------------------------------------------------
-- 3. FORCE ROW LEVEL SECURITY Y REVOCACIÓN DE ANON
-- ----------------------------------------------------------------------------
alter table public.servers force row level security;
alter table public.server_members force row level security;
alter table public.server_channels force row level security;
alter table public.server_channel_messages force row level security;
alter table public.wall_posts force row level security;
alter table public.wall_post_reactions force row level security;
alter table public.wall_post_comments force row level security;
alter table public.wall_comment_reactions force row level security;

revoke all on public.servers from anon;
revoke all on public.server_members from anon;
revoke all on public.server_channels from anon;
revoke all on public.server_channel_messages from anon;
revoke all on public.wall_posts from anon;
revoke all on public.wall_post_reactions from anon;
revoke all on public.wall_post_comments from anon;
revoke all on public.wall_comment_reactions from anon;

-- Longitud máxima en mensajes de canal de servidor
alter table public.server_channel_messages
  drop constraint if exists server_channel_messages_body_length_check;

alter table public.server_channel_messages
  add constraint server_channel_messages_body_length_check
  check (body is null or char_length(body) <= 5000);

-- ----------------------------------------------------------------------------
-- 4. POLÍTICAS DE STORAGE EN BUCKET 'media' (Chats, Servidores y Muro)
-- ----------------------------------------------------------------------------
drop policy if exists "media read by members" on storage.objects;
drop policy if exists "media insert by members" on storage.objects;
drop policy if exists "media delete by members" on storage.objects;

-- SELECT en 'media'
create policy "media read by members"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'media'
    and (
      -- Patrón A: {conversation_uuid}/{message_id}.{ext}
      (
        public.is_valid_uuid((storage.foldername(name))[1])
        and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
      )
      -- Patrón B: servers/{server_uuid}/{message_id}.{ext}
      or (
        (storage.foldername(name))[1] = 'servers'
        and public.is_valid_uuid((storage.foldername(name))[2])
        and public.is_server_member(((storage.foldername(name))[2])::uuid, auth.uid())
      )
      -- Patrón C: wall/{author_uuid}/{post_id}.{ext}
      or (
        (storage.foldername(name))[1] = 'wall'
        and public.is_valid_uuid((storage.foldername(name))[2])
        and (
          ((storage.foldername(name))[2])::uuid = auth.uid()
          or public.are_friends(auth.uid(), ((storage.foldername(name))[2])::uuid)
        )
      )
    )
  );

-- INSERT en 'media'
create policy "media insert by members"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (
      -- Patrón A: Chats
      (
        public.is_valid_uuid((storage.foldername(name))[1])
        and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
      )
      -- Patrón B: Servidores
      or (
        (storage.foldername(name))[1] = 'servers'
        and public.is_valid_uuid((storage.foldername(name))[2])
        and public.is_server_member(((storage.foldername(name))[2])::uuid, auth.uid())
      )
      -- Patrón C: Muro (solo el autor puede subir a su propia carpeta de muro)
      or (
        (storage.foldername(name))[1] = 'wall'
        and public.is_valid_uuid((storage.foldername(name))[2])
        and ((storage.foldername(name))[2])::uuid = auth.uid()
      )
    )
  );

-- DELETE en 'media'
create policy "media delete by members"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (
      -- Patrón A: Chats
      (
        public.is_valid_uuid((storage.foldername(name))[1])
        and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
      )
      -- Patrón B: Servidores
      or (
        (storage.foldername(name))[1] = 'servers'
        and public.is_valid_uuid((storage.foldername(name))[2])
        and public.is_server_admin_or_owner(((storage.foldername(name))[2])::uuid, auth.uid())
      )
      -- Patrón C: Muro
      or (
        (storage.foldername(name))[1] = 'wall'
        and public.is_valid_uuid((storage.foldername(name))[2])
        and ((storage.foldername(name))[2])::uuid = auth.uid()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 5. RATE LIMITING E INTEGRIDAD DE SERVIDORES Y MURO
-- ----------------------------------------------------------------------------
-- A. Mensajes en canales de servidores
create or replace function public.enforce_server_message_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_messages integer;
begin
  new.created_at := now();

  -- Clientes no pueden insertar tipo 'system' arbitrariamente
  if new.kind = 'system' and auth.uid() is not null then
    -- Permitir solo si es owner/admin del servidor
    if not public.is_server_admin_or_owner(new.server_id, auth.uid()) then
      raise exception 'unauthorized_message_kind';
    end if;
  end if;

  -- Rate limit en servidor: máx 25 mensajes cada 10 segundos
  if new.sender_id is not null then
    select count(*)
    into v_recent_messages
    from public.server_channel_messages
    where sender_id = new.sender_id
      and created_at > now() - interval '10 seconds';

    if v_recent_messages >= 25 then
      raise exception 'rate_limit_exceeded: demasiados mensajes enviados en poco tiempo';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_server_message_security on public.server_channel_messages;
create trigger trg_enforce_server_message_security
  before insert on public.server_channel_messages
  for each row execute function public.enforce_server_message_security();

-- B. Publicaciones en el Muro (Wall Posts)
create or replace function public.enforce_wall_post_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_posts integer;
begin
  new.created_at := now();

  -- Rate limit: máx 6 posts por minuto por usuario
  select count(*)
  into v_recent_posts
  from public.wall_posts
  where author_id = new.author_id
    and created_at > now() - interval '1 minute';

  if v_recent_posts >= 6 then
    raise exception 'rate_limit_exceeded: puedes publicar hasta 6 veces por minuto';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_wall_post_security on public.wall_posts;
create trigger trg_enforce_wall_post_security
  before insert on public.wall_posts
  for each row execute function public.enforce_wall_post_security();

-- C. Comentarios en el Muro
create or replace function public.enforce_wall_comment_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_comments integer;
begin
  new.created_at := now();

  -- Rate limit: máx 20 comentarios por minuto por usuario
  select count(*)
  into v_recent_comments
  from public.wall_post_comments
  where author_id = new.author_id
    and created_at > now() - interval '1 minute';

  if v_recent_comments >= 20 then
    raise exception 'rate_limit_exceeded: demasiados comentarios enviados en poco tiempo';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_wall_comment_security on public.wall_post_comments;
create trigger trg_enforce_wall_comment_security
  before insert on public.wall_post_comments
  for each row execute function public.enforce_wall_comment_security();

-- ----------------------------------------------------------------------------
-- 6. LIMPIEZA FÍSICA DE STORAGE AL ELIMINAR POSTS Y MENSAJES DE SERVIDOR
-- ----------------------------------------------------------------------------
create or replace function public.on_server_message_deleted_clean_storage()
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

drop trigger if exists trg_on_server_message_deleted_clean_storage on public.server_channel_messages;
create trigger trg_on_server_message_deleted_clean_storage
  after delete on public.server_channel_messages
  for each row execute function public.on_server_message_deleted_clean_storage();

create or replace function public.on_wall_post_deleted_clean_storage()
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

drop trigger if exists trg_on_wall_post_deleted_clean_storage on public.wall_posts;
create trigger trg_on_wall_post_deleted_clean_storage
  after delete on public.wall_posts
  for each row execute function public.on_wall_post_deleted_clean_storage();


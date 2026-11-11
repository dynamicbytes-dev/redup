-- ============================================================
-- Migración: Servidores estilo Discord (Servers, Channels, Members, Messages)
-- ============================================================

-- 1. Tabla de servidores
create table if not exists public.servers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(trim(name)) between 2 and 100),
  description  text,
  avatar_path  text,
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  invite_code  text not null unique default lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists servers_invite_code_idx on public.servers (invite_code);
create index if not exists servers_owner_idx on public.servers (owner_id);

-- 2. Miembros de servidores
create table if not exists public.server_members (
  server_id  uuid not null references public.servers (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'admin', 'moderator', 'member')),
  nickname   text,
  joined_at  timestamptz not null default now(),
  primary key (server_id, user_id)
);

create index if not exists server_members_user_idx on public.server_members (user_id);

-- 3. Canales de servidores
create table if not exists public.server_channels (
  id          uuid primary key default gen_random_uuid(),
  server_id   uuid not null references public.servers (id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 64),
  topic       text,
  type        text not null default 'text' check (type in ('text', 'voice')),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists server_channels_server_idx on public.server_channels (server_id, position asc, created_at asc);

-- 4. Mensajes en canales de servidores
create table if not exists public.server_channel_messages (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references public.server_channels (id) on delete cascade,
  server_id    uuid not null references public.servers (id) on delete cascade,
  sender_id    uuid references public.profiles (id) on delete set null,
  kind         public.message_kind not null default 'text',
  body         text,
  media_path   text,
  media_meta   jsonb,
  duration_ms  integer,
  reply_to_id  uuid references public.server_channel_messages (id) on delete set null,
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  deleted_at   timestamptz,
  constraint server_messages_body_required check (
    kind = 'system' or body is not null or media_path is not null
  )
);

create index if not exists server_messages_channel_idx
  on public.server_channel_messages (channel_id, created_at desc, id desc);

-- Realtime publication
alter table public.servers replica identity full;
alter table public.server_members replica identity full;
alter table public.server_channels replica identity full;
alter table public.server_channel_messages replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'servers') then
    alter publication supabase_realtime add table public.servers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'server_members') then
    alter publication supabase_realtime add table public.server_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'server_channels') then
    alter publication supabase_realtime add table public.server_channels;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'server_channel_messages') then
    alter publication supabase_realtime add table public.server_channel_messages;
  end if;
end $$;

-- ------------------------------------------------------------
-- Funciones helper de seguridad (evitan recursión en RLS)
-- ------------------------------------------------------------
create or replace function public.is_server_member(p_server_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = p_user_id
  );
$$;

create or replace function public.is_server_admin_or_owner(p_server_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = p_user_id and role in ('owner', 'admin')
  );
$$;

-- ------------------------------------------------------------
-- Row Level Security (RLS)
-- ------------------------------------------------------------
alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.server_channels enable row level security;
alter table public.server_channel_messages enable row level security;

-- Servers
create policy "servers_select"
  on public.servers for select
  using (
    auth.role() = 'authenticated' and (
      public.is_server_member(id, auth.uid()) or
      owner_id = auth.uid()
    )
  );

create policy "servers_insert"
  on public.servers for insert
  with check (
    auth.role() = 'authenticated' and
    owner_id = auth.uid()
  );

create policy "servers_update"
  on public.servers for update
  using (
    auth.role() = 'authenticated' and
    public.is_server_admin_or_owner(id, auth.uid())
  );

create policy "servers_delete"
  on public.servers for delete
  using (
    auth.role() = 'authenticated' and
    owner_id = auth.uid()
  );

-- Server Members
create policy "server_members_select"
  on public.server_members for select
  using (
    auth.role() = 'authenticated' and
    public.is_server_member(server_id, auth.uid())
  );

create policy "server_members_insert"
  on public.server_members for insert
  with check (
    auth.role() = 'authenticated' and
    (user_id = auth.uid() or public.is_server_admin_or_owner(server_id, auth.uid()))
  );

create policy "server_members_update"
  on public.server_members for update
  using (
    auth.role() = 'authenticated' and
    public.is_server_admin_or_owner(server_id, auth.uid())
  );

create policy "server_members_delete"
  on public.server_members for delete
  using (
    auth.role() = 'authenticated' and
    (user_id = auth.uid() or public.is_server_admin_or_owner(server_id, auth.uid()))
  );

-- Server Channels
create policy "server_channels_select"
  on public.server_channels for select
  using (
    auth.role() = 'authenticated' and
    public.is_server_member(server_id, auth.uid())
  );

create policy "server_channels_insert"
  on public.server_channels for insert
  with check (
    auth.role() = 'authenticated' and
    public.is_server_admin_or_owner(server_id, auth.uid())
  );

create policy "server_channels_update"
  on public.server_channels for update
  using (
    auth.role() = 'authenticated' and
    public.is_server_admin_or_owner(server_id, auth.uid())
  );

create policy "server_channels_delete"
  on public.server_channels for delete
  using (
    auth.role() = 'authenticated' and
    public.is_server_admin_or_owner(server_id, auth.uid())
  );

-- Server Channel Messages
create policy "server_messages_select"
  on public.server_channel_messages for select
  using (
    auth.role() = 'authenticated' and
    public.is_server_member(server_id, auth.uid())
  );

create policy "server_messages_insert"
  on public.server_channel_messages for insert
  with check (
    auth.role() = 'authenticated' and
    sender_id = auth.uid() and
    public.is_server_member(server_id, auth.uid())
  );

create policy "server_messages_update"
  on public.server_channel_messages for update
  using (
    auth.role() = 'authenticated' and (
      sender_id = auth.uid() or
      public.is_server_admin_or_owner(server_id, auth.uid())
    )
  );

create policy "server_messages_delete"
  on public.server_channel_messages for delete
  using (
    auth.role() = 'authenticated' and (
      sender_id = auth.uid() or
      public.is_server_admin_or_owner(server_id, auth.uid())
    )
  );

-- ------------------------------------------------------------
-- RPC: Crear Servidor con canales iniciales
-- ------------------------------------------------------------
create or replace function public.create_discord_server(
  p_name text,
  p_description text default null,
  p_avatar_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_server_id uuid;
  v_invite_code text;
  v_general_channel_id uuid;
  v_voice_channel_id uuid;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if char_length(trim(p_name)) < 2 then
    raise exception 'El nombre del servidor debe tener al menos 2 caracteres';
  end if;

  -- Generar código de invitación único de 8 caracteres
  v_invite_code := lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  -- 1. Insertar servidor
  insert into public.servers (
    name,
    description,
    avatar_path,
    owner_id,
    invite_code
  ) values (
    trim(p_name),
    nullif(trim(p_description), ''),
    p_avatar_path,
    v_user_id,
    v_invite_code
  ) returning id into v_server_id;

  -- 2. Insertar al owner como miembro con rol 'owner'
  insert into public.server_members (
    server_id,
    user_id,
    role
  ) values (
    v_server_id,
    v_user_id,
    'owner'
  );

  -- 3. Crear canales por defecto estilo Discord: # general, # anuncios, 🔊 Sala de voz
  insert into public.server_channels (
    server_id,
    name,
    topic,
    type,
    position
  ) values (
    v_server_id,
    'general',
    'Canal general de conversación',
    'text',
    0
  ) returning id into v_general_channel_id;

  insert into public.server_channels (
    server_id,
    name,
    topic,
    type,
    position
  ) values (
    v_server_id,
    'anuncios',
    'Novedades y anuncios del servidor',
    'text',
    1
  );

  insert into public.server_channels (
    server_id,
    name,
    topic,
    type,
    position
  ) values (
    v_server_id,
    'Sala de voz',
    'Canal de voz principal',
    'voice',
    2
  ) returning id into v_voice_channel_id;

  -- 4. Mensaje de bienvenida del sistema en #general
  insert into public.server_channel_messages (
    channel_id,
    server_id,
    sender_id,
    kind,
    body
  ) values (
    v_general_channel_id,
    v_server_id,
    v_user_id,
    'system',
    '¡Bienvenido al servidor! 🎉 Este es el inicio del canal #general.'
  );

  return jsonb_build_object(
    'id', v_server_id,
    'name', trim(p_name),
    'description', p_description,
    'avatar_path', p_avatar_path,
    'invite_code', v_invite_code,
    'owner_id', v_user_id,
    'default_channel_id', v_general_channel_id
  );
end;
$$;

-- ------------------------------------------------------------
-- RPC: Previsualizar servidor por código de invitación
-- ------------------------------------------------------------
create or replace function public.get_server_preview_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean_code text := lower(trim(p_code));
  v_server record;
  v_member_count int;
  v_owner_name text;
begin
  select s.id, s.name, s.description, s.avatar_path, s.owner_id, s.invite_code, s.created_at
  into v_server
  from public.servers s
  where lower(s.invite_code) = v_clean_code
  limit 1;

  if v_server.id is null then
    return null;
  end if;

  select count(*)::int into v_member_count
  from public.server_members
  where server_id = v_server.id;

  select coalesce(display_name, username, 'Usuario')
  into v_owner_name
  from public.profiles
  where id = v_server.owner_id;

  return jsonb_build_object(
    'id', v_server.id,
    'name', v_server.name,
    'description', v_server.description,
    'avatar_path', v_server.avatar_path,
    'invite_code', v_server.invite_code,
    'member_count', v_member_count,
    'owner_name', v_owner_name,
    'already_member', public.is_server_member(v_server.id, auth.uid())
  );
end;
$$;

-- ------------------------------------------------------------
-- RPC: Unirse a servidor por código de invitación
-- ------------------------------------------------------------
create or replace function public.join_server_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_clean_code text := lower(trim(p_code));
  v_server_id uuid;
  v_server_name text;
  v_already boolean;
  v_first_channel_id uuid;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  select id, name into v_server_id, v_server_name
  from public.servers
  where lower(invite_code) = v_clean_code
  limit 1;

  if v_server_id is null then
    raise exception 'El enlace de invitación no es válido o ha expirado.';
  end if;

  v_already := public.is_server_member(v_server_id, v_user_id);

  if not v_already then
    insert into public.server_members (server_id, user_id, role)
    values (v_server_id, v_user_id, 'member');

    -- Mensaje de bienvenida en el primer canal de texto
    select id into v_first_channel_id
    from public.server_channels
    where server_id = v_server_id and type = 'text'
    order by position asc
    limit 1;

    if v_first_channel_id is not null then
      insert into public.server_channel_messages (
        channel_id,
        server_id,
        sender_id,
        kind,
        body
      ) values (
        v_first_channel_id,
        v_server_id,
        v_user_id,
        'system',
        '¡Un nuevo miembro se ha unido al servidor! 👋'
      );
    end if;
  end if;

  select id into v_first_channel_id
  from public.server_channels
  where server_id = v_server_id and type = 'text'
  order by position asc
  limit 1;

  return jsonb_build_object(
    'server_id', v_server_id,
    'name', v_server_name,
    'channel_id', v_first_channel_id,
    'already_member', v_already
  );
end;
$$;

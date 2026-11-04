-- ============================================================
-- Redup · esquema base (Fases 1 y 2)
-- perfiles · contactos · conversaciones · mensajes · RLS
-- ============================================================

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- Tipos
-- ------------------------------------------------------------
do $$ begin
  create type public.conversation_type as enum ('direct', 'group');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_kind as enum ('text', 'image', 'audio', 'file', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_role as enum ('member', 'admin');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- Perfiles
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      extensions.citext not null unique,
  display_name  text not null,
  avatar_path   text,
  about         text,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_.]{3,20}$'),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 60)
);

-- ------------------------------------------------------------
-- Bloqueos
-- ------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

-- ------------------------------------------------------------
-- Contactos
-- ------------------------------------------------------------
create table if not exists public.contacts (
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  contact_id  uuid not null references public.profiles (id) on delete cascade,
  alias       text,
  created_at  timestamptz not null default now(),
  primary key (owner_id, contact_id),
  constraint contacts_not_self check (owner_id <> contact_id)
);

-- ------------------------------------------------------------
-- Conversaciones
-- ------------------------------------------------------------
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  type             public.conversation_type not null,
  name             text,
  avatar_path      text,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  -- clave ordenada "uuidA:uuidB" solo para conversaciones directas (evita duplicados)
  direct_key       text unique
);

create index if not exists conversations_last_message_idx
  on public.conversations (last_message_at desc);

create table if not exists public.conversation_members (
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  role             public.member_role not null default 'member',
  joined_at        timestamptz not null default now(),
  last_read_at     timestamptz not null default now(),
  muted_until      timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id);

-- ------------------------------------------------------------
-- Mensajes
-- ------------------------------------------------------------
create table if not exists public.messages (
  id               uuid primary key, -- generado en el cliente (envío optimista)
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid references public.profiles (id) on delete set null,
  kind             public.message_kind not null default 'text',
  body             text,
  media_path       text,
  media_meta       jsonb,
  duration_ms      integer,
  reply_to_id      uuid references public.messages (id) on delete set null,
  created_at       timestamptz not null default now(),
  edited_at        timestamptz,
  deleted_at       timestamptz,
  constraint messages_body_required check (
    kind = 'system' or body is not null or media_path is not null
  )
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at desc, id desc);

-- payloads completos para realtime
alter table public.messages replica identity full;

-- ------------------------------------------------------------
-- Helpers (security definer para romper la recursión de RLS)
-- ------------------------------------------------------------
create or replace function public.is_conversation_member(conv uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conv and m.user_id = uid
  );
$$;

create or replace function public.is_conversation_admin(conv uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conv and m.user_id = uid and m.role = 'admin'
  );
$$;

create or replace function public.is_blocked_by_me(other uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks b
    where b.blocker_id = uid and b.blocked_id = other
  );
$$;

-- ------------------------------------------------------------
-- Nuevo usuario -> perfil
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
  dname text;
begin
  uname := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    '[^a-z0-9_.]', '', 'g'
  ));
  dname := coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), uname);

  insert into public.profiles (id, username, display_name)
  values (new.id, uname, dname);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- last_message_at al insertar mensaje
-- ------------------------------------------------------------
create or replace function public.bump_conversation_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id and last_message_at < new.created_at;
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.bump_conversation_timestamp();

-- ------------------------------------------------------------
-- RPCs de negocio
-- ------------------------------------------------------------
create or replace function public.is_username_available(uname text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles p where p.username = uname::extensions.citext);
$$;

create or replace function public.resolve_login_email(uname text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = uname::extensions.citext
  limit 1;
$$;

create or replace function public.search_users(q text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  about text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username::text, p.display_name, p.avatar_path, p.about
  from public.profiles p
  where p.id <> auth.uid()
    and char_length(trim(q)) >= 2
    and (p.username ilike trim(q) || '%' or p.display_name ilike '%' || trim(q) || '%')
    and not exists (
      select 1 from public.blocks b
      where b.blocker_id = p.id and b.blocked_id = auth.uid()
    )
  order by (p.username ilike trim(q) || '%') desc, p.username
  limit 30;
$$;

create or replace function public.get_or_create_direct_conversation(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  dk text;
  cid uuid;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if other_user = me then
    raise exception 'cannot_chat_with_self';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = me and b.blocked_id = other_user)
       or (b.blocker_id = other_user and b.blocked_id = me)
  ) then
    raise exception 'blocked';
  end if;

  dk := least(me, other_user)::text || ':' || greatest(me, other_user)::text;

  select c.id into cid from public.conversations c where c.direct_key = dk;
  if cid is not null then
    return cid;
  end if;

  insert into public.conversations (type, created_by, direct_key)
  values ('direct', me, dk)
  returning id into cid;

  insert into public.conversation_members (conversation_id, user_id)
  values (cid, me), (cid, other_user);

  return cid;
end;
$$;

create or replace function public.mark_conversation_read(conv uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = conv and user_id = auth.uid();
$$;

create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

create or replace function public.get_conversations_overview()
returns table (
  id uuid,
  type text,
  name text,
  avatar_path text,
  last_message_at timestamptz,
  last_message_body text,
  last_message_kind text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  unread_count integer,
  member_count integer,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_path text,
  other_last_seen_at timestamptz,
  muted_until timestamptz,
  my_role text,
  last_read_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select m.conversation_id, m.last_read_at, m.muted_until, m.role
    from public.conversation_members m
    where m.user_id = auth.uid()
  ),
  last_msg as (
    select distinct on (msg.conversation_id)
      msg.conversation_id,
      msg.body,
      msg.kind,
      msg.sender_id,
      msg.created_at,
      msg.deleted_at
    from public.messages msg
    join mine on mine.conversation_id = msg.conversation_id
    order by msg.conversation_id, msg.created_at desc, msg.id desc
  )
  select
    c.id,
    c.type::text,
    c.name,
    c.avatar_path,
    c.last_message_at,
    case when lm.deleted_at is not null then null else lm.body end,
    case when lm.deleted_at is not null then 'deleted' else lm.kind::text end,
    lm.sender_id,
    lm.created_at,
    coalesce((
      select count(*)::integer
      from public.messages m2
      where m2.conversation_id = c.id
        and m2.created_at > mine.last_read_at
        and m2.sender_id is distinct from auth.uid()
        and m2.deleted_at is null
    ), 0),
    (select count(*)::integer from public.conversation_members m3 where m3.conversation_id = c.id),
    ou.user_id,
    p.username::text,
    coalesce(ct.alias, p.display_name),
    p.avatar_path,
    p.last_seen_at,
    mine.muted_until,
    mine.role::text,
    mine.last_read_at
  from mine
  join public.conversations c on c.id = mine.conversation_id
  left join last_msg lm on lm.conversation_id = c.id
  left join lateral (
    select m4.user_id
    from public.conversation_members m4
    where m4.conversation_id = c.id and m4.user_id <> auth.uid()
    limit 1
  ) ou on true
  left join public.profiles p on p.id = ou.user_id
  left join public.contacts ct on ct.owner_id = auth.uid() and ct.contact_id = ou.user_id
  order by c.last_message_at desc;
$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.blocks              enable row level security;
alter table public.contacts            enable row level security;
alter table public.conversations       enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages            enable row level security;

-- profiles
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- blocks
drop policy if exists "blocks own all" on public.blocks;
create policy "blocks own all"
  on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- contacts
drop policy if exists "contacts own all" on public.contacts;
create policy "contacts own all"
  on public.contacts for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- conversations
drop policy if exists "conversations visible to members" on public.conversations;
create policy "conversations visible to members"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

drop policy if exists "conversations insert own" on public.conversations;
create policy "conversations insert own"
  on public.conversations for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "conversations update by admin" on public.conversations;
create policy "conversations update by admin"
  on public.conversations for update to authenticated
  using (public.is_conversation_admin(id)) with check (public.is_conversation_admin(id));

-- conversation_members
drop policy if exists "members visible to members" on public.conversation_members;
create policy "members visible to members"
  on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "members insert by admin or self" on public.conversation_members;
create policy "members insert by admin or self"
  on public.conversation_members for insert to authenticated
  with check (public.is_conversation_admin(conversation_id) or user_id = auth.uid());

drop policy if exists "members update own or admin" on public.conversation_members;
create policy "members update own or admin"
  on public.conversation_members for update to authenticated
  using (user_id = auth.uid() or public.is_conversation_admin(conversation_id))
  with check (user_id = auth.uid() or public.is_conversation_admin(conversation_id));

drop policy if exists "members delete self or admin" on public.conversation_members;
create policy "members delete self or admin"
  on public.conversation_members for delete to authenticated
  using (user_id = auth.uid() or public.is_conversation_admin(conversation_id));

-- messages
drop policy if exists "messages visible to members" on public.messages;
create policy "messages visible to members"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "messages insert as self" on public.messages;
create policy "messages insert as self"
  on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

drop policy if exists "messages update own" on public.messages;
create policy "messages update own"
  on public.messages for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());

drop policy if exists "messages delete own" on public.messages;
create policy "messages delete own"
  on public.messages for delete to authenticated
  using (sender_id = auth.uid());

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
grant execute on function public.search_users(text) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.get_conversations_overview() to authenticated;

-- ------------------------------------------------------------
-- Realtime
-- ------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.conversation_members;
exception when duplicate_object then null; end $$;

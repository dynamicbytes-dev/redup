-- ============================================================================
-- Redup · Solicitudes de amistad (requeridas antes de conversar 1 a 1)
-- ============================================================================

create table if not exists public.friend_requests (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  pair_key    text not null unique,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

create index if not exists friend_requests_sender_idx
  on public.friend_requests (sender_id, status);

create index if not exists friend_requests_receiver_idx
  on public.friend_requests (receiver_id, status);

alter table public.friend_requests enable row level security;

drop policy if exists "friend_requests_select_participant" on public.friend_requests;
create policy "friend_requests_select_participant"
  on public.friend_requests for select
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists "friend_requests_insert_sender" on public.friend_requests;
create policy "friend_requests_insert_sender"
  on public.friend_requests for insert
  to authenticated
  with check (sender_id = auth.uid());

drop policy if exists "friend_requests_update_participant" on public.friend_requests;
create policy "friend_requests_update_participant"
  on public.friend_requests for update
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid())
  with check (sender_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists "friend_requests_delete_participant" on public.friend_requests;
create policy "friend_requests_delete_participant"
  on public.friend_requests for delete
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

-- Comprueba si dos usuarios tienen una amistad aceptada
create or replace function public.are_friends(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friend_requests fr
    where fr.pair_key = least(user_a, user_b)::text || ':' || greatest(user_a, user_b)::text
      and fr.status = 'accepted'
  );
$$;

grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- Envía una solicitud de amistad (o la acepta automáticamente si la otra persona ya la había enviado)
create or replace function public.send_friend_request(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  pk text;
  existing_row public.friend_requests%rowtype;
  req_id uuid;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  if target_user is null or target_user = me then
    raise exception 'invalid_target';
  end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = me and b.blocked_id = target_user)
       or (b.blocker_id = target_user and b.blocked_id = me)
  ) then
    raise exception 'blocked';
  end if;

  pk := least(me, target_user)::text || ':' || greatest(me, target_user)::text;

  select * into existing_row
  from public.friend_requests
  where pair_key = pk;

  if existing_row.id is not null then
    if existing_row.status = 'accepted' then
      return existing_row.id;
    elsif existing_row.status = 'pending' and existing_row.receiver_id = me then
      update public.friend_requests
      set status = 'accepted', updated_at = now()
      where id = existing_row.id;
      return existing_row.id;
    elsif existing_row.status = 'pending' and existing_row.sender_id = me then
      return existing_row.id;
    else
      -- Estaba rechazada: reenviar como nueva solicitud pendiente
      update public.friend_requests
      set sender_id = me,
          receiver_id = target_user,
          status = 'pending',
          updated_at = now()
      where id = existing_row.id;
      return existing_row.id;
    end if;
  end if;

  insert into public.friend_requests (sender_id, receiver_id, pair_key, status)
  values (me, target_user, pk, 'pending')
  returning id into req_id;

  return req_id;
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;

-- Acepta o rechaza una solicitud recibida
create or replace function public.respond_friend_request(
  request_id uuid,
  accept boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  req public.friend_requests%rowtype;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  select * into req
  from public.friend_requests
  where id = request_id;

  if req.id is null then
    raise exception 'request_not_found';
  end if;

  if req.receiver_id <> me then
    raise exception 'not_authorized';
  end if;

  update public.friend_requests
  set status = case when accept then 'accepted' else 'rejected' end,
      updated_at = now()
  where id = request_id;

  return req.id;
end;
$$;

grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- Actualizar get_or_create_direct_conversation para exigir amistad aceptada
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

  if not public.are_friends(me, other_user) then
    raise exception 'not_friends';
  end if;

  insert into public.conversations (type, created_by, direct_key)
  values ('direct', me, dk)
  returning id into cid;

  insert into public.conversation_members (conversation_id, user_id)
  values (cid, me), (cid, other_user);

  return cid;
end;
$$;

-- Restringir visualización de estados (historias) únicamente al propio autor y a sus amigos aceptados
drop policy if exists "statuses visible to non-blocked authenticated" on public.statuses;
drop policy if exists "statuses visible to friends and self" on public.statuses;
create policy "statuses visible to friends and self"
  on public.statuses for select to authenticated
  using (
    expires_at > now()
    and (
      statuses.user_id = auth.uid()
      or public.are_friends(auth.uid(), statuses.user_id)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = statuses.user_id and b.blocked_id = auth.uid())
         or (b.blocker_id = auth.uid() and b.blocked_id = statuses.user_id)
    )
  );

drop policy if exists "status_views insert own" on public.status_views;
create policy "status_views insert own"
  on public.status_views for insert to authenticated
  with check (
    viewer_id = auth.uid()
    and exists (
      select 1 from public.statuses s
      where s.id = status_views.status_id
        and (s.user_id = auth.uid() or public.are_friends(auth.uid(), s.user_id))
    )
  );

-- Garantizar unicidad estricta de nombre de usuario (case-insensitive y sin espacios)
create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(trim(username::text)));

create or replace function public.is_username_available(uname text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    char_length(lower(trim(coalesce(uname, '')))) between 3 and 20
    and not exists (
      select 1
      from public.profiles p
      where lower(trim(p.username::text)) = lower(trim(uname))
    );
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uname text;
  dname text;
begin
  uname := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    '[^a-z0-9_.]', '', 'g'
  ));

  if exists (
    select 1 from public.profiles p where lower(trim(p.username::text)) = uname
  ) then
    raise exception 'username_taken' using errcode = '23505';
  end if;

  dname := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), uname);

  insert into public.profiles (id, username, display_name)
  values (new.id, uname, dname);

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
end;
$$;


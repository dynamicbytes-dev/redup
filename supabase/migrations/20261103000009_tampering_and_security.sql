-- ============================================================================
-- Redup · Bloqueo de manipulación de campos (Field Tampering Prevention)
-- Rate limiting en DB, protección de roles y campos inmutables
-- ============================================================================

-- 1. Función genérica para prevenir alteración de campos inmutables en perfiles
create or replace function public.enforce_profiles_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id <> old.id then
    raise exception 'field_tampering: id is immutable';
  end if;
  if new.created_at <> old.created_at then
    raise exception 'field_tampering: created_at is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_profiles_immutability on public.profiles;
create trigger trg_enforce_profiles_immutability
  before update on public.profiles
  for each row execute function public.enforce_profiles_immutability();

-- 2. Prevenir alteración de autor, conversación o timestamps en mensajes
create or replace function public.enforce_messages_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id <> old.id then
    raise exception 'field_tampering: id is immutable';
  end if;
  if new.conversation_id <> old.conversation_id then
    raise exception 'field_tampering: conversation_id is immutable';
  end if;
  if new.sender_id <> old.sender_id then
    raise exception 'field_tampering: sender_id is immutable';
  end if;
  if new.created_at <> old.created_at then
    raise exception 'field_tampering: created_at is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_messages_immutability on public.messages;
create trigger trg_enforce_messages_immutability
  before update on public.messages
  for each row execute function public.enforce_messages_immutability();

-- 3. Prevenir elevación no autorizada de privilegios en miembros de grupos (roles)
create or replace function public.enforce_members_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversation_id <> old.conversation_id then
    raise exception 'field_tampering: conversation_id is immutable';
  end if;
  if new.user_id <> old.user_id then
    raise exception 'field_tampering: user_id is immutable';
  end if;
  if new.joined_at <> old.joined_at then
    raise exception 'field_tampering: joined_at is immutable';
  end if;

  -- Si se intenta cambiar el rol a 'admin' o de 'admin' a 'member', el ejecutor DEBE ser admin del grupo
  if new.role <> old.role then
    if not public.is_conversation_admin(new.conversation_id) then
      raise exception 'privilege_escalation: only conversation admins can change member roles';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_members_integrity on public.conversation_members;
create trigger trg_enforce_members_integrity
  before update on public.conversation_members
  for each row execute function public.enforce_members_integrity();

-- 4. Prevenir alteración de emisor, receptor o pair_key en solicitudes de amistad
create or replace function public.enforce_friend_requests_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id <> old.id then
    raise exception 'field_tampering: id is immutable';
  end if;
  if new.pair_key <> old.pair_key then
    raise exception 'field_tampering: pair_key is immutable';
  end if;
  if new.created_at <> old.created_at then
    raise exception 'field_tampering: created_at is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_friend_requests_immutability on public.friend_requests;
create trigger trg_enforce_friend_requests_immutability
  before update on public.friend_requests
  for each row execute function public.enforce_friend_requests_immutability();

-- 5. Rate limiting en base de datos para envío de solicitudes de amistad (máx 15 cada 5 min)
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
  recent_count int;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  if target_user is null or target_user = me then
    raise exception 'invalid_target';
  end if;

  -- Rate limit en DB: máx 15 solicitudes en los últimos 5 minutos
  select count(*) into recent_count
  from public.friend_requests
  where sender_id = me and created_at > (now() - interval '5 minutes');

  if recent_count >= 15 then
    raise exception 'rate_limit_exceeded: too many friend requests sent recently';
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


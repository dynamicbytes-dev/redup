-- ==============================================================================
-- Migración 21: Corrección de inserción de mensajes de sistema en servidores
-- Permite que join_server_by_code registre el mensaje de bienvenida sin activar
-- el bloqueo 'unauthorized_message_kind' en el trigger de seguridad.
-- ==============================================================================

-- 1. Actualizar el trigger de seguridad de mensajes en servidores
create or replace function public.enforce_server_message_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_messages integer;
  v_allow_system text;
begin
  new.created_at := now();

  -- Clientes no pueden insertar tipo 'system' arbitrariamente.
  -- Permitido si:
  --   1. redup.allow_system_message está en 'on' (funciones internas de confianza como join_server_by_code)
  --   2. El usuario es owner o admin del servidor
  --   3. Es un mensaje de evento de unión ('¡%se ha unido al servidor!%') o sender_id es nulo
  if new.kind = 'system' and auth.uid() is not null then
    v_allow_system := coalesce(current_setting('redup.allow_system_message', true), 'off');

    if v_allow_system <> 'on' and not public.is_server_admin_or_owner(new.server_id, auth.uid()) then
      if not (new.body like '¡%se ha unido al servidor!%' or new.body like '¡Un nuevo miembro%' or new.sender_id is null) then
        raise exception 'unauthorized_message_kind';
      end if;
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

-- 2. Asegurar trigger activo en server_channel_messages
drop trigger if exists trg_enforce_server_message_security on public.server_channel_messages;
create trigger trg_enforce_server_message_security
  before insert on public.server_channel_messages
  for each row execute function public.enforce_server_message_security();

-- 3. Actualizar join_server_by_code para limpiar URLs y permitir el mensaje del sistema
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
  v_user_name text;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  -- Limpiar URLs en caso de que el usuario haya pegado un enlace completo
  if v_clean_code like '%join/%' then
    v_clean_code := substring(v_clean_code from 'join/([^/?#]+)');
  elsif v_clean_code like '%/%' then
    v_clean_code := split_part(v_clean_code, '/', array_length(string_to_array(v_clean_code, '/'), 1));
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

    -- Obtener nombre para el mensaje
    select coalesce(display_name, username, 'Un nuevo miembro')
    into v_user_name
    from public.profiles
    where id = v_user_id;

    -- Mensaje de bienvenida en el primer canal de texto
    select id into v_first_channel_id
    from public.server_channels
    where server_id = v_server_id and type = 'text'
    order by position asc
    limit 1;

    if v_first_channel_id is not null then
      -- Activar bandera de sesión para permitir el mensaje del sistema
      perform set_config('redup.allow_system_message', 'on', true);

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
        '¡' || coalesce(v_user_name, 'Un nuevo miembro') || ' se ha unido al servidor! 👋'
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

-- 4. Actualizar get_server_preview_by_code para limpiar URLs automáticamente
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
  -- Limpiar URLs en caso de que hayan pegado un enlace completo
  if v_clean_code like '%join/%' then
    v_clean_code := substring(v_clean_code from 'join/([^/?#]+)');
  elsif v_clean_code like '%/%' then
    v_clean_code := split_part(v_clean_code, '/', array_length(string_to_array(v_clean_code, '/'), 1));
  end if;

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

-- ============================================================================
-- Redup · Corrección de regresiones de seguridad y privacidad
--
-- 1. last_seen_at / last_read_at pasan a ser NULLABLE: la privacidad se aplica
--    ocultando el valor (NULL) en lugar de romper la restricción NOT NULL.
-- 2. Estado de lectura INTERNO separado (conversation_read_state) para que el
--    contador de no leídos siga funcionando aunque el usuario oculte las
--    confirmaciones de lectura.
-- 3. get_conversations_overview usa el estado interno para los no leídos.
-- 4. Mensajes de sistema generados en servidor (post_system_event) para evitar
--    que un cliente pueda falsificar avisos del sistema con texto arbitrario.
-- 5. La política de perfiles permite leer a quien YO he bloqueado (para poder
--    gestionarlo/desbloquearlo) y sigue ocultando a quien me ha bloqueado.
-- 6. Helpers SECURITY DEFINER para que las políticas puedan ver bloqueos que la
--    RLS de `blocks` oculta (el bloqueado no puede leer la fila del bloqueo).
-- 7. Mensajes directos ocultos en ambos sentidos cuando hay un bloqueo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columnas de privacidad NULLABLE
-- ----------------------------------------------------------------------------
alter table public.profiles alter column last_seen_at drop not null;
alter table public.conversation_members alter column last_read_at drop not null;

-- ----------------------------------------------------------------------------
-- 2. Estado de lectura interno (privado)
-- ----------------------------------------------------------------------------
create table if not exists public.conversation_read_state (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_read_state_user_idx
  on public.conversation_read_state (user_id);

alter table public.conversation_read_state enable row level security;
alter table public.conversation_read_state force row level security;

drop policy if exists "read_state own select" on public.conversation_read_state;
create policy "read_state own select"
  on public.conversation_read_state for select to authenticated
  using (user_id = auth.uid());

-- Sembrar el estado existente a partir de la última lectura conocida
insert into public.conversation_read_state (conversation_id, user_id, last_read_at)
select m.conversation_id,
       m.user_id,
       coalesce(m.last_read_at, m.joined_at)
from public.conversation_members m
on conflict (conversation_id, user_id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. marcar leído: estado interno siempre, recibo público según privacidad
-- ----------------------------------------------------------------------------
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

  if not public.is_conversation_member(conv, me) then
    return;
  end if;

  select read_receipts into v_read_receipts
  from public.profiles
  where id = me;

  insert into public.conversation_read_state (conversation_id, user_id, last_read_at)
  values (conv, me, now())
  on conflict (conversation_id, user_id)
  do update set last_read_at = now();

  update public.conversation_members
  set last_read_at = case when coalesce(v_read_receipts, true) then now() else null end
  where conversation_id = conv and user_id = me;
end;
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Limpiar el estado interno cuando alguien sale del grupo o es eliminado,
-- para que al volver a entrar no herede una posición de lectura antigua.
create or replace function public.cleanup_conversation_read_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.conversation_read_state
  where conversation_id = old.conversation_id
    and user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists trg_cleanup_read_state on public.conversation_members;
create trigger trg_cleanup_read_state
  after delete on public.conversation_members
  for each row execute function public.cleanup_conversation_read_state();

-- ----------------------------------------------------------------------------
-- 4. Vista general de conversaciones usando el estado interno de lectura
-- ----------------------------------------------------------------------------
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
    select
      m.conversation_id,
      m.last_read_at,
      m.muted_until,
      m.role,
      m.joined_at,
      coalesce(rs.last_read_at, m.joined_at) as internal_last_read_at
    from public.conversation_members m
    left join public.conversation_read_state rs
      on rs.conversation_id = m.conversation_id
     and rs.user_id = m.user_id
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
        and m2.created_at > mine.internal_last_read_at
        and m2.sender_id is distinct from auth.uid()
        and m2.deleted_at is null
    ), 0),
    (select count(*)::integer from public.conversation_members m3 where m3.conversation_id = c.id),
    ou.user_id,
    p.username::text,
    coalesce(ct.alias, p.display_name),
    p.avatar_path,
    case when coalesce(p.show_online, true) then p.last_seen_at else null end,
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

grant execute on function public.get_conversations_overview() to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Mensajes de sistema: solo el servidor decide el contenido
-- ----------------------------------------------------------------------------
-- El trigger ya no bloquea por completo los mensajes de sistema; exige que la
-- inserción venga marcada por una función SECURITY DEFINER de confianza.
create or replace function public.enforce_message_insert_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_messages integer;
  v_allow_system text;
begin
  -- 1. created_at siempre lo decide el servidor
  new.created_at := now();

  -- 2. Los clientes no pueden insertar mensajes de sistema directamente.
  --    Solo se permiten si una función de confianza activó el flag de sesión.
  if new.kind = 'system' and auth.uid() is not null then
    v_allow_system := coalesce(current_setting('redup.allow_system_message', true), 'off');
    if v_allow_system <> 'on' then
      raise exception 'unauthorized_message_kind: clients cannot insert system messages';
    end if;
  end if;

  -- 3. Rate limiting en base de datos: máx 20 mensajes cada 10 segundos
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

-- RPC para publicar eventos de sistema con texto generado en el servidor.
create or replace function public.post_system_event(
  p_conversation_id uuid,
  p_event text,
  p_target_name text default null,
  p_call_kind text default null,
  p_call_status text default null,
  p_duration_sec integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_conv record;
  v_profile record;
  v_body text;
  v_id uuid := gen_random_uuid();
  v_duration integer;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_conversation_member(p_conversation_id, me) then
    raise exception 'not_member';
  end if;

  select id, type, name into v_conv
  from public.conversations
  where id = p_conversation_id;

  if v_conv.id is null then
    raise exception 'conversation_not_found';
  end if;

  select display_name, username into v_profile
  from public.profiles
  where id = me;

  if p_event in ('group_created', 'group_updated', 'members_added', 'member_removed', 'role_admin', 'role_member') then
    if not public.is_conversation_admin(p_conversation_id, me) then
      raise exception 'not_admin';
    end if;
  end if;

  if p_event = 'group_created' then
    if v_conv.type <> 'group' then
      raise exception 'invalid_event';
    end if;
    v_body := 'Creó el grupo “' || coalesce(v_conv.name, 'grupo') || '”';

  elsif p_event = 'group_updated' then
    if v_conv.type <> 'group' then
      raise exception 'invalid_event';
    end if;
    v_body := 'Cambió el nombre del grupo a “' || coalesce(v_conv.name, 'grupo') || '”';

  elsif p_event = 'members_added' then
    v_body := 'Añadió a ' || coalesce(nullif(trim(p_target_name), ''), 'nuevos participantes');

  elsif p_event = 'member_removed' then
    v_body := 'Eliminó a ' || coalesce(nullif(trim(p_target_name), ''), 'un participante') || ' del grupo';

  elsif p_event = 'role_admin' then
    v_body := 'Nombró administrador a ' || coalesce(nullif(trim(p_target_name), ''), 'un participante');

  elsif p_event = 'role_member' then
    v_body := 'Quitó como administrador a ' || coalesce(nullif(trim(p_target_name), ''), 'un participante');

  elsif p_event = 'member_left' then
    if v_conv.type <> 'group' then
      raise exception 'invalid_event';
    end if;
    v_body := coalesce(v_profile.display_name, v_profile.username, 'Alguien') || ' salió del grupo';

  elsif p_event = 'call_summary' then
    if coalesce(p_call_kind, '') not in ('voice', 'video') then
      raise exception 'invalid_call_kind';
    end if;
    if coalesce(p_call_status, '') not in ('completed', 'missed', 'declined') then
      raise exception 'invalid_call_status';
    end if;

    v_body := case when p_call_kind = 'video' then '📹 Videollamada' else '📞 Llamada de voz' end;
    v_duration := greatest(coalesce(p_duration_sec, 0), 0);

    if p_call_status = 'completed' and v_duration > 0 then
      v_body := v_body || ' · ' || (v_duration / 60)::text || ':' ||
                lpad((v_duration % 60)::text, 2, '0');
    elsif p_call_status = 'declined' then
      v_body := v_body || ' rechazada';
    else
      v_body := v_body || ' sin respuesta';
    end if;

  else
    raise exception 'invalid_system_event';
  end if;

  perform set_config('redup.allow_system_message', 'on', true);
  insert into public.messages (id, conversation_id, sender_id, kind, body)
  values (v_id, p_conversation_id, me, 'system', v_body);
  perform set_config('redup.allow_system_message', 'off', true);

  return v_id;
end;
$$;

grant execute on function public.post_system_event(uuid, text, text, text, text, integer) to authenticated;

-- La RPC antigua de creación de grupos también genera un mensaje de sistema:
-- debe activar el flag de confianza.
create or replace function public.create_group_conversation(
  group_name text,
  member_ids uuid[],
  group_avatar text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  cid uuid;
  uid uuid;
  clean_name text := trim(coalesce(group_name, ''));
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(clean_name) < 1 or char_length(clean_name) > 60 then
    raise exception 'invalid_group_name';
  end if;

  insert into public.conversations (type, name, avatar_path, created_by)
  values ('group', clean_name, group_avatar, me)
  returning id into cid;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (cid, me, 'admin');

  if member_ids is not null then
    foreach uid in array member_ids loop
      if uid is not null and uid <> me then
        insert into public.conversation_members (conversation_id, user_id, role)
        values (cid, uid, 'member')
        on conflict (conversation_id, user_id) do nothing;
      end if;
    end loop;
  end if;

  perform set_config('redup.allow_system_message', 'on', true);
  insert into public.messages (id, conversation_id, sender_id, kind, body)
  values (
    gen_random_uuid(),
    cid,
    me,
    'system',
    'Creó el grupo “' || clean_name || '”'
  );
  perform set_config('redup.allow_system_message', 'off', true);

  return cid;
end;
$$;

grant execute on function public.create_group_conversation(text, uuid[], text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Bloqueos: helpers que sí pueden ver la fila de bloqueo (evitan RLS)
-- ----------------------------------------------------------------------------
-- `is_blocked_by_me` ya existe en la migración inicial. Añadimos el inverso:
-- ¿la otra persona me ha bloqueado? Sin esto, la RLS de `blocks` oculta la fila
-- al usuario bloqueado y la política no puede detectar el bloqueo.
create or replace function public.has_blocked_me(other uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks b
    where b.blocker_id = other and b.blocked_id = uid
  );
$$;

grant execute on function public.has_blocked_me(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Perfiles: permitir ver a quien YO bloqueé (para desbloquear)
-- ----------------------------------------------------------------------------
drop policy if exists "profiles scoped read" on public.profiles;

create policy "profiles scoped read"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or (
      -- Si esa persona me bloqueó, no puedo ver su perfil
      not public.has_blocked_me(profiles.id)
      and (
        -- Puedo ver a quien yo he bloqueado (para gestionarlo)
        public.is_blocked_by_me(profiles.id)
        -- O si compartimos conversación
        or exists (
          select 1
          from public.conversation_members cm_me
          join public.conversation_members cm_them
            on cm_me.conversation_id = cm_them.conversation_id
          where cm_me.user_id = auth.uid()
            and cm_them.user_id = profiles.id
        )
        -- O somos amigos
        or public.are_friends(auth.uid(), profiles.id)
        -- O existe una solicitud de amistad entre ambos
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
-- 8. Mensajes: ocultar los de cualquier usuario con quien haya bloqueo mutuo
-- ----------------------------------------------------------------------------
-- La política anterior consultaba `blocks` directamente y, por RLS, no veía
-- los bloqueos creados por la otra persona. Usamos los helpers SECURITY DEFINER.
drop policy if exists "messages visible to members" on public.messages;

create policy "messages visible to members"
  on public.messages for select
  to authenticated
  using (
    public.is_conversation_member(conversation_id)
    and (
      -- En grupos los bloqueos no ocultan mensajes (igual que el trigger de envío)
      not exists (
        select 1 from public.conversations c
        where c.id = messages.conversation_id and c.type = 'direct'
      )
      -- En conversaciones directas, ocultar si hay bloqueo en cualquier dirección
      or (
        not public.is_blocked_by_me(messages.sender_id)
        and not public.has_blocked_me(messages.sender_id)
      )
    )
  );

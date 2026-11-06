-- ============================================================================
-- Redup · Test Suite Automatizado de Seguridad, RLS y RPCs
-- ============================================================================

begin;

-- Helper para aserciones simples
create or replace function pg_temp.assert(condition boolean, test_name text)
returns void as $$
begin
  if not condition then
    raise exception 'TEST FAILED: %', test_name;
  end if;
  raise notice 'TEST PASSED: %', test_name;
end;
$$ language plpgsql;

-- Helper para crear usuario de prueba válido en auth.users y profiles
create or replace function pg_temp.create_test_user(p_id uuid, p_email text, p_username text, p_name text)
returns void as $$
begin
  insert into auth.users (id, email, raw_user_meta_data, role, aud)
  values (p_id, p_email, '{}'::jsonb, 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  insert into public.profiles (id, username, display_name)
  values (p_id, p_username, p_name)
  on conflict (id) do update set username = excluded.username;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- TEST 1: Idempotencia de Push Notifications (acquire_push_dispatch_lock)
-- ----------------------------------------------------------------------------
do $$
declare
  v_test_msg_id uuid := gen_random_uuid();
  v_first_lock boolean;
  v_second_lock boolean;
  v_conv_id uuid := gen_random_uuid();
  v_user1 uuid := gen_random_uuid();
begin
  -- Crear conversación y mensaje sintético para la prueba
  insert into public.conversations (id, type) values (v_conv_id, 'direct');
  insert into public.messages (id, conversation_id, sender_id, kind, body)
  values (v_test_msg_id, v_conv_id, null, 'text', 'Mensaje de prueba');

  -- Primera adquisición de lock: debe ser TRUE
  select public.acquire_push_dispatch_lock(v_test_msg_id) into v_first_lock;
  perform pg_temp.assert(v_first_lock = true, 'push_idempotency: primer lock exitoso');

  -- Segunda adquisición con el mismo message_id: debe ser FALSE (idempotente)
  select public.acquire_push_dispatch_lock(v_test_msg_id) into v_second_lock;
  perform pg_temp.assert(v_second_lock = false, 'push_idempotency: segundo lock bloqueado (evita duplicados)');
end $$;

-- ----------------------------------------------------------------------------
-- TEST 2: Rate Limiting Distribuido Server-side (check_auth_rate_limit)
-- ----------------------------------------------------------------------------
do $$
declare
  v_key text := 'test_ip_' || gen_random_uuid();
  v_allowed boolean;
begin
  -- Primeros 3 intentos con límite 3: deben permitirse
  select public.check_auth_rate_limit(v_key, 3, 60) into v_allowed;
  perform pg_temp.assert(v_allowed = true, 'rate_limit: intento 1 permitido');

  select public.check_auth_rate_limit(v_key, 3, 60) into v_allowed;
  perform pg_temp.assert(v_allowed = true, 'rate_limit: intento 2 permitido');

  select public.check_auth_rate_limit(v_key, 3, 60) into v_allowed;
  perform pg_temp.assert(v_allowed = true, 'rate_limit: intento 3 permitido');

  -- 4to intento: debe bloquearse (false)
  select public.check_auth_rate_limit(v_key, 3, 60) into v_allowed;
  perform pg_temp.assert(v_allowed = false, 'rate_limit: intento 4 bloqueado (límite alcanzado)');
end $$;

-- ----------------------------------------------------------------------------
-- TEST 3: Anti-falsificación en mensajes (created_at y kind='system')
-- ----------------------------------------------------------------------------
do $$
declare
  v_conv_id uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_msg_id uuid := gen_random_uuid();
  v_actual_created timestamptz;
  v_err_caught boolean := false;
begin
  perform set_config('role', 'postgres', true);

  -- Crear usuario y perfil válidos
  perform pg_temp.create_test_user(
    v_user,
    'user_' || substring(replace(v_user::text, '-', '') from 1 for 10) || '@test.local',
    'u_' || substring(replace(v_user::text, '-', '') from 1 for 10),
    'Test User'
  );

  insert into public.conversations (id, type) values (v_conv_id, 'direct');
  insert into public.conversation_members (conversation_id, user_id) values (v_conv_id, v_user);

  -- Simular usuario autenticado
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('role', 'authenticated', true);

  -- 3.1: Prohibir kind = 'system' desde cliente autenticado
  begin
    insert into public.messages (id, conversation_id, sender_id, kind, body)
    values (gen_random_uuid(), v_conv_id, v_user, 'system', 'Aviso falso de sistema');
  exception when others then
    v_err_caught := true;
  end;
  perform pg_temp.assert(v_err_caught = true, 'messages: inserción de kind=system bloqueada para clientes');

  -- 3.2: created_at forzado a now() aunque el cliente intente enviar fecha futura
  insert into public.messages (id, conversation_id, sender_id, kind, body, created_at)
  values (v_msg_id, v_conv_id, v_user, 'text', 'Mensaje con fecha futura falsa', '2099-01-01 00:00:00Z');

  select created_at into v_actual_created from public.messages where id = v_msg_id;
  perform pg_temp.assert(v_actual_created < now() + interval '5 seconds', 'messages: created_at sobreescrito con la hora real del servidor');
end $$;

-- ----------------------------------------------------------------------------
-- TEST 4: Bloqueo estricto entre usuarios (cannot_send_to_blocked_user)
-- ----------------------------------------------------------------------------
do $$
declare
  v_conv_id uuid := gen_random_uuid();
  v_alice uuid := gen_random_uuid();
  v_bob uuid := gen_random_uuid();
  v_err_caught boolean := false;
begin
  -- Configurar rol postgres para setup
  perform set_config('role', 'postgres', true);

  -- Crear usuarios de prueba
  perform pg_temp.create_test_user(
    v_alice,
    'alice_' || substring(replace(v_alice::text, '-', '') from 1 for 10) || '@test.local',
    'a_' || substring(replace(v_alice::text, '-', '') from 1 for 10),
    'Alice'
  );
  perform pg_temp.create_test_user(
    v_bob,
    'bob_' || substring(replace(v_bob::text, '-', '') from 1 for 10) || '@test.local',
    'b_' || substring(replace(v_bob::text, '-', '') from 1 for 10),
    'Bob'
  );

  insert into public.conversations (id, type) values (v_conv_id, 'direct');
  insert into public.conversation_members (conversation_id, user_id) values (v_conv_id, v_alice), (v_conv_id, v_bob);

  -- Alice bloquea a Bob
  insert into public.blocks (blocker_id, blocked_id) values (v_alice, v_bob);

  -- Bob intenta enviar mensaje a la conversación
  perform set_config('request.jwt.claim.sub', v_bob::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    insert into public.messages (id, conversation_id, sender_id, kind, body)
    values (gen_random_uuid(), v_conv_id, v_bob, 'text', 'Hola Alice');
  exception when others then
    v_err_caught := true;
  end;

  perform pg_temp.assert(v_err_caught = true, 'blocks: usuario bloqueado no puede enviar mensajes');
end $$;

-- ----------------------------------------------------------------------------
-- TEST 5: Eliminación de cuenta completa (delete_my_account)
-- ----------------------------------------------------------------------------
do $$
declare
  v_victim uuid := gen_random_uuid();
  v_conv_id uuid := gen_random_uuid();
  v_msg_id uuid := gen_random_uuid();
  v_user_exists boolean;
  v_msg_body text;
  v_msg_media text;
  v_msg_deleted timestamptz;
begin
  perform set_config('role', 'postgres', true);

  -- Crear usuario sintético en auth.users y profile
  perform pg_temp.create_test_user(v_victim, 'victim@test.local', 'victim_user', 'Victim User');

  -- Crear una conversación y un mensaje con archivo adjunto de la víctima
  insert into public.conversations (id, type) values (v_conv_id, 'direct');
  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv_id, v_victim);
  insert into public.messages (id, conversation_id, sender_id, kind, body, media_path)
  values (v_msg_id, v_conv_id, v_victim, 'image', 'Foto privada', 'media/test/foto.jpg');

  -- Simular sesión de la víctima
  perform set_config('request.jwt.claim.sub', v_victim::text, true);
  perform set_config('role', 'authenticated', true);

  -- Ejecutar eliminación de cuenta
  perform public.delete_my_account();

  -- Verificar que fue eliminado de auth.users y que su mensaje quedó sin contenido
  perform set_config('role', 'postgres', true);
  select exists (select 1 from auth.users where id = v_victim) into v_user_exists;
  select body, media_path, deleted_at
    into v_msg_body, v_msg_media, v_msg_deleted
  from public.messages
  where id = v_msg_id;

  perform pg_temp.assert(v_user_exists = false, 'delete_my_account: cuenta purgada completamente');
  perform pg_temp.assert(v_msg_deleted is not null, 'delete_my_account: mensajes marcados como eliminados');
  perform pg_temp.assert(v_msg_body is null, 'delete_my_account: cuerpo del mensaje borrado');
  perform pg_temp.assert(v_msg_media is null, 'delete_my_account: referencia a archivo borrada');
end $$;

rollback; -- Revertir cambios de prueba para no ensuciar la base de datos

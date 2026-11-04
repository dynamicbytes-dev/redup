-- ============================================================
-- Redup · datos de prueba (solo local)
-- Todos los usuarios tienen la contraseña: redup123
--   ana / luis / sofia
-- ============================================================

do $$
declare
  ana   uuid := '11111111-1111-4111-8111-111111111111';
  luis  uuid := '22222222-2222-4222-8222-222222222222';
  sofia uuid := '33333333-3333-4333-8333-333333333333';
  conv  uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  grp   uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  )
  values
    ('00000000-0000-0000-0000-000000000000', ana,  'authenticated', 'authenticated',
     'ana@redup.app',   extensions.crypt('redup123', extensions.gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}',
     jsonb_build_object('username', 'ana', 'display_name', 'Ana Torres'),
     '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', luis, 'authenticated', 'authenticated',
     'luis@redup.app',  extensions.crypt('redup123', extensions.gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}',
     jsonb_build_object('username', 'luis', 'display_name', 'Luis Méndez'),
     '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', sofia,'authenticated', 'authenticated',
     'sofia@redup.app', extensions.crypt('redup123', extensions.gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}',
     jsonb_build_object('username', 'sofia', 'display_name', 'Sofía Ríos'),
     '', '', '', '', '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), ana,  ana::text,  jsonb_build_object('sub', ana::text,  'email', 'ana@redup.app'),  'email', now(), now(), now()),
    (gen_random_uuid(), luis, luis::text, jsonb_build_object('sub', luis::text, 'email', 'luis@redup.app'), 'email', now(), now(), now()),
    (gen_random_uuid(), sofia,sofia::text,jsonb_build_object('sub', sofia::text,'email', 'sofia@redup.app'),'email', now(), now(), now())
  on conflict do nothing;

  -- perfil extra (por si el trigger no rellenó "about")
  update public.profiles set about = 'Fotografía y café' where id = ana;
  update public.profiles set about = 'Siempre en la bici' where id = luis;

  -- conversación directa ana <-> luis
  insert into public.conversations (id, type, created_by, direct_key)
  values (conv, 'direct', ana, least(ana, luis)::text || ':' || greatest(ana, luis)::text)
  on conflict (id) do nothing;

  insert into public.conversation_members (conversation_id, user_id, last_read_at)
  values (conv, ana, now()), (conv, luis, now() - interval '2 hours')
  on conflict do nothing;

  insert into public.messages (id, conversation_id, sender_id, kind, body, created_at)
  values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', conv, luis, 'text', '¿Viste el nuevo diseño?', now() - interval '3 hours'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', conv, ana,  'text', 'Sí, me encantó el índigo 💜', now() - interval '2 hours 50 minutes'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03', conv, luis, 'text', 'Nos vemos mañana entonces', now() - interval '2 hours')
  on conflict (id) do nothing;

  update public.conversations set last_message_at = now() - interval '2 hours' where id = conv;

  -- grupo de ejemplo (ana admin, luis y sofia miembros)
  insert into public.conversations (id, type, name, created_by)
  values (grp, 'group', 'Equipo Redup 🚀', ana)
  on conflict (id) do nothing;

  insert into public.conversation_members (conversation_id, user_id, role, last_read_at)
  values
    (grp, ana,   'admin',  now()),
    (grp, luis,  'member', now() - interval '30 minutes'),
    (grp, sofia, 'member', now() - interval '1 hour')
  on conflict do nothing;

  insert into public.messages (id, conversation_id, sender_id, kind, body, created_at)
  values
    ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', grp, ana,   'system', 'Creó el grupo “Equipo Redup 🚀”', now() - interval '90 minutes'),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', grp, sofia, 'text',   '¡Hola equipo! Ya están listos los grupos.', now() - interval '45 minutes'),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddd03', grp, ana,   'text',   'Genial, probemos añadir más participantes.', now() - interval '20 minutes')
  on conflict (id) do nothing;

  update public.conversations set last_message_at = now() - interval '20 minutes' where id = grp;

  -- estados de ejemplo (24 h)
  insert into public.statuses (id, user_id, kind, caption, bg_color, created_at, expires_at)
  values
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', luis,  'text', 'Ruta matutina de 35 km terminada 🚴‍♂️✨', '#0E9F6E', now() - interval '2 hours', now() + interval '22 hours'),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', sofia, 'text', 'Probando los nuevos estados de 24 h en Redup 💜', '#5B4BE8', now() - interval '45 minutes', now() + interval '23 hours')
  on conflict (id) do nothing;

  -- registro de llamadas de ejemplo (Fase 8)
  insert into public.call_logs (id, conversation_id, caller_id, callee_id, kind, status, room_name, started_at, answered_at, ended_at, duration_sec)
  values
    ('ffffffff-ffff-4fff-8fff-ffffffffff01', conv, luis, ana,  'voice', 'completed', 'redup-conv-seed-1', now() - interval '4 hours', now() - interval '4 hours' + interval '5 seconds', now() - interval '3 hours 54 minutes', 355),
    ('ffffffff-ffff-4fff-8fff-ffffffffff02', conv, ana,  luis, 'video', 'missed',    'redup-conv-seed-2', now() - interval '95 minutes', null, now() - interval '94 minutes', 0),
    ('ffffffff-ffff-4fff-8fff-ffffffffff03', grp,  sofia, null,'voice', 'completed', 'redup-grp-seed-3',  now() - interval '35 minutes', now() - interval '35 minutes' + interval '4 seconds', now() - interval '28 minutes', 416)
  on conflict (id) do nothing;
end $$;

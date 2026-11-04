-- ============================================================
-- Redup · Fase 3 (Grupos: crear, miembros, admins)
-- ============================================================

-- Permitir al creador leer la conversación recién insertada antes de añadir miembros
drop policy if exists "conversations visible to members" on public.conversations;
create policy "conversations visible to members"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id) or created_by = auth.uid());

-- RPC transaccional para crear un grupo con miembros iniciales y mensaje de sistema
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

  insert into public.messages (id, conversation_id, sender_id, kind, body)
  values (
    gen_random_uuid(),
    cid,
    me,
    'system',
    'Creó el grupo “' || clean_name || '”'
  );

  return cid;
end;
$$;

grant execute on function public.create_group_conversation(text, uuid[], text) to authenticated;


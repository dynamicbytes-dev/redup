-- ============================================================================
-- Redup · Fase 7 (Notificaciones push con Expo Notifications)
-- ============================================================================

create table if not exists public.push_tokens (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  token        text not null,
  platform     text not null check (platform in ('ios', 'android', 'web')),
  device_name  text,
  updated_at   timestamptz not null default now(),
  primary key (user_id, token)
);

create index if not exists push_tokens_user_idx
  on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
  on public.push_tokens for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
  on public.push_tokens for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
  on public.push_tokens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own"
  on public.push_tokens for delete
  to authenticated
  using (user_id = auth.uid());

-- Registra o actualiza el token push del dispositivo actual
create or replace function public.upsert_push_token(
  p_token text,
  p_platform text,
  p_device_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  if p_token is null or length(trim(p_token)) = 0 then
    return;
  end if;

  -- Si el mismo dispositivo tenía sesión con otra cuenta, reasignamos el token
  delete from public.push_tokens
  where token = p_token
    and user_id <> me;

  insert into public.push_tokens (user_id, token, platform, device_name, updated_at)
  values (me, trim(p_token), p_platform, p_device_name, now())
  on conflict (user_id, token)
  do update set
    platform = excluded.platform,
    device_name = coalesce(excluded.device_name, public.push_tokens.device_name),
    updated_at = now();
end;
$$;

grant execute on function public.upsert_push_token(text, text, text) to authenticated;

-- Elimina el token push al cerrar sesión o desactivar notificaciones
create or replace function public.remove_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return;
  end if;

  delete from public.push_tokens
  where user_id = me
    and token = p_token;
end;
$$;

grant execute on function public.remove_push_token(text) to authenticated;

-- Obtiene los tokens Expo Push de los destinatarios activos de una conversación
-- respetando conversaciones silenciadas (muted_until) y bloqueos (blocks).
create or replace function public.get_conversation_push_targets(conv uuid)
returns table (
  user_id uuid,
  token text,
  platform text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_conversation_member(conv, me) then
    raise exception 'not_member';
  end if;

  return query
  select
    pt.user_id,
    pt.token,
    pt.platform
  from public.conversation_members cm
  join public.push_tokens pt on pt.user_id = cm.user_id
  where cm.conversation_id = conv
    and cm.user_id <> me
    and (cm.muted_until is null or cm.muted_until <= now())
    and not exists (
      select 1
      from public.blocks b
      where b.blocker_id = cm.user_id
        and b.blocked_id = me
    );
end;
$$;

grant execute on function public.get_conversation_push_targets(uuid) to authenticated;


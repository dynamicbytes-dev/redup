-- ============================================================================
-- Redup · Fase 8 (Llamadas de voz y vídeo con LiveKit + historial de llamadas)
-- ============================================================================

create table if not exists public.call_logs (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id       uuid not null references public.profiles(id) on delete cascade,
  callee_id       uuid references public.profiles(id) on delete set null,
  kind            text not null check (kind in ('voice', 'video')),
  status          text not null default 'ringing' check (status in ('ringing', 'ongoing', 'completed', 'missed', 'declined')),
  room_name       text not null,
  started_at      timestamptz not null default now(),
  answered_at     timestamptz,
  ended_at        timestamptz,
  duration_sec    integer not null default 0
);

create index if not exists call_logs_conversation_idx
  on public.call_logs (conversation_id, started_at desc);

create index if not exists call_logs_caller_idx
  on public.call_logs (caller_id, started_at desc);

create index if not exists call_logs_callee_idx
  on public.call_logs (callee_id, started_at desc);

alter table public.call_logs enable row level security;

drop policy if exists "call_logs_select_member" on public.call_logs;
create policy "call_logs_select_member"
  on public.call_logs for select
  to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "call_logs_insert_member" on public.call_logs;
create policy "call_logs_insert_member"
  on public.call_logs for insert
  to authenticated
  with check (
    caller_id = auth.uid()
    and public.is_conversation_member(conversation_id, auth.uid())
  );

drop policy if exists "call_logs_update_member" on public.call_logs;
create policy "call_logs_update_member"
  on public.call_logs for update
  to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()))
  with check (public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "call_logs_delete_member" on public.call_logs;
create policy "call_logs_delete_member"
  on public.call_logs for delete
  to authenticated
  using (
    caller_id = auth.uid()
    or callee_id = auth.uid()
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_logs'
  ) then
    alter publication supabase_realtime add table public.call_logs;
  end if;
end;
$$;


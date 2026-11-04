-- ============================================================
-- Redup · Fase 6 (Estados de 24 horas)
-- ============================================================

create table if not exists public.statuses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null default 'text' check (kind in ('text', 'image')),
  caption     text,
  bg_color    text not null default '#5B4BE8',
  media_path  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  constraint statuses_content_required check (
    (kind = 'text' and caption is not null and char_length(trim(caption)) > 0)
    or (kind = 'image' and media_path is not null)
  )
);

create index if not exists statuses_expires_idx
  on public.statuses (expires_at desc, created_at asc);

create index if not exists statuses_user_idx
  on public.statuses (user_id, created_at asc);

create table if not exists public.status_views (
  status_id  uuid not null references public.statuses (id) on delete cascade,
  viewer_id  uuid not null references public.profiles (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (status_id, viewer_id)
);

create index if not exists status_views_status_idx
  on public.status_views (status_id, viewed_at desc);

alter table public.statuses     enable row level security;
alter table public.status_views enable row level security;

-- Políticas de statuses
drop policy if exists "statuses visible to non-blocked authenticated" on public.statuses;
create policy "statuses visible to non-blocked authenticated"
  on public.statuses for select to authenticated
  using (
    expires_at > now()
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = statuses.user_id and b.blocked_id = auth.uid())
         or (b.blocker_id = auth.uid() and b.blocked_id = statuses.user_id)
    )
  );

drop policy if exists "statuses insert own" on public.statuses;
create policy "statuses insert own"
  on public.statuses for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "statuses delete own" on public.statuses;
create policy "statuses delete own"
  on public.statuses for delete to authenticated
  using (user_id = auth.uid());

-- Políticas de status_views
drop policy if exists "status_views readable by owner or viewer" on public.status_views;
create policy "status_views readable by owner or viewer"
  on public.status_views for select to authenticated
  using (
    viewer_id = auth.uid()
    or exists (
      select 1 from public.statuses s
      where s.id = status_views.status_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "status_views insert own" on public.status_views;
create policy "status_views insert own"
  on public.status_views for insert to authenticated
  with check (viewer_id = auth.uid());

drop policy if exists "status_views update own" on public.status_views;
create policy "status_views update own"
  on public.status_views for update to authenticated
  using (viewer_id = auth.uid())
  with check (viewer_id = auth.uid());

-- Realtime
do $$ begin
  alter publication supabase_realtime add table public.statuses;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.status_views;
exception when duplicate_object then null; end $$;


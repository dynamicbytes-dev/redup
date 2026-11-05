-- ============================================================================
-- Redup · Cumplimiento de App Store / Moderación y Eliminación de Cuenta
-- 1. Eliminación de cuenta por parte del usuario (App Store Guideline 5.1.1(v))
-- 2. Sistema de Reportes y Moderación de Contenido Generado por Usuarios (Apple 1.2)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ELIMINACIÓN DE CUENTA (delete_my_account)
-- ----------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  -- 1. Limpiar fotos y archivos multimedia de Storage creados por el usuario
  delete from storage.objects
  where bucket_id in ('avatars', 'statuses')
    and (storage.foldername(name))[1] = me::text;

  -- 2. Limpiar push tokens
  delete from public.push_tokens
  where user_id = me;

  -- 3. Eliminar la cuenta en auth.users (cascada automática a profiles y relaciones)
  delete from auth.users
  where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. SISTEMA DE REPORTES Y MODERACIÓN (UGC - Apple 1.2)
-- ----------------------------------------------------------------------------
create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  content_type     text not null check (content_type in ('user', 'message', 'status')),
  content_id       text,
  reason           text not null check (reason in ('spam', 'harassment', 'inappropriate_content', 'violence', 'other')),
  details          text,
  status           text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at       timestamptz not null default now()
);

alter table public.reports enable row level security;
alter table public.reports force row level security;

-- Los usuarios solo pueden insertar sus propios reportes
drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Los usuarios solo pueden consultar los reportes que ellos mismos emitieron
drop policy if exists "reports select own" on public.reports;
create policy "reports select own"
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid());

-- Rate limit para reportes: máximo 5 reportes por minuto por usuario
create or replace function public.enforce_reports_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_reports integer;
begin
  select count(*)
  into v_recent_reports
  from public.reports
  where reporter_id = new.reporter_id
    and created_at > now() - interval '1 minute';

  if v_recent_reports >= 5 then
    raise exception 'rate_limit_exceeded: too many reports submitted';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_reports_rate_limit on public.reports;
create trigger trg_enforce_reports_rate_limit
  before insert on public.reports
  for each row execute function public.enforce_reports_rate_limit();


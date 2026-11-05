-- ============================================================================
-- Redup · Idempotencia Push, Rate Limit Server-side y Automatización pg_cron
-- 1. Idempotencia en push-notify con lock atómico en Postgres
-- 2. Rate limiting server-side distribuido para autenticación (auth-login)
-- 3. Automatización de purga de estados expirados y storage con pg_cron
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. IDEMPOTENCIA EN PUSH NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table if not exists public.push_dispatch_log (
  message_id    uuid primary key references public.messages(id) on delete cascade,
  dispatched_at timestamptz not null default now(),
  target_count  integer not null default 0
);

alter table public.push_dispatch_log enable row level security;
alter table public.push_dispatch_log force row level security;

revoke all on public.push_dispatch_log from anon, authenticated;
grant all on public.push_dispatch_log to service_role;

-- Intenta adquirir el lock atómico de despacho para un message_id.
-- Devuelve true si es la primera vez (lock adquirido), false si ya fue despachado.
create or replace function public.acquire_push_dispatch_lock(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_dispatch_log (message_id)
  values (p_message_id)
  on conflict (message_id) do nothing;

  return found;
end;
$$;

revoke execute on function public.acquire_push_dispatch_lock(uuid) from anon, authenticated;
grant execute on function public.acquire_push_dispatch_lock(uuid) to service_role;

-- Actualiza la cantidad de destinatarios alcanzados
create or replace function public.record_push_dispatch_count(p_message_id uuid, p_count integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_dispatch_log
  set target_count = p_count
  where message_id = p_message_id;
$$;

revoke execute on function public.record_push_dispatch_count(uuid, integer) from anon, authenticated;
grant execute on function public.record_push_dispatch_count(uuid, integer) to service_role;

-- ----------------------------------------------------------------------------
-- 2. RATE LIMITING DISTRIBUIDO SERVER-SIDE PARA AUTENTICACIÓN
-- ----------------------------------------------------------------------------
create table if not exists public.auth_rate_limits (
  key          text primary key, -- 'ip:<ip>' o 'ident:<username/email>'
  attempts     integer not null default 1,
  window_start timestamptz not null default now(),
  last_attempt timestamptz not null default now()
);

alter table public.auth_rate_limits enable row level security;
alter table public.auth_rate_limits force row level security;

revoke all on public.auth_rate_limits from anon, authenticated;
grant all on public.auth_rate_limits to service_role;

create or replace function public.check_auth_rate_limit(
  p_key text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.auth_rate_limits%rowtype;
begin
  select * into v_row
  from public.auth_rate_limits
  where key = p_key
  for update;

  if not found then
    insert into public.auth_rate_limits (key, attempts, window_start, last_attempt)
    values (p_key, 1, v_now, v_now);
    return true;
  end if;

  -- Si la ventana anterior ya expiró, reiniciamos el ciclo
  if v_row.window_start + (p_window_seconds || ' seconds')::interval < v_now then
    update public.auth_rate_limits
    set attempts = 1,
        window_start = v_now,
        last_attempt = v_now
    where key = p_key;
    return true;
  end if;

  -- Si excedió los intentos máximos permitidos dentro de la ventana
  if v_row.attempts >= p_max_attempts then
    update public.auth_rate_limits
    set last_attempt = v_now
    where key = p_key;
    return false;
  end if;

  -- Incrementamos intentos
  update public.auth_rate_limits
  set attempts = attempts + 1,
      last_attempt = v_now
  where key = p_key;
  return true;
end;
$$;

revoke execute on function public.check_auth_rate_limit(text, integer, integer) from anon, authenticated;
grant execute on function public.check_auth_rate_limit(text, integer, integer) to service_role;

-- ----------------------------------------------------------------------------
-- 3. AUTOMATIZACIÓN DE PURGA CON PG_CRON (ESTADOS Y STORAGE)
-- ----------------------------------------------------------------------------
do $$
begin
  -- Habilitar extensión pg_cron si está disponible
  create extension if not exists pg_cron with schema extensions;
exception when others then
  null;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Desprogramar si ya existía para evitar duplicados
    begin
      perform cron.unschedule('purge-expired-statuses-job')
      from cron.job
      where jobname = 'purge-expired-statuses-job';
    exception when others then
      null;
    end;

    -- Programar ejecución cada 15 minutos
    perform cron.schedule(
      'purge-expired-statuses-job',
      '*/15 * * * *',
      'select public.purge_expired_statuses();'
    );
  end if;
exception when others then
  null;
end $$;


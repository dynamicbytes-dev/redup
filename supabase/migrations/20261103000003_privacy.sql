-- ============================================================
-- Redup · Fase 5 (Presencia avanzada y ajustes de privacidad)
-- ============================================================

alter table public.profiles
  add column if not exists show_online boolean not null default true,
  add column if not exists read_receipts boolean not null default true;

create or replace function public.update_privacy_settings(
  p_show_online boolean,
  p_read_receipts boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set show_online = p_show_online,
      read_receipts = p_read_receipts,
      last_seen_at = now()
  where id = auth.uid();
$$;

grant execute on function public.update_privacy_settings(boolean, boolean) to authenticated;


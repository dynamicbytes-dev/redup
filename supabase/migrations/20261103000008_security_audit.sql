-- ============================================================================
-- Redup · Auditoría y endurecimiento de Row Level Security (RLS)
-- Protección de perfiles bloqueados, revocación de accesos públicos indebidos
-- y garantía de aislamiento de datos por usuario.
-- ============================================================================

-- 1. Endurecer política de lectura de perfiles para que usuarios bloqueados no puedan verse mutuamente
drop policy if exists "profiles readable by authenticated" on public.profiles;
drop policy if exists "profiles readable by non-blocked authenticated" on public.profiles;

create policy "profiles readable by non-blocked authenticated"
  on public.profiles for select
  to authenticated
  using (
    not exists (
      select 1 from public.blocks b
      where (b.blocker_id = profiles.id and b.blocked_id = auth.uid())
         or (b.blocker_id = auth.uid() and b.blocked_id = profiles.id)
    )
  );

-- 2. Asegurar que las 11 tablas del esquema public tengan RLS forzado (FORCE RLS)
alter table public.profiles enable row level security;
alter table public.blocks enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.statuses enable row level security;
alter table public.status_views enable row level security;
alter table public.call_logs enable row level security;
alter table public.push_tokens enable row level security;
alter table public.friend_requests enable row level security;

alter table public.profiles force row level security;
alter table public.blocks force row level security;
alter table public.contacts force row level security;
alter table public.conversations force row level security;
alter table public.conversation_members force row level security;
alter table public.messages force row level security;
alter table public.statuses force row level security;
alter table public.status_views force row level security;
alter table public.call_logs force row level security;
alter table public.push_tokens force row level security;
alter table public.friend_requests force row level security;

-- 3. Limitar privilegios públicos por defecto
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Solo funciones públicas estrictamente necesarias permitidas para anon (p. ej. validar disponibilidad de username antes de registrarse)
grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;


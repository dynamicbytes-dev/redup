-- ============================================================
-- Redup · Reacciones en historias (status_views.reaction)
-- ============================================================

alter table public.status_views
  add column if not exists reaction text;

create or replace function public.react_to_status(
  p_status_id uuid,
  p_reaction text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.status_views (status_id, viewer_id, viewed_at, reaction)
  values (p_status_id, auth.uid(), now(), trim(p_reaction))
  on conflict (status_id, viewer_id)
  do update set
    reaction = excluded.reaction,
    viewed_at = now();
end;
$$;

grant execute on function public.react_to_status(uuid, text) to authenticated;


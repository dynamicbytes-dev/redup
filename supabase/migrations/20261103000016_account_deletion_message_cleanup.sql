-- ============================================================================
-- Redup · Eliminación de cuenta: limpieza de mensajes y archivos de chat
-- Complementa 20261103000013 sin modificarla (ya está aplicada).
-- ============================================================================

-- Los mensajes eliminados lógicamente no necesitan body ni media_path.
-- Esto también corrige el borrado de mensajes existente en softDeleteMessage.
alter table public.messages drop constraint if exists messages_body_required;
alter table public.messages add constraint messages_body_required check (
  kind = 'system' or deleted_at is not null or body is not null or media_path is not null
);

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

  -- Habilitar borrado autorizado en storage.objects
  perform set_config('storage.allow_delete_query', 'true', true);

  -- 1. Limpiar avatar y estados del usuario
  delete from storage.objects
  where bucket_id in ('avatars', 'statuses')
    and (storage.foldername(name))[1] = me::text;

  -- 2. Limpiar los archivos de chat enviados por el usuario
  delete from storage.objects
  where bucket_id = 'media'
    and name in (
      select media_path
      from public.messages
      where sender_id = me
        and media_path is not null
    );

  -- 3. Marcar sus mensajes como eliminados para no dejar contenido personal
  --    ni referencias a archivos borrados en conversaciones ajenas.
  update public.messages
  set body = null,
      media_path = null,
      media_meta = null,
      deleted_at = coalesce(deleted_at, now())
  where sender_id = me;

  -- 4. Limpiar push tokens
  delete from public.push_tokens
  where user_id = me;

  -- 5. Eliminar la cuenta en auth.users (cascada a profiles y relaciones)
  delete from auth.users
  where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

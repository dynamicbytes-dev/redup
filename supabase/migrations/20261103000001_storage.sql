-- ============================================================
-- Redup · Storage
-- avatars: público (fotos de perfil)
-- media:   privado, acceso solo a miembros de la conversación
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('media', 'media', false, 52428800, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- avatars
-- ------------------------------------------------------------
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars insert own folder" on storage.objects;
create policy "avatars insert own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars update own folder" on storage.objects;
create policy "avatars update own folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars delete own folder" on storage.objects;
create policy "avatars delete own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------
-- media  (ruta: {conversation_id}/{message_id}.{ext})
-- ------------------------------------------------------------
drop policy if exists "media read by members" on storage.objects;
create policy "media read by members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "media insert by members" on storage.objects;
create policy "media insert by members"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "media delete by members" on storage.objects;
create policy "media delete by members"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

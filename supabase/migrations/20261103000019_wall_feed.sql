-- ============================================================
-- Migración: Muro estilo X (Twitter) para Amigos
-- ============================================================

-- 1. Tabla de Publicaciones del Muro (Posts)
create table if not exists public.wall_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  content     text not null check (char_length(trim(content)) between 1 and 2000),
  media_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists wall_posts_author_idx on public.wall_posts (author_id, created_at desc);
create index if not exists wall_posts_created_idx on public.wall_posts (created_at desc);

-- 2. Reacciones a Posts del Muro
create table if not exists public.wall_post_reactions (
  post_id     uuid not null references public.wall_posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  reaction    text not null default '❤️',
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists wall_post_reactions_post_idx on public.wall_post_reactions (post_id);

-- 3. Comentarios y Respuestas a Posts del Muro
create table if not exists public.wall_post_comments (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.wall_posts(id) on delete cascade,
  author_id         uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.wall_post_comments(id) on delete cascade,
  content           text not null check (char_length(trim(content)) between 1 and 1000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists wall_post_comments_post_idx on public.wall_post_comments (post_id, created_at asc);
create index if not exists wall_post_comments_parent_idx on public.wall_post_comments (parent_comment_id);

-- 4. Reacciones a Comentarios
create table if not exists public.wall_comment_reactions (
  comment_id  uuid not null references public.wall_post_comments(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  reaction    text not null default '❤️',
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists wall_comment_reactions_comment_idx on public.wall_comment_reactions (comment_id);

-- Realtime
alter table public.wall_posts replica identity full;
alter table public.wall_post_reactions replica identity full;
alter table public.wall_post_comments replica identity full;
alter table public.wall_comment_reactions replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wall_posts') then
    alter publication supabase_realtime add table public.wall_posts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wall_post_reactions') then
    alter publication supabase_realtime add table public.wall_post_reactions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wall_post_comments') then
    alter publication supabase_realtime add table public.wall_post_comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wall_comment_reactions') then
    alter publication supabase_realtime add table public.wall_comment_reactions;
  end if;
end $$;

-- ------------------------------------------------------------
-- Funciones helper de visibilidad en Muro
-- ------------------------------------------------------------
create or replace function public.can_view_wall_post(p_author_id uuid, p_viewer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (p_author_id = p_viewer_id) or public.are_friends(p_author_id, p_viewer_id);
$$;

-- ------------------------------------------------------------
-- Row Level Security (RLS)
-- ------------------------------------------------------------
alter table public.wall_posts enable row level security;
alter table public.wall_post_reactions enable row level security;
alter table public.wall_post_comments enable row level security;
alter table public.wall_comment_reactions enable row level security;

-- wall_posts
create policy "wall_posts_select"
  on public.wall_posts for select
  using (
    auth.role() = 'authenticated' and
    public.can_view_wall_post(author_id, auth.uid())
  );

create policy "wall_posts_insert"
  on public.wall_posts for insert
  with check (
    auth.role() = 'authenticated' and
    author_id = auth.uid()
  );

create policy "wall_posts_update"
  on public.wall_posts for update
  using (
    auth.role() = 'authenticated' and
    author_id = auth.uid()
  );

create policy "wall_posts_delete"
  on public.wall_posts for delete
  using (
    auth.role() = 'authenticated' and
    author_id = auth.uid()
  );

-- wall_post_reactions
create policy "wall_post_reactions_select"
  on public.wall_post_reactions for select
  using (
    auth.role() = 'authenticated' and
    exists (
      select 1 from public.wall_posts p
      where p.id = post_id and public.can_view_wall_post(p.author_id, auth.uid())
    )
  );

create policy "wall_post_reactions_insert"
  on public.wall_post_reactions for insert
  with check (
    auth.role() = 'authenticated' and
    user_id = auth.uid() and
    exists (
      select 1 from public.wall_posts p
      where p.id = post_id and public.can_view_wall_post(p.author_id, auth.uid())
    )
  );

create policy "wall_post_reactions_update"
  on public.wall_post_reactions for update
  using (
    auth.role() = 'authenticated' and
    user_id = auth.uid()
  );

create policy "wall_post_reactions_delete"
  on public.wall_post_reactions for delete
  using (
    auth.role() = 'authenticated' and
    user_id = auth.uid()
  );

-- wall_post_comments
create policy "wall_post_comments_select"
  on public.wall_post_comments for select
  using (
    auth.role() = 'authenticated' and
    exists (
      select 1 from public.wall_posts p
      where p.id = post_id and public.can_view_wall_post(p.author_id, auth.uid())
    )
  );

create policy "wall_post_comments_insert"
  on public.wall_post_comments for insert
  with check (
    auth.role() = 'authenticated' and
    author_id = auth.uid() and
    exists (
      select 1 from public.wall_posts p
      where p.id = post_id and public.can_view_wall_post(p.author_id, auth.uid())
    )
  );

create policy "wall_post_comments_update"
  on public.wall_post_comments for update
  using (
    auth.role() = 'authenticated' and
    author_id = auth.uid()
  );

create policy "wall_post_comments_delete"
  on public.wall_post_comments for delete
  using (
    auth.role() = 'authenticated' and (
      author_id = auth.uid() or
      exists (select 1 from public.wall_posts p where p.id = post_id and p.author_id = auth.uid())
    )
  );

-- wall_comment_reactions
create policy "wall_comment_reactions_all"
  on public.wall_comment_reactions for all
  using (
    auth.role() = 'authenticated' and (
      user_id = auth.uid() or
      exists (
        select 1 from public.wall_post_comments c
        join public.wall_posts p on p.id = c.post_id
        where c.id = comment_id and public.can_view_wall_post(p.author_id, auth.uid())
      )
    )
  )
  with check (
    auth.role() = 'authenticated' and
    user_id = auth.uid()
  );

-- ------------------------------------------------------------
-- RPC: Obtener el Feed del Muro (Amigos y propio)
-- ------------------------------------------------------------
create or replace function public.get_wall_feed(
  p_limit int default 40,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_posts jsonb;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'author_id', p.author_id,
      'content', p.content,
      'media_path', p.media_path,
      'created_at', p.created_at,
      'author', jsonb_build_object(
        'id', pr.id,
        'username', pr.username,
        'display_name', pr.display_name,
        'avatar_path', pr.avatar_path,
        'about', pr.about,
        'last_seen_at', pr.last_seen_at
      ),
      'is_friend', (p.author_id = v_me or public.are_friends(p.author_id, v_me)),
      'likes_count', (select count(*)::int from public.wall_post_reactions where post_id = p.id),
      'comments_count', (select count(*)::int from public.wall_post_comments where post_id = p.id),
      'my_reaction', (select reaction from public.wall_post_reactions where post_id = p.id and user_id = v_me limit 1)
    ) order by p.created_at desc
  ), '[]'::jsonb)
  into v_posts
  from (
    select * from public.wall_posts
    where author_id = v_me or public.are_friends(author_id, v_me)
    order by created_at desc
    limit p_limit offset p_offset
  ) p
  join public.profiles pr on pr.id = p.author_id;

  return v_posts;
end;
$$;

-- ------------------------------------------------------------
-- RPC: Obtener comentarios de un post (con anidación / respuestas)
-- ------------------------------------------------------------
create or replace function public.get_post_comments(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_author_id uuid;
  v_comments jsonb;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;

  select author_id into v_author_id
  from public.wall_posts
  where id = p_post_id;

  if v_author_id is null or not public.can_view_wall_post(v_author_id, v_me) then
    raise exception 'No tienes permiso para ver esta publicación.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'post_id', c.post_id,
      'author_id', c.author_id,
      'parent_comment_id', c.parent_comment_id,
      'content', c.content,
      'created_at', c.created_at,
      'author', jsonb_build_object(
        'id', pr.id,
        'username', pr.username,
        'display_name', pr.display_name,
        'avatar_path', pr.avatar_path,
        'about', pr.about
      ),
      'is_friend', (c.author_id = v_me or public.are_friends(c.author_id, v_me)),
      'likes_count', (select count(*)::int from public.wall_comment_reactions where comment_id = c.id),
      'my_reaction', (select reaction from public.wall_comment_reactions where comment_id = c.id and user_id = v_me limit 1)
    ) order by c.created_at asc
  ), '[]'::jsonb)
  into v_comments
  from public.wall_post_comments c
  join public.profiles pr on pr.id = c.author_id
  where c.post_id = p_post_id;

  return v_comments;
end;
$$;

-- ------------------------------------------------------------
-- RPC: Reaccionar a un Post (Toggle)
-- ------------------------------------------------------------
create or replace function public.toggle_wall_post_reaction(
  p_post_id uuid,
  p_reaction text default '❤️'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_author_id uuid;
  v_existing text;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;

  select author_id into v_author_id
  from public.wall_posts
  where id = p_post_id;

  if v_author_id is null or not public.can_view_wall_post(v_author_id, v_me) then
    raise exception 'No tienes permiso para reaccionar a esta publicación.';
  end if;

  select reaction into v_existing
  from public.wall_post_reactions
  where post_id = p_post_id and user_id = v_me;

  if v_existing is not null and v_existing = p_reaction then
    delete from public.wall_post_reactions
    where post_id = p_post_id and user_id = v_me;
    return jsonb_build_object('action', 'removed', 'reaction', null);
  else
    insert into public.wall_post_reactions (post_id, user_id, reaction)
    values (p_post_id, v_me, p_reaction)
    on conflict (post_id, user_id)
    do update set reaction = p_reaction, created_at = now();
    return jsonb_build_object('action', 'added', 'reaction', p_reaction);
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RPC: Reaccionar a un Comentario (Toggle)
-- ------------------------------------------------------------
create or replace function public.toggle_wall_comment_reaction(
  p_comment_id uuid,
  p_reaction text default '❤️'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_post_id uuid;
  v_author_id uuid;
  v_existing text;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;

  select c.post_id, p.author_id
  into v_post_id, v_author_id
  from public.wall_post_comments c
  join public.wall_posts p on p.id = c.post_id
  where c.id = p_comment_id;

  if v_author_id is null or not public.can_view_wall_post(v_author_id, v_me) then
    raise exception 'No tienes permiso para reaccionar a este comentario.';
  end if;

  select reaction into v_existing
  from public.wall_comment_reactions
  where comment_id = p_comment_id and user_id = v_me;

  if v_existing is not null and v_existing = p_reaction then
    delete from public.wall_comment_reactions
    where comment_id = p_comment_id and user_id = v_me;
    return jsonb_build_object('action', 'removed', 'reaction', null);
  else
    insert into public.wall_comment_reactions (comment_id, user_id, reaction)
    values (p_comment_id, v_me, p_reaction)
    on conflict (comment_id, user_id)
    do update set reaction = p_reaction, created_at = now();
    return jsonb_build_object('action', 'added', 'reaction', p_reaction);
  end if;
end;
$$;

import { supabase } from '@/lib/supabase';
import type { WallComment, WallPost } from '@/lib/types';

export class WallError extends Error {}

export async function fetchWallFeed(limit = 40, offset = 0): Promise<WallPost[]> {
  const { data, error } = await supabase.rpc('get_wall_feed', {
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    throw new WallError(error.message || 'No pudimos cargar el muro.');
  }

  return (data ?? []) as WallPost[];
}

export async function createWallPost(params: {
  content: string;
  mediaPath?: string | null;
}): Promise<WallPost> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new WallError('No autenticado');

  const { data, error } = await supabase
    .from('wall_posts')
    .insert({
      author_id: user.user.id,
      content: params.content.trim(),
      media_path: params.mediaPath ?? null,
    })
    .select(`
      id,
      author_id,
      content,
      media_path,
      created_at,
      author:profiles (
        id,
        username,
        display_name,
        avatar_path,
        about,
        last_seen_at
      )
    `)
    .single();

  if (error || !data) {
    throw new WallError(error?.message || 'No pudimos publicar en el muro.');
  }

  return {
    ...data,
    author: (data as any).author,
    is_friend: true,
    likes_count: 0,
    comments_count: 0,
    my_reaction: null,
  } as unknown as WallPost;
}

export async function deleteWallPost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('wall_posts')
    .delete()
    .eq('id', postId);

  if (error) throw new WallError('No pudimos eliminar la publicación.');
}

export async function togglePostReaction(
  postId: string,
  reaction = '❤️',
): Promise<{ action: 'added' | 'removed'; reaction: string | null }> {
  const { data, error } = await supabase.rpc('toggle_wall_post_reaction', {
    p_post_id: postId,
    p_reaction: reaction,
  });

  if (error || !data) {
    throw new WallError(error?.message || 'No pudimos reaccionar.');
  }

  return data as any;
}

export async function fetchPostComments(postId: string): Promise<WallComment[]> {
  const { data, error } = await supabase.rpc('get_post_comments', {
    p_post_id: postId,
  });

  if (error) {
    throw new WallError(error.message || 'No pudimos cargar los comentarios.');
  }

  return (data ?? []) as WallComment[];
}

export async function createWallComment(params: {
  postId: string;
  content: string;
  parentCommentId?: string | null;
}): Promise<WallComment> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new WallError('No autenticado');

  const { data, error } = await supabase
    .from('wall_post_comments')
    .insert({
      post_id: params.postId,
      author_id: user.user.id,
      content: params.content.trim(),
      parent_comment_id: params.parentCommentId ?? null,
    })
    .select(`
      id,
      post_id,
      author_id,
      parent_comment_id,
      content,
      created_at,
      author:profiles (
        id,
        username,
        display_name,
        avatar_path,
        about
      )
    `)
    .single();

  if (error || !data) {
    throw new WallError(error?.message || 'No pudimos publicar el comentario.');
  }

  return {
    ...data,
    author: (data as any).author,
    is_friend: true,
    likes_count: 0,
    my_reaction: null,
  } as unknown as WallComment;
}

export async function deleteWallComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('wall_post_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw new WallError('No pudimos eliminar el comentario.');
}

export async function toggleCommentReaction(
  commentId: string,
  reaction = '❤️',
): Promise<{ action: 'added' | 'removed'; reaction: string | null }> {
  const { data, error } = await supabase.rpc('toggle_wall_comment_reaction', {
    p_comment_id: commentId,
    p_reaction: reaction,
  });

  if (error || !data) {
    throw new WallError(error?.message || 'No pudimos reaccionar al comentario.');
  }

  return data as any;
}


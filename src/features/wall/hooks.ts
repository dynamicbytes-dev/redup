import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  createWallComment,
  createWallPost,
  deleteWallComment,
  deleteWallPost,
  fetchPostComments,
  fetchWallFeed,
  toggleCommentReaction,
  togglePostReaction,
} from '@/features/wall/api';
import { supabase } from '@/lib/supabase';
import type { WallComment, WallPost } from '@/lib/types';

export const wallKeys = {
  feed: ['wall', 'feed'] as const,
  comments: (postId: string) => ['wall', 'comments', postId] as const,
};

export function useWallFeed() {
  return useQuery({
    queryKey: wallKeys.feed,
    queryFn: () => fetchWallFeed(),
    staleTime: 5_000,
  });
}

export function useCreateWallPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWallPost,
    onSuccess: (newPost) => {
      queryClient.setQueryData<WallPost[]>(wallKeys.feed, (old = []) => [newPost, ...old]);
      queryClient.invalidateQueries({ queryKey: wallKeys.feed });
    },
  });
}

export function useDeleteWallPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => deleteWallPost(postId),
    onSuccess: (_, postId) => {
      queryClient.setQueryData<WallPost[]>(wallKeys.feed, (old = []) =>
        old.filter((p) => p.id !== postId),
      );
    },
  });
}

export function useTogglePostReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, reaction }: { postId: string; reaction?: string }) =>
      togglePostReaction(postId, reaction),
    onMutate: async ({ postId, reaction = '❤️' }) => {
      await queryClient.cancelQueries({ queryKey: wallKeys.feed });
      const prevFeed = queryClient.getQueryData<WallPost[]>(wallKeys.feed);

      queryClient.setQueryData<WallPost[]>(wallKeys.feed, (old = []) =>
        old.map((post) => {
          if (post.id !== postId) return post;
          const isSame = post.my_reaction === reaction;
          const newReaction = isSame ? null : reaction;
          const likesDelta = isSame ? -1 : post.my_reaction ? 0 : 1;
          return {
            ...post,
            my_reaction: newReaction,
            likes_count: Math.max(0, post.likes_count + likesDelta),
          };
        }),
      );

      return { prevFeed };
    },
    onError: (_, __, context) => {
      if (context?.prevFeed) {
        queryClient.setQueryData(wallKeys.feed, context.prevFeed);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: wallKeys.feed });
    },
  });
}

export function usePostComments(postId: string) {
  return useQuery({
    queryKey: wallKeys.comments(postId),
    queryFn: () => fetchPostComments(postId),
    enabled: Boolean(postId),
  });
}

export function useCreateWallComment(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWallComment,
    onSuccess: (newComment) => {
      queryClient.setQueryData<WallComment[]>(wallKeys.comments(postId), (old = []) => [
        ...old,
        newComment,
      ]);
      // Incrementar contador de comentarios en el feed optimísticamente
      queryClient.setQueryData<WallPost[]>(wallKeys.feed, (old = []) =>
        old.map((p) => (p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p)),
      );
      queryClient.invalidateQueries({ queryKey: wallKeys.comments(postId) });
    },
  });
}

export function useDeleteWallComment(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => deleteWallComment(commentId),
    onSuccess: (_, commentId) => {
      queryClient.setQueryData<WallComment[]>(wallKeys.comments(postId), (old = []) =>
        old.filter((c) => c.id !== commentId),
      );
      queryClient.setQueryData<WallPost[]>(wallKeys.feed, (old = []) =>
        old.map((p) =>
          p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p,
        ),
      );
    },
  });
}

export function useToggleCommentReaction(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, reaction }: { commentId: string; reaction?: string }) =>
      toggleCommentReaction(commentId, reaction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wallKeys.comments(postId) });
    },
  });
}

export function useWallRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('wall_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wall_posts' },
        () => {
          queryClient.invalidateQueries({ queryKey: wallKeys.feed });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wall_post_reactions' },
        () => {
          queryClient.invalidateQueries({ queryKey: wallKeys.feed });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

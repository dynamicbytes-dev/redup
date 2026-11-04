import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo } from 'react';

import { queryKeys } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { FriendRequestItem } from '@/lib/types';

import {
  deleteFriendRequest,
  fetchFriendRequests,
  respondFriendRequest,
  sendFriendRequest,
} from './api';

export function useFriendRequests(userId: string | null) {
  const query = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => fetchFriendRequests(userId ?? ''),
    enabled: Boolean(userId),
  });

  const categorized = useMemo(() => {
    const all = query.data ?? [];
    const friends: FriendRequestItem[] = [];
    const incoming: FriendRequestItem[] = [];
    const outgoing: FriendRequestItem[] = [];
    const byUserId = new Map<string, FriendRequestItem>();

    for (const item of all) {
      byUserId.set(item.other.id, item);
      if (item.status === 'accepted') {
        friends.push(item);
      } else if (item.status === 'pending') {
        if (item.direction === 'incoming') incoming.push(item);
        else outgoing.push(item);
      }
    }

    return {
      all,
      friends,
      incoming,
      outgoing,
      byUserId,
    };
  }, [query.data]);

  return {
    ...query,
    ...categorized,
  };
}

let friendsChannelSeq = 0;

export function useFriendsRealtime(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const channelName = `friends-feed-${++friendsChannelSeq}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.friends });
          queryClient.invalidateQueries({ queryKey: queryKeys.statuses });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}

export function useSendFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (targetUserId: string) => sendFriendRequest(targetUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
      queryClient.invalidateQueries({ queryKey: queryKeys.statuses });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
  });
}

export function useRespondFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { requestId: string; accept: boolean }) =>
      respondFriendRequest(input.requestId, input.accept),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.invalidateQueries({ queryKey: queryKeys.statuses });
      Haptics.notificationAsync(
        input.accept
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      ).catch(() => {});
    },
  });
}

export function useRemoveFriendOrRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) => deleteFriendRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
      queryClient.invalidateQueries({ queryKey: queryKeys.statuses });
      Haptics.selectionAsync().catch(() => {});
    },
  });
}


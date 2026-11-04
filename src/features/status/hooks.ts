import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';

import { queryKeys } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { StatusItem } from '@/lib/types';

import {
  createImageStatus,
  createTextStatus,
  deleteStatus,
  fetchActiveStatuses,
  markStatusViewed,
} from './api';

export function useStatuses(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.statuses,
    queryFn: () => fetchActiveStatuses(userId ?? ''),
    enabled: Boolean(userId),
  });
}

export function useStatusesRealtime(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel('statuses-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'statuses' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.statuses });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'status_views' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.statuses });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}

export function useCreateTextStatus(userId: string, author: StatusItem['author']) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { caption: string; bgColor: string }) =>
      createTextStatus({
        userId,
        author,
        caption: input.caption,
        bgColor: input.bgColor,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statuses });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
  });
}

export function useCreateImageStatus(userId: string, author: StatusItem['author']) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { localUri: string; caption?: string | null }) =>
      createImageStatus({
        userId,
        author,
        localUri: input.localUri,
        caption: input.caption,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statuses });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
  });
}

export function useMarkStatusViewed(viewerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (statusId: string) => markStatusViewed(statusId, viewerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statuses });
    },
  });
}

export function useDeleteStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { statusId: string; mediaPath?: string | null }) =>
      deleteStatus(input.statusId, input.mediaPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statuses });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    },
  });
}


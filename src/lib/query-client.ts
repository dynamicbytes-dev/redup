import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export const queryKeys = {
  profile: (id: string) => ['profile', id] as const,
  conversations: ['conversations'] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  conversation: (id: string) => ['conversation', id] as const,
  contacts: ['contacts'] as const,
  contact: (userId: string) => ['contact', userId] as const,
  blocks: ['blocks'] as const,
  statuses: ['statuses'] as const,
  calls: ['calls'] as const,
  call: (id: string) => ['call', id] as const,
  userSearch: (term: string) => ['user-search', term] as const,
};

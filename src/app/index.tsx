import { Redirect } from 'expo-router';

import { FullScreenLoader } from '@/components/ui/action-sheet';
import { useSession } from '@/features/auth/session';

export default function Index() {
  const { session, loading } = useSession();

  if (loading) return <FullScreenLoader />;

  return <Redirect href={session ? '/chats' : '/welcome'} />;
}

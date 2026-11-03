import { useSyncExternalStore } from 'react';
import { session, type SessionState } from './session-store';

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}

export function useAccount() {
  const state = useSession();
  return state.status === 'signed-in' ? state.account : null;
}

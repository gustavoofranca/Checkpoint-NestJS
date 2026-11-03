import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { ApiError } from './api/api-error';
import { ACCOUNT_QUERY_KEYS } from './api/queries';
import { router } from './router';
import { session } from './session/session-store';
import './styles.css';

// Client errors (4xx) are answers, not failures: retrying them changes nothing.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failures, error) =>
        failures < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});

let accountId: string | null = null;
session.subscribe(() => {
  const state = session.getSnapshot();
  const current = state.status === 'signed-in' ? state.account.id : null;
  if (current !== accountId) {
    accountId = current;
    for (const key of ACCOUNT_QUERY_KEYS) {
      queryClient.removeQueries({ queryKey: [key] });
    }
  }
});

// Restores the session from the refresh cookie while the page renders.
void session.restore();

const root = document.getElementById('root');
if (root === null) {
  throw new Error('index.html has no #root element');
}
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

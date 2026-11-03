import { useRouteError } from 'react-router';
import { ErrorState } from '../components/ErrorState';

// Catches rendering errors under the layout, so one broken screen keeps the page usable.
export function RouteErrorPage() {
  const error = useRouteError();
  return (
    <div className="mx-auto mt-12 max-w-[1200px] px-4 sm:px-6">
      <h1 className="mb-4 text-xl">Something went wrong</h1>
      <ErrorState
        error={error}
        onRetry={() => {
          window.location.reload();
        }}
      />
    </div>
  );
}

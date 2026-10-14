import { useQuery } from '@tanstack/react-query';
import { libraryEntryQuery, useSetLibraryStatus } from '../api/queries';
import { LIBRARY_STATUSES, type GameDetail, type LibraryStatus } from '../api/types';
import { ErrorState } from './ErrorState';

export const STATUS_LABELS: Record<LibraryStatus, string> = {
  PLAYING: 'Playing',
  BACKLOG: 'Backlog',
  COMPLETED: 'Completed',
  DROPPED: 'Dropped',
};

const NOT_IN_LIBRARY = '';

export function LibraryStatusControl({ game }: { game: GameDetail }) {
  const entry = useQuery(libraryEntryQuery(game.id));
  const setStatus = useSetLibraryStatus({
    id: game.id,
    slug: game.slug,
    title: game.title,
    headerImageUrl: game.headerImageUrl,
  });

  if (entry.isError) {
    return <ErrorState error={entry.error} onRetry={() => void entry.refetch()} />;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="library-status" className="text-sm font-medium">
        In your library
      </label>
      <select
        id="library-status"
        disabled={entry.isPending}
        value={entry.data?.status ?? NOT_IN_LIBRARY}
        onChange={(event) => {
          const value = event.target.value;
          setStatus.mutate(LIBRARY_STATUSES.find((status) => status === value) ?? null);
        }}
        className="h-9 rounded-control border border-border bg-surface px-2 text-sm text-text hover:border-muted"
      >
        <option value={NOT_IN_LIBRARY}>Not in library</option>
        {LIBRARY_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      {setStatus.isError && (
        <p role="alert" className="text-xs text-danger">
          {setStatus.error.message} The previous status was kept.
        </p>
      )}
    </div>
  );
}

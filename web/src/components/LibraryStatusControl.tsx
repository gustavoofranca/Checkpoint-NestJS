import { useQuery } from '@tanstack/react-query';
import { libraryEntryQuery, useSetLibraryStatus } from '../api/queries';
import { LIBRARY_STATUSES, type GameDetail } from '../api/types';
import { ErrorState } from './ErrorState';
import { STATUS } from './library-status';

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
  const current = entry.data?.status ?? null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 id="library-status" className="text-sm font-medium">
          In your library
        </h2>
        {current !== null && (
          <button
            type="button"
            className="text-xs text-muted hover:text-text"
            onClick={() => {
              setStatus.mutate(null);
            }}
          >
            Remove
          </button>
        )}
      </div>
      <div role="group" aria-labelledby="library-status" className="grid grid-cols-2 gap-2">
        {LIBRARY_STATUSES.map((status) => {
          const { label, icon: Icon, pressed } = STATUS[status];
          const active = current === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              disabled={entry.isPending}
              onClick={() => {
                if (!active) {
                  setStatus.mutate(status);
                }
              }}
              className={`flex h-10 items-center gap-2 rounded-control border px-3 text-sm font-medium transition-colors duration-150 ease-out active:scale-[0.98] disabled:opacity-50 ${
                active ? pressed : 'border-border text-muted hover:border-muted hover:text-text'
              }`}
            >
              <Icon
                size={16}
                strokeWidth={1.5}
                aria-hidden
                className={active ? 'animate-pop' : undefined}
              />
              {label}
            </button>
          );
        })}
      </div>
      {setStatus.isError && (
        <p role="alert" className="text-xs text-danger">
          {setStatus.error.message} The previous status was kept.
        </p>
      )}
    </div>
  );
}

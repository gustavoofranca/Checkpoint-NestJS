import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { gamesQuery, genresQuery, type CatalogFilters } from '../api/queries';
import type { GameSort } from '../api/types';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { FeaturedRow } from '../components/FeaturedRow';
import { GameCard, GameCardSkeleton } from '../components/GameCard';
import { LoadMore } from '../components/LoadMore';
import { useDocumentTitle } from '../lib/use-document-title';

const SORTS: readonly { value: GameSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'top_rated', label: 'Top rated' },
  { value: 'title', label: 'Title' },
];

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

function readFilters(params: URLSearchParams): CatalogFilters {
  const sort = SORTS.find((option) => option.value === params.get('sort'))?.value ?? 'newest';
  return { q: params.get('q') ?? '', genre: params.get('genre') ?? '', sort };
}

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  useDocumentTitle(filters.q === '' ? null : `“${filters.q}”`);

  // Filters live in the URL; changing one replaces the history entry instead of adding one.
  const update = (name: 'genre' | 'sort', value: string) => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value === '' || (name === 'sort' && value === 'newest')) {
          next.delete(name);
        } else {
          next.set(name, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  return (
    <>
      <h1 className="sr-only">Game catalog</h1>
      {filters.q === '' && filters.genre === '' && <FeaturedRow />}
      <Filters filters={filters} onChange={update} />
      <Games
        filters={filters}
        onClearSearch={() => {
          setParams(new URLSearchParams());
        }}
      />
    </>
  );
}

interface FiltersProps {
  filters: CatalogFilters;
  onChange: (name: 'genre' | 'sort', value: string) => void;
}

function Filters({ filters, onChange }: FiltersProps) {
  const genres = useQuery(genresQuery);
  const chip = (active: boolean) =>
    `h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors duration-150 ease-out ${
      active
        ? 'border-accent bg-accent-tint text-text'
        : 'border-border text-muted hover:border-muted hover:text-text'
    }`;

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div
        role="group"
        aria-label="Filter by genre"
        className="scrollbar-none -mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0"
      >
        <button
          type="button"
          aria-pressed={filters.genre === ''}
          className={chip(filters.genre === '')}
          onClick={() => {
            onChange('genre', '');
          }}
        >
          All genres
        </button>
        {genres.data?.data.map((genre) => (
          <button
            key={genre.slug}
            type="button"
            aria-pressed={filters.genre === genre.slug}
            className={chip(filters.genre === genre.slug)}
            onClick={() => {
              onChange('genre', filters.genre === genre.slug ? '' : genre.slug);
            }}
          >
            {genre.name}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label htmlFor="sort" className="text-sm text-muted">
          Sort by
        </label>
        <select
          id="sort"
          value={filters.sort}
          onChange={(event) => {
            onChange('sort', event.target.value);
          }}
          className="h-9 rounded-control border border-border bg-surface px-2 text-sm text-text hover:border-muted"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Games({ filters, onClearSearch }: { filters: CatalogFilters; onClearSearch: () => void }) {
  const games = useInfiniteQuery(gamesQuery(filters));

  if (games.isPending) {
    return (
      <ul className={GRID} aria-busy>
        {Array.from({ length: 8 }, (_, index) => (
          <GameCardSkeleton key={index} />
        ))}
      </ul>
    );
  }
  // A failed "load more" keeps the pages already shown; only a failed first page replaces them.
  if (games.isError && !games.isFetchNextPageError) {
    return <ErrorState error={games.error} onRetry={() => void games.refetch()} />;
  }

  const list = games.data.pages.flatMap((page) => page.data);
  if (list.length === 0) {
    return (
      <EmptyState
        title={filters.q === '' ? 'No games in this genre yet' : `No save data for “${filters.q}”`}
      >
        <Button onClick={onClearSearch}>Show every game</Button>
      </EmptyState>
    );
  }
  return (
    <>
      <ul className={GRID}>
        {list.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </ul>
      {games.isFetchNextPageError && (
        <div className="mt-6">
          <ErrorState error={games.error} onRetry={() => void games.fetchNextPage()} />
        </div>
      )}
      <LoadMore
        automatic
        hasMore={games.hasNextPage && !games.isFetchNextPageError}
        loading={games.isFetchingNextPage}
        onLoad={() => void games.fetchNextPage()}
      />
    </>
  );
}

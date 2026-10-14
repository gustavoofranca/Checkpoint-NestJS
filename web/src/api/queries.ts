import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { api, expectNoContent, orNull, unwrap } from './client';
import type { GameSort, LibraryEntry, LibraryStatus, Review } from './types';

export const PAGE_SIZE = 20;

// Queries whose answer depends on who is signed in; dropped whenever the account changes, so one
// person never sees another's review form or library after a sign-out in the same tab.
export const ACCOUNT_QUERY_KEYS = ['own-review', 'library-entry', 'library'] as const;

export interface CatalogFilters {
  q: string;
  genre: string;
  sort: GameSort;
}

export const genresQuery = queryOptions({
  queryKey: ['genres'],
  queryFn: () => unwrap(api.GET('/api/v1/genres')),
  staleTime: 5 * 60_000,
});

export function gamesQuery(filters: CatalogFilters) {
  return infiniteQueryOptions({
    queryKey: ['games', filters],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/games', {
          params: {
            query: {
              limit: PAGE_SIZE,
              sort: filters.sort,
              ...(filters.q === '' ? {} : { q: filters.q }),
              ...(filters.genre === '' ? {} : { genre: filters.genre }),
              ...(pageParam === null ? {} : { cursor: pageParam }),
            },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function gameQuery(slug: string) {
  return queryOptions({
    queryKey: ['game', slug],
    queryFn: () => unwrap(api.GET('/api/v1/games/{slug}', { params: { path: { slug } } })),
  });
}

export function reviewsQuery(slug: string) {
  return infiniteQueryOptions({
    queryKey: ['reviews', slug],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/games/{slug}/reviews', {
          params: {
            path: { slug },
            query: { limit: 10, ...(pageParam === null ? {} : { cursor: pageParam }) },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function ownReviewQuery(slug: string) {
  return queryOptions({
    queryKey: ['own-review', slug],
    queryFn: () =>
      orNull(api.GET('/api/v1/games/{slug}/reviews/me', { params: { path: { slug } } })),
  });
}

export function libraryEntryQuery(gameId: string) {
  return queryOptions({
    queryKey: ['library-entry', gameId],
    queryFn: () => orNull(api.GET('/api/v1/me/library/{gameId}', { params: { path: { gameId } } })),
  });
}

export function libraryQuery(status: LibraryStatus) {
  return infiniteQueryOptions({
    queryKey: ['library', status],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/me/library', {
          params: {
            query: {
              status,
              limit: PAGE_SIZE,
              ...(pageParam === null ? {} : { cursor: pageParam }),
            },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function profileQuery(username: string) {
  return queryOptions({
    queryKey: ['profile', username],
    queryFn: () => unwrap(api.GET('/api/v1/users/{username}', { params: { path: { username } } })),
  });
}

// A review changes the game's rating, its review list and the author's profile.
function useInvalidateAfterReview(slug: string) {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['game', slug] }),
      client.invalidateQueries({ queryKey: ['reviews', slug] }),
      client.invalidateQueries({ queryKey: ['games'] }),
      client.invalidateQueries({ queryKey: ['profile'] }),
    ]);
  };
}

export function useSaveReview(slug: string) {
  const client = useQueryClient();
  const invalidate = useInvalidateAfterReview(slug);
  return useMutation({
    mutationFn: (review: { rating: number; body: string }) =>
      unwrap(
        api.PUT('/api/v1/games/{slug}/reviews/me', { params: { path: { slug } }, body: review }),
      ),
    onSuccess: async (saved: Review) => {
      client.setQueryData(ownReviewQuery(slug).queryKey, saved);
      await invalidate();
    },
  });
}

export function useDeleteReview(slug: string) {
  const client = useQueryClient();
  const invalidate = useInvalidateAfterReview(slug);
  return useMutation({
    mutationFn: () =>
      expectNoContent(
        api.DELETE('/api/v1/games/{slug}/reviews/me', { params: { path: { slug } } }),
      ),
    onSuccess: async () => {
      client.setQueryData(ownReviewQuery(slug).queryKey, null);
      await invalidate();
    },
  });
}

// Optimistic: the control shows the new status at once and rolls back if the API refuses it
// (docs/DESIGN.md, Behaviour).
export function useSetLibraryStatus(game: LibraryEntry['game']) {
  const client = useQueryClient();
  const key = libraryEntryQuery(game.id).queryKey;
  return useMutation({
    mutationFn: (status: LibraryStatus | null) =>
      status === null
        ? expectNoContent(
            api.DELETE('/api/v1/me/library/{gameId}', { params: { path: { gameId: game.id } } }),
          ).then(() => null)
        : unwrap(
            api.PUT('/api/v1/me/library/{gameId}', {
              params: { path: { gameId: game.id } },
              body: { status },
            }),
          ),
    onMutate: async (status) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData(key);
      const optimistic: LibraryEntry | null =
        status === null ? null : { game, status, updatedAt: new Date().toISOString() };
      client.setQueryData(key, () => optimistic);
      return { previous };
    },
    onError: (_error, _status, context) => {
      const previous = context?.previous ?? null;
      client.setQueryData(key, () => previous);
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

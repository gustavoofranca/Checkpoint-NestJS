import * as Tabs from '@radix-ui/react-tabs';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/api-error';
import { libraryQuery, profileQuery } from '../api/queries';
import { LIBRARY_STATUSES, type LibraryStatus, type Profile } from '../api/types';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { STATUS_LABELS } from '../components/LibraryStatusControl';
import { LoadMore } from '../components/LoadMore';
import { formatDate, plural } from '../lib/format';
import { useDocumentTitle } from '../lib/use-document-title';
import { useAccount } from '../session/use-session';
import { NotFoundPage } from './NotFoundPage';

export function ProfilePage() {
  const { username = '' } = useParams();
  const profile = useQuery(profileQuery(username));
  const account = useAccount();
  useDocumentTitle(username);

  if (profile.isPending) {
    return <div aria-busy className="h-40 rounded-card border border-border bg-surface" />;
  }
  if (profile.isError) {
    if (profile.error instanceof ApiError && profile.error.isNotFound) {
      return <NotFoundPage />;
    }
    return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  }
  return <ProfileView profile={profile.data} own={account?.username === profile.data.username} />;
}

function ProfileView({ profile, own }: { profile: Profile; own: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-xl">{profile.username}</h1>
        <p className="mt-1 text-sm text-muted tabular-nums">
          Joined {formatDate(profile.joinedAt)} · {plural(profile.reviewCount, 'review', 'reviews')}
        </p>
      </header>

      <section aria-labelledby="recent-reviews" className="flex flex-col gap-3">
        <h2 id="recent-reviews" className="text-lg">
          Recent reviews
        </h2>
        {profile.latestReviews.length === 0 ? (
          <EmptyState title={own ? 'You have not reviewed a game yet' : 'No reviews yet'}>
            {own && (
              <Link to="/" className="text-accent hover:underline">
                Find a game to review
              </Link>
            )}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {profile.latestReviews.map((review) => (
              <li
                key={review.game.slug}
                className="rounded-card border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <Link
                    to={`/games/${review.game.slug}`}
                    className="text-sm font-medium text-text hover:underline"
                  >
                    {review.game.title}
                  </Link>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Star
                      size={16}
                      strokeWidth={1.5}
                      className="fill-accent text-accent"
                      aria-hidden
                    />
                    {`${String(review.rating)} out of 5`}
                  </span>
                  <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
                </div>
                <p className="mt-2 text-sm whitespace-pre-line">{review.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {own && <Library />}
    </div>
  );
}

function Library() {
  return (
    <section aria-labelledby="library-heading" className="flex flex-col gap-3">
      <h2 id="library-heading" className="text-lg">
        Your library
      </h2>
      <Tabs.Root defaultValue={LIBRARY_STATUSES[0]}>
        <Tabs.List
          aria-label="Library status"
          className="flex gap-1 overflow-x-auto border-b border-border"
        >
          {LIBRARY_STATUSES.map((status) => (
            <Tabs.Trigger
              key={status}
              value={status}
              className="-mb-px h-9 shrink-0 border-b-2 border-transparent px-3 text-sm text-muted transition-colors duration-150 ease-out hover:text-text data-[state=active]:border-accent data-[state=active]:text-text"
            >
              {STATUS_LABELS[status]}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {LIBRARY_STATUSES.map((status) => (
          <Tabs.Content key={status} value={status} className="pt-4">
            <LibraryList status={status} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </section>
  );
}

function LibraryList({ status }: { status: LibraryStatus }) {
  const library = useInfiniteQuery(libraryQuery(status));
  if (library.isPending) {
    return <div aria-busy className="h-24 rounded-card border border-border bg-surface" />;
  }
  if (library.isError && !library.isFetchNextPageError) {
    return <ErrorState error={library.error} onRetry={() => void library.refetch()} />;
  }
  const entries = library.data.pages.flatMap((page) => page.data);
  if (entries.length === 0) {
    return (
      <EmptyState title={`Nothing marked ${STATUS_LABELS[status].toLowerCase()}`}>
        Set a status from any game page.
      </EmptyState>
    );
  }
  return (
    <>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <li key={entry.game.id}>
            <Link
              to={`/games/${entry.game.slug}`}
              className="flex items-center gap-3 rounded-card border border-border bg-surface p-2 hover:border-muted"
            >
              <img
                src={entry.game.headerImageUrl}
                alt=""
                width={92}
                height={43}
                loading="lazy"
                className="h-[43px] w-[92px] shrink-0 rounded bg-raised object-cover"
              />
              <span className="truncate text-sm">{entry.game.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      {library.isFetchNextPageError && (
        <div className="mt-4">
          <ErrorState error={library.error} onRetry={() => void library.fetchNextPage()} />
        </div>
      )}
      <LoadMore
        hasMore={library.hasNextPage && !library.isFetchNextPageError}
        loading={library.isFetchingNextPage}
        onLoad={() => void library.fetchNextPage()}
      />
    </>
  );
}

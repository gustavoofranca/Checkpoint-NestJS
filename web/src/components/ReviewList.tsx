import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { reviewsQuery } from '../api/queries';
import { formatDate } from '../lib/format';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadMore } from './LoadMore';
import { RatingBar } from './RatingBar';

export function ReviewList({ slug }: { slug: string }) {
  const reviews = useInfiniteQuery(reviewsQuery(slug));

  if (reviews.isPending) {
    return (
      <ul className="flex flex-col gap-3" aria-busy>
        {[0, 1].map((index) => (
          <li key={index} aria-hidden className="skeleton h-24 rounded-card border border-border" />
        ))}
      </ul>
    );
  }
  if (reviews.isError && !reviews.isFetchNextPageError) {
    return <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />;
  }
  const list = reviews.data.pages.flatMap((page) => page.data);
  if (list.length === 0) {
    return (
      <EmptyState title="No save data here yet">Be the first to say what you think.</EmptyState>
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-3">
        {list.map((review) => (
          <li key={review.id} className="rounded-card border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <Link
                to={`/u/${review.author.username}`}
                className="font-medium text-text hover:underline"
              >
                {review.author.username}
              </Link>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <RatingBar value={review.rating} />
                <span>{`${String(review.rating)} out of 5`}</span>
              </span>
              <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
            </div>
            <p className="mt-2 text-sm whitespace-pre-line">{review.body}</p>
          </li>
        ))}
      </ul>
      {reviews.isFetchNextPageError && (
        <div className="mt-4">
          <ErrorState error={reviews.error} onRetry={() => void reviews.fetchNextPage()} />
        </div>
      )}
      <LoadMore
        hasMore={reviews.hasNextPage && !reviews.isFetchNextPageError}
        loading={reviews.isFetchingNextPage}
        onLoad={() => void reviews.fetchNextPage()}
      />
    </>
  );
}

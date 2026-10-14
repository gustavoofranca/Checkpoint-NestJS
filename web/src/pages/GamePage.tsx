import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router';
import { ApiError } from '../api/api-error';
import { gameQuery } from '../api/queries';
import type { GameDetail } from '../api/types';
import { buttonClass } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { artTransitionName, HEADER_HEIGHT, HEADER_WIDTH } from '../components/GameCard';
import { LibraryStatusControl } from '../components/LibraryStatusControl';
import { RatingSummary } from '../components/RatingBar';
import { ReviewForm } from '../components/ReviewForm';
import { ReviewList } from '../components/ReviewList';
import { formatDate, formatPrice } from '../lib/format';
import { useDocumentTitle } from '../lib/use-document-title';
import { useSession } from '../session/use-session';
import { NotFoundPage } from './NotFoundPage';

export function GamePage() {
  const { slug = '' } = useParams();
  const game = useQuery(gameQuery(slug));
  useDocumentTitle(game.data?.title ?? null);

  if (game.isPending) {
    return <GameSkeleton />;
  }
  if (game.isError) {
    if (game.error instanceof ApiError && game.error.isNotFound) {
      return <NotFoundPage />;
    }
    return <ErrorState error={game.error} onRetry={() => void game.refetch()} />;
  }
  return <Game game={game.data} />;
}

function Game({ game }: { game: GameDetail }) {
  const state = useSession();
  const location = useLocation();
  const price = formatPrice(game);
  const facts: [string, string][] = [
    ['Developer', game.developers.join(', ') || 'Unknown'],
    ['Publisher', game.publishers.join(', ') || 'Unknown'],
    ['Released', game.releaseDate === null ? 'Not yet' : formatDate(game.releaseDate)],
    ...(price === null ? [] : ([['Price', price]] as [string, string][])),
  ];

  return (
    <article className="flex flex-col gap-8">
      <div className="relative -mx-4 -mt-6 px-4 pt-6 sm:-mx-6 sm:-mt-8 sm:px-6 sm:pt-8">
        {/* The game's own art, blurred and faded into the page: the loudest thing on screen. */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden"
        >
          <img
            src={game.headerImageUrl}
            alt=""
            className="size-full scale-110 object-cover opacity-50 blur-3xl"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/80 to-bg" />
        </div>
        <div className="grid gap-6 md:grid-cols-[minmax(0,460px)_1fr]">
          <img
            src={game.headerImageUrl}
            alt=""
            width={HEADER_WIDTH}
            height={HEADER_HEIGHT}
            style={{ viewTransitionName: artTransitionName(game.slug) }}
            className="aspect-[460/215] h-auto w-full rounded-card border border-border bg-raised object-cover shadow-xl shadow-black/40"
          />
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-2xl font-extrabold">{game.title}</h1>
            <RatingSummary average={game.rating.average} count={game.rating.count} />
            <ul className="flex flex-wrap gap-2" aria-label="Genres">
              {game.genres.map((genre) => (
                <li key={genre.slug}>
                  <Link
                    to={`/?genre=${genre.slug}`}
                    className="inline-flex h-7 items-center rounded-full border border-border px-3 text-xs text-muted hover:border-muted hover:text-text"
                  >
                    {genre.name}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">{game.shortDescription}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {facts.map(([term, value]) => (
                <div key={term} className="contents">
                  <dt className="text-muted">{term}</dt>
                  <dd className="tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="reviews-heading" className="flex flex-col gap-4">
          <h2 id="reviews-heading" className="font-display text-lg font-bold">
            Reviews
          </h2>
          <ReviewList slug={game.slug} />
        </section>
        <aside className="flex flex-col gap-4 lg:order-last">
          {state.status === 'signed-in' && (
            <>
              <LibraryStatusControl game={game} />
              <ReviewForm slug={game.slug} />
            </>
          )}
          {state.status === 'signed-out' && (
            <div className="rounded-card border border-border bg-surface p-4 text-sm">
              <p className="text-muted">
                Sign in to review this game and track it in your library.
              </p>
              <Link
                to={`/sign-in?from=${encodeURIComponent(location.pathname)}`}
                className={`${buttonClass('primary')} mt-3`}
              >
                Sign in
              </Link>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}

function GameSkeleton() {
  return (
    <div aria-busy className="grid gap-6 md:grid-cols-[minmax(0,460px)_1fr]">
      <div className="skeleton aspect-[460/215] w-full rounded-card" />
      <div className="flex flex-col gap-3">
        <div className="skeleton h-10 w-2/3 rounded" />
        <div className="skeleton h-4 w-1/3 rounded" />
        <div className="skeleton h-20 w-full rounded" />
      </div>
    </div>
  );
}

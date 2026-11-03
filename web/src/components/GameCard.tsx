import { Link } from 'react-router';
import type { GameSummary } from '../api/types';
import { formatPrice } from '../lib/format';
import { RatingSummary } from './RatingBar';

// Steam header images are 460 × 215; explicit dimensions keep the grid from shifting as they load.
export const HEADER_WIDTH = 460;
export const HEADER_HEIGHT = 215;

// The same name on the card and on the game page lets the browser morph one into the other.
export function artTransitionName(slug: string): string {
  return `art-${slug}`;
}

interface GameCardProps {
  game: GameSummary;
  featured?: boolean;
}

export function GameCard({ game, featured = false }: GameCardProps) {
  const price = formatPrice(game);
  return (
    <li
      className={`group overflow-hidden rounded-card border border-border bg-surface transition-colors duration-150 ease-out hover:border-muted ${
        featured ? 'w-72 shrink-0 snap-start sm:w-80' : ''
      }`}
    >
      <Link
        to={`/games/${game.slug}`}
        viewTransition
        className="block focus-visible:outline-offset-[-2px]"
      >
        <div className="overflow-hidden">
          <img
            src={game.headerImageUrl}
            alt=""
            width={HEADER_WIDTH}
            height={HEADER_HEIGHT}
            loading={featured ? 'eager' : 'lazy'}
            decoding="async"
            style={{ viewTransitionName: artTransitionName(game.slug) }}
            className="aspect-[460/215] h-auto w-full bg-raised object-cover transition-transform duration-200 ease-out group-hover:scale-[1.04]"
          />
        </div>
        <div className="flex flex-col gap-2 p-3">
          <h2 className="truncate text-sm font-semibold" title={game.title}>
            {game.title}
          </h2>
          <p className="truncate text-xs text-muted">
            {game.genres.map((genre) => genre.name).join(' · ') || 'No genre'}
          </p>
          <div className="flex items-center justify-between gap-2">
            <RatingSummary average={game.rating.average} count={game.rating.count} />
            {price !== null && <span className="text-xs text-muted tabular-nums">{price}</span>}
          </div>
        </div>
      </Link>
    </li>
  );
}

export function GameCardSkeleton() {
  return (
    <li aria-hidden className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="skeleton aspect-[460/215] w-full" />
      <div className="flex flex-col gap-2 p-3">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
    </li>
  );
}

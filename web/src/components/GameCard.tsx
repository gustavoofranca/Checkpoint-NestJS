import { Link } from 'react-router';
import type { GameSummary } from '../api/types';
import { formatPrice } from '../lib/format';
import { Rating } from './Rating';

// Steam header images are 460 × 215; explicit dimensions keep the grid from shifting as they load.
export const HEADER_WIDTH = 460;
export const HEADER_HEIGHT = 215;

export function GameCard({ game }: { game: GameSummary }) {
  const price = formatPrice(game);
  return (
    <li className="group overflow-hidden rounded-card border border-border bg-surface transition-colors duration-150 ease-out hover:border-muted">
      <Link to={`/games/${game.slug}`} className="block focus-visible:outline-offset-[-2px]">
        <img
          src={game.headerImageUrl}
          alt=""
          width={HEADER_WIDTH}
          height={HEADER_HEIGHT}
          loading="lazy"
          decoding="async"
          className="aspect-[460/215] h-auto w-full bg-raised object-cover"
        />
        <div className="flex flex-col gap-2 p-3">
          <h2 className="truncate text-sm font-semibold" title={game.title}>
            {game.title}
          </h2>
          <p className="truncate text-xs text-muted">
            {game.genres.map((genre) => genre.name).join(' · ') || 'No genre'}
          </p>
          <div className="flex items-center justify-between gap-2">
            <Rating rating={game.rating} />
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
      <div className="aspect-[460/215] w-full animate-pulse bg-raised" />
      <div className="flex flex-col gap-2 p-3">
        <div className="h-4 w-3/4 rounded bg-raised" />
        <div className="h-3 w-1/2 rounded bg-raised" />
        <div className="h-3 w-1/3 rounded bg-raised" />
      </div>
    </li>
  );
}

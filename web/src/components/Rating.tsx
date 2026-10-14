import { Star } from 'lucide-react';
import type { GameSummary } from '../api/types';
import { formatRating, plural } from '../lib/format';

export function Rating({ rating }: { rating: GameSummary['rating'] }) {
  if (rating.count === 0) {
    return <span className="text-xs text-muted">No reviews yet</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted tabular-nums">
      <Star size={16} strokeWidth={1.5} className="text-accent" aria-hidden />
      <span className="text-text">{formatRating(rating.average)}</span>
      <span>({plural(rating.count, 'review', 'reviews')})</span>
    </span>
  );
}

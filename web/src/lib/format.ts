import type { GameSummary } from '../api/types';

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

// API dates are UTC: release dates as YYYY-MM-DD, timestamps as ISO 8601.
export function formatDate(value: string): string {
  return dateFormat.format(new Date(value));
}

export function formatPrice(game: Pick<GameSummary, 'isFree' | 'price'>): string | null {
  if (game.isFree) {
    return 'Free';
  }
  if (game.price === null) {
    return null;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: game.price.currency,
  }).format(game.price.amountCents / 100);
}

export function formatRating(average: number): string {
  return average.toFixed(1);
}

export function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

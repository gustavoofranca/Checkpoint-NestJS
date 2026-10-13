import { encodeCursor } from './cursor';

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

// The caller fetches limit + 1 rows: the extra row only tells whether another page exists, and
// the cursor points at the last row actually served.
export function toPage<Row, Item>(
  rows: readonly Row[],
  limit: number,
  cursorOf: (row: Row) => object,
  toItem: (row: Row) => Item,
): Page<Item> {
  const served = rows.slice(0, limit);
  const last = served.at(-1);
  return {
    data: served.map(toItem),
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(cursorOf(last)) : null,
  };
}

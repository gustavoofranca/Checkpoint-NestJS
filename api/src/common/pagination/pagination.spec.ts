import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { decodeCursor, encodeCursor, INVALID_CURSOR } from './cursor';
import { toPage } from './page';

const schema = z.object({ key: z.string(), id: z.uuid() });
const ID = '0192f0c4-7b1e-7cc0-9a51-2f6d1e0b5a10';

describe('cursor', () => {
  it('round-trips through an opaque base64url string', () => {
    const cursor = encodeCursor({ key: 'hades', id: ID });

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor, schema)).toEqual({ key: 'hades', id: ID });
  });

  it.each([
    ['not base64url JSON', 'bm90IGpzb24'],
    ['JSON of the wrong shape', encodeCursor({ key: 1, id: 'not-a-uuid' })],
    ['a truncated cursor', encodeCursor({ key: 'hades', id: ID }).slice(0, 10)],
    ['an empty string', ''],
  ])('rejects %s with 400', (_, cursor) => {
    expect(() => decodeCursor(cursor, schema)).toThrow(new BadRequestException(INVALID_CURSOR));
  });
});

describe('toPage', () => {
  const rows = [1, 2, 3, 4];

  it('serves limit rows and a cursor when an extra row was fetched', () => {
    const page = toPage(rows, 3, (row) => ({ last: row }), String);

    expect(page.data).toEqual(['1', '2', '3']);
    expect(page.nextCursor).toBe(encodeCursor({ last: 3 }));
  });

  it('ends the list when no extra row was fetched', () => {
    expect(toPage(rows, 4, (row) => ({ last: row }), String)).toEqual({
      data: ['1', '2', '3', '4'],
      nextCursor: null,
    });
  });

  it('handles an empty result', () => {
    const none: number[] = [];

    expect(toPage(none, 20, (row) => ({ row }), String)).toEqual({ data: [], nextCursor: null });
  });
});

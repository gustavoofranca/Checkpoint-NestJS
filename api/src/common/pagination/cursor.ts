import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

export const INVALID_CURSOR = 'The cursor is invalid. Start again from the first page.';

// Opaque to clients: base64url of a small JSON document holding the sort key and id of the last
// item served (docs/adr/0005). Not signed; a forged cursor can only select a different starting
// point inside data the caller may read anyway.
export function encodeCursor(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException(INVALID_CURSOR);
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new BadRequestException(INVALID_CURSOR);
  }
  return parsed.data;
}

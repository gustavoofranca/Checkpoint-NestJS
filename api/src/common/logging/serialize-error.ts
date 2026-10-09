export interface SerializedError {
  type: string;
  message: string;
  code?: string | number;
  stack?: string;
}

// Errors from the database driver carry the failing row in enumerable fields (Prisma's `meta`
// holds PostgreSQL's "Failing row contains (...)", password hashes included). pino's default
// serializer copies every enumerable field, so only fields that identify the error are kept.
export function serializeError(error: unknown): SerializedError {
  if (!(error instanceof Error)) {
    return { type: typeof error, message: 'non-Error value thrown' };
  }
  const serialized: SerializedError = { type: error.name, message: error.message };
  if ('code' in error && (typeof error.code === 'string' || typeof error.code === 'number')) {
    serialized.code = error.code;
  }
  if (error.stack !== undefined) {
    serialized.stack = error.stack;
  }
  return serialized;
}

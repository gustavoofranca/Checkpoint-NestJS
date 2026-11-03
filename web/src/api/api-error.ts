// An error answered by the API (RFC 9457 Problem Details) or a request that never got an answer.
// The request id is shown to the user, so a report can be matched with the server logs.
export class ApiError extends Error {
  readonly status: number;
  readonly requestId: string | undefined;
  readonly fieldErrors: readonly { field: string; message: string }[];

  constructor(
    status: number,
    message: string,
    requestId?: string,
    fieldErrors: readonly { field: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
    this.fieldErrors = fieldErrors;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

const NETWORK_MESSAGE = 'Could not reach Checkpoint. Check your connection and try again.';

export function networkError(): ApiError {
  return new ApiError(0, NETWORK_MESSAGE);
}

// Builds an ApiError from whatever the API answered, trusting none of it: a proxy can answer
// with HTML, and an old API with another shape.
export function toApiError(body: unknown, response: Response): ApiError {
  const requestId = response.headers.get('X-Request-Id') ?? undefined;
  if (typeof body !== 'object' || body === null) {
    return new ApiError(response.status, fallbackMessage(response.status), requestId);
  }
  const detail = 'detail' in body && typeof body.detail === 'string' ? body.detail : undefined;
  const fieldErrors =
    'errors' in body && Array.isArray(body.errors)
      ? body.errors.flatMap((error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          'field' in error &&
          'message' in error &&
          typeof error.field === 'string' &&
          typeof error.message === 'string'
            ? [{ field: error.field, message: error.message }]
            : [],
        )
      : [];
  return new ApiError(
    response.status,
    detail ?? fallbackMessage(response.status),
    requestId,
    fieldErrors,
  );
}

function fallbackMessage(status: number): string {
  if (status === 429) {
    return 'Too many requests. Wait a moment and try again.';
  }
  if (status >= 500) {
    return 'Something went wrong on our side. Try again in a moment.';
  }
  return 'The request could not be completed.';
}

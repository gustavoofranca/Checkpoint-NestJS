import { describe, expect, it } from 'vitest';
import { toApiError } from './api-error';

describe('toApiError', () => {
  it('takes the detail, the request id and the field errors of a Problem Details answer', () => {
    const error = toApiError(
      {
        status: 400,
        detail: 'The request contains invalid fields.',
        errors: [{ field: 'username', message: 'username must be 3 to 24 characters' }, 'junk'],
      },
      new Response(null, { status: 400, headers: { 'X-Request-Id': 'req-7' } }),
    );

    expect(error).toMatchObject({
      status: 400,
      message: 'The request contains invalid fields.',
      requestId: 'req-7',
      fieldErrors: [{ field: 'username', message: 'username must be 3 to 24 characters' }],
    });
  });

  it('falls back to a human message when the body is not Problem Details', () => {
    expect(
      toApiError('<html>Bad Gateway</html>', new Response(null, { status: 502 })).message,
    ).toBe('Something went wrong on our side. Try again in a moment.');
    expect(toApiError(undefined, new Response(null, { status: 429 })).message).toBe(
      'Too many requests. Wait a moment and try again.',
    );
  });
});

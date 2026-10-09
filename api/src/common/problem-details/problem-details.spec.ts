import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RequestValidationException } from '../validation/request-validation.exception';
import { toProblemDetails } from './problem-details';

const REQUEST_ID = '0192f0c4-7b1e-7cc0-9a51-2f6d1e0b5a10';

describe('toProblemDetails', () => {
  it('maps an HttpException to its status and message', () => {
    expect(toProblemDetails(new NotFoundException('Game not found'), REQUEST_ID)).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'Game not found',
      requestId: REQUEST_ID,
    });
  });

  it('uses a plain string response body as the detail', () => {
    const problem = toProblemDetails(new HttpException('Slow down', 429), REQUEST_ID);

    expect(problem.status).toBe(429);
    expect(problem.detail).toBe('Slow down');
  });

  it('falls back to the exception message when the response body has no string message', () => {
    const exception = new HttpException({ reasons: ['a', 'b'] }, HttpStatus.CONFLICT);

    expect(toProblemDetails(exception, REQUEST_ID).detail).toBe(exception.message);
  });

  it('includes field errors from validation', () => {
    const errors = [{ field: 'rating', message: 'rating must not be greater than 5' }];

    const problem = toProblemDetails(new RequestValidationException(errors), REQUEST_ID);

    expect(problem.status).toBe(400);
    expect(problem.errors).toEqual(errors);
  });

  it('turns an unexpected error into a generic 500 that hides its message', () => {
    const problem = toProblemDetails(new Error('connect ECONNREFUSED 10.0.0.5:5432'), REQUEST_ID);

    expect(problem.status).toBe(500);
    expect(problem.title).toBe('Internal Server Error');
    expect(problem.detail).not.toContain('ECONNREFUSED');
    expect(problem).not.toHaveProperty('errors');
  });

  it('maps an exposed client error from Express middleware to its status', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
    });

    expect(toProblemDetails(tooLarge, REQUEST_ID)).toMatchObject({
      status: 413,
      title: 'Payload Too Large',
      detail: 'request entity too large',
    });
  });

  it('does not trust the expose flag on a server error', () => {
    const serverError = Object.assign(new Error('pool exhausted on db-1'), {
      status: 503,
      expose: true,
    });

    const problem = toProblemDetails(serverError, REQUEST_ID);

    expect(problem.status).toBe(500);
    expect(problem.detail).not.toContain('db-1');
  });

  it('treats a thrown non-Error value as unexpected', () => {
    expect(toProblemDetails('boom', REQUEST_ID).status).toBe(500);
  });

  it('omits requestId when the request has none', () => {
    expect(toProblemDetails(new NotFoundException(), undefined)).not.toHaveProperty('requestId');
  });
});

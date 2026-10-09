import { STATUS_CODES } from 'node:http';
import { HttpException } from '@nestjs/common';
import {
  type FieldError,
  RequestValidationException,
} from '../validation/request-validation.exception';

// RFC 9457. "about:blank" means the status code alone describes the problem type.
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  requestId?: string;
  errors?: readonly FieldError[];
}

// Errors from http-errors, which Express middleware such as body-parser throws. `expose` is true
// only for 4xx errors, whose messages are fixed phrases like "request entity too large".
interface ExposedClientError extends Error {
  status: number;
  expose: true;
}

const UNEXPECTED_ERROR_DETAIL =
  'An unexpected error occurred. Quote the request id when reporting it.';

// Expected errors carry messages written for the client. Anything else is unexpected, and its
// message may carry SQL, hostnames or file paths, so it is never echoed.
export function isExpectedError(
  exception: unknown,
): exception is HttpException | ExposedClientError {
  return exception instanceof HttpException || isExposedClientError(exception);
}

export function toProblemDetails(
  exception: unknown,
  requestId: string | undefined,
): ProblemDetails {
  const { status, detail } = describe(exception);
  const problem: ProblemDetails = {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    detail,
  };
  if (requestId !== undefined) {
    problem.requestId = requestId;
  }
  if (exception instanceof RequestValidationException) {
    problem.errors = exception.errors;
  }
  return problem;
}

function describe(exception: unknown): { status: number; detail: string } {
  if (exception instanceof HttpException) {
    return { status: exception.getStatus(), detail: messageOf(exception) };
  }
  if (isExposedClientError(exception)) {
    return { status: exception.status, detail: exception.message };
  }
  return { status: 500, detail: UNEXPECTED_ERROR_DETAIL };
}

function isExposedClientError(exception: unknown): exception is ExposedClientError {
  return (
    exception instanceof Error &&
    'expose' in exception &&
    exception.expose === true &&
    'status' in exception &&
    typeof exception.status === 'number' &&
    exception.status >= 400 &&
    exception.status < 500
  );
}

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if ('message' in response && typeof response.message === 'string') {
    return response.message;
  }
  return exception.message;
}

import * as Sentry from '@sentry/node';
import type { AppConfig } from '../../config/app-config';

type SentryEvent = Sentry.Event;

// Headers that help triage and identify nothing. Authorization and Cookie are never among them.
const SAFE_HEADERS = new Set(['accept', 'content-type', 'user-agent']);

// Collection is switched off category by category: the SDK defaults would send request bodies
// (passwords on /auth routes), cookies, headers, query strings and the local variables of every
// stack frame. Only the error, its stack and the tags set by reportError are left.
export function sentryOptions(config: AppConfig): Sentry.NodeOptions {
  return {
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: [...SAFE_HEADERS] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    beforeSend: (event) => scrubEvent(event),
  };
}

// The last check before an event leaves the process, whatever an integration attached to it.
export function scrubEvent<T extends SentryEvent>(event: T): T {
  const scrubbed: T = { ...event };
  if (event.request !== undefined) {
    const { url, method, headers } = event.request;
    scrubbed.request = {
      ...(url === undefined ? {} : { url: url.split('?')[0] }),
      ...(method === undefined ? {} : { method }),
      ...(headers === undefined ? {} : { headers: safeHeaders(headers) }),
    };
  }
  if (event.user !== undefined) {
    const id = event.user.id;
    if (id === undefined) {
      delete scrubbed.user;
    } else {
      scrubbed.user = { id };
    }
  }
  return scrubbed;
}

function safeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => SAFE_HEADERS.has(name.toLowerCase())),
  );
}

// Returns whether error reporting is on. Without SENTRY_DSN the SDK is never initialized, so
// reportError does nothing and no data leaves the process.
export function initSentry(
  config: AppConfig,
  overrides: Partial<Sentry.NodeOptions> = {},
): boolean {
  if (config.sentryDsn === undefined) {
    return false;
  }
  Sentry.init({ ...sentryOptions(config), ...overrides });
  return true;
}

export interface ErrorContext {
  requestId?: string | undefined;
  userId?: string | undefined;
  tags?: Record<string, string>;
}

export function reportError(error: unknown, context: ErrorContext = {}): void {
  Sentry.captureException(error, {
    tags: {
      ...context.tags,
      ...(context.requestId === undefined ? {} : { request_id: context.requestId }),
    },
    ...(context.userId === undefined ? {} : { user: { id: context.userId } }),
  });
}

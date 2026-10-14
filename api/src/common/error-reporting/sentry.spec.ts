import * as Sentry from '@sentry/node';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/support/test-config';
import { initSentry, scrubEvent, sentryOptions } from './sentry';

describe('scrubEvent', () => {
  it('keeps the URL path, the method and harmless headers of the request, nothing else', () => {
    const scrubbed = scrubEvent({
      request: {
        url: 'https://api.checkpoint.test/api/v1/auth/login?next=%2Fprofile',
        method: 'POST',
        data: { email: 'ana@checkpoint.test', password: 'correct horse battery' },
        query_string: 'next=%2Fprofile',
        cookies: { refresh_token: 'opaque-refresh' },
        headers: {
          Authorization: 'Bearer eyJ.secret',
          Cookie: 'refresh_token=opaque-refresh',
          'User-Agent': 'curl/8',
          'content-type': 'application/json',
        },
      },
    });

    expect(scrubbed.request).toEqual({
      url: 'https://api.checkpoint.test/api/v1/auth/login',
      method: 'POST',
      headers: { 'User-Agent': 'curl/8', 'content-type': 'application/json' },
    });
  });

  it('reduces the user to its id', () => {
    expect(
      scrubEvent({ user: { id: 'user-1', email: 'ana@checkpoint.test', ip_address: '10.0.0.1' } })
        .user,
    ).toEqual({ id: 'user-1' });
    expect(scrubEvent({ user: { ip_address: '10.0.0.1' } })).not.toHaveProperty('user');
  });

  it('leaves an event without request or user data unchanged', () => {
    const event = { message: 'boom', tags: { request_id: 'id' } };

    expect(scrubEvent(event)).toEqual(event);
  });
});

describe('sentryOptions', () => {
  it('turns off every kind of collected request and runtime data', () => {
    const options = sentryOptions(testConfig({ SENTRY_DSN: 'https://public@sentry.invalid/1' }));

    expect(options.dsn).toBe('https://public@sentry.invalid/1');
    expect(options.environment).toBe('test');
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    });
  });
});

describe('initSentry', () => {
  it('does not initialize the SDK without SENTRY_DSN', () => {
    expect(initSentry(testConfig())).toBe(false);
    expect(Sentry.isInitialized()).toBe(false);
  });
});

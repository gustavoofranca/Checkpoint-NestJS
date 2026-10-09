import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { pino } from 'pino';
import type { Options } from 'pino-http';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/support/test-config';
import { createLoggerParams } from './create-logger-params';
import { serializeError } from './serialize-error';

function pinoHttpOptions(nodeEnv: string): Options {
  const { pinoHttp } = createLoggerParams(testConfig({ NODE_ENV: nodeEnv }));
  if (pinoHttp === undefined || Array.isArray(pinoHttp) || !('level' in pinoHttp)) {
    throw new Error('expected pino-http options');
  }
  return pinoHttp;
}

describe('createLoggerParams', () => {
  it('pretty-prints only in development', () => {
    expect(pinoHttpOptions('development').transport).toEqual({ target: 'pino-pretty' });
    expect(pinoHttpOptions('test').transport).toBeUndefined();
    expect(pinoHttpOptions('production').transport).toBeUndefined();
  });

  it('reuses the request id assigned by the middleware', () => {
    const request = new IncomingMessage(new Socket());
    request.id = 'request-id-from-middleware';

    const id = pinoHttpOptions('test').genReqId?.(request, new ServerResponse(request));

    expect(id).toBe('request-id-from-middleware');
  });

  it('redacts credentials before they reach the log output', () => {
    const { redact } = pinoHttpOptions('production');
    if (redact === undefined) {
      throw new Error('expected redaction to be configured');
    }
    const lines: string[] = [];
    const logger = pino({ redact }, { write: (line: string) => lines.push(line) });

    logger.info(
      {
        req: {
          headers: { authorization: 'Bearer eyJ.secret', cookie: 'rt=opaque', accept: '*/*' },
        },
        res: { headers: { 'set-cookie': 'rt=rotated' } },
        body: { password: 'correct horse battery', refreshToken: 'opaque-refresh' },
        tokens: { token: 'raw-token', accessToken: 'raw-access' },
      },
      'request completed',
    );

    const output = lines.join('\n');
    for (const value of [
      'eyJ.secret',
      'rt=opaque',
      'rt=rotated',
      'correct horse battery',
      'opaque-refresh',
      'raw-token',
      'raw-access',
    ]) {
      expect(output).not.toContain(value);
    }
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('*/*');
  });

  it('logs a database error without the failing row the driver attaches to it', () => {
    const { serializers } = pinoHttpOptions('production');
    if (serializers === undefined) {
      throw new Error('expected serializers to be configured');
    }
    const lines: string[] = [];
    const logger = pino({ serializers }, { write: (line: string) => lines.push(line) });
    // Same shape as a Prisma error for a CHECK violation on users.
    const driverError = Object.assign(new Error('Check constraint violated'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2039',
      meta: {
        driverAdapterError: {
          cause: {
            detail: 'Failing row contains (1, ana@checkpoint.test, $argon2id$v=19$secret-hash).',
          },
        },
      },
    });

    logger.error({ err: driverError }, 'Unexpected error');

    const output = lines.join('\n');
    expect(output).not.toContain('ana@checkpoint.test');
    expect(output).not.toContain('secret-hash');
    expect(output).toContain('Check constraint violated');
    expect(output).toContain('P2039');
  });
});

describe('serializeError', () => {
  it('describes a thrown non-Error value without copying it', () => {
    expect(serializeError({ password: 'leaked?' })).toEqual({
      type: 'object',
      message: 'non-Error value thrown',
    });
  });
});

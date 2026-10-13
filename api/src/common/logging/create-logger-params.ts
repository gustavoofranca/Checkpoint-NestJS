import type { Params } from 'nestjs-pino';
import { type DestinationStream, stdSerializers } from 'pino';
import type { Options } from 'pino-http';
import type { AppConfig } from '../../config/app-config';
import { serializeError } from './serialize-error';

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
];

// destination: where log lines go instead of stdout; tests pass one to read what was logged.
export function createLoggerParams(config: AppConfig, destination?: DestinationStream): Params {
  const options: Options = {
    level: config.logLevel,
    // assignRequestId has already run; reuse its id so logs and responses match.
    genReqId: (request) => request.id,
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    // Unwrapped, so serializeError receives the Error itself. pino-http's default wrapping would
    // first copy every enumerable field of the error into a plain object (the driver's failing
    // row included) and hand that over instead.
    wrapSerializers: false,
    serializers: { req: stdSerializers.req, res: stdSerializers.res, err: serializeError },
  };
  if (destination !== undefined) {
    return { pinoHttp: [options, destination] };
  }
  if (config.nodeEnv === 'development') {
    return { pinoHttp: { ...options, transport: { target: 'pino-pretty' } } };
  }
  return { pinoHttp: options };
}

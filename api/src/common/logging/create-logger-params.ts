import type { Params } from 'nestjs-pino';
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

export function createLoggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      // assignRequestId has already run; reuse its id so logs and responses match.
      genReqId: (request) => request.id,
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      serializers: { err: serializeError },
      ...(config.nodeEnv === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
  };
}

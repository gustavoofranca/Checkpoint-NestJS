import { type Env, envSchema } from './env.schema';
import { type EnvironmentSource, parseEnvironment } from './parse-environment';

export class AppConfig {
  readonly nodeEnv: Env['NODE_ENV'];
  readonly port: number;
  readonly logLevel: Env['LOG_LEVEL'];
  readonly corsOrigins: readonly string[];
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly jwtSecret: string;
  readonly enableDocs: boolean;

  constructor(env: Env) {
    this.nodeEnv = env.NODE_ENV;
    this.port = env.PORT;
    this.logLevel = env.LOG_LEVEL;
    this.corsOrigins = env.CORS_ORIGINS;
    this.databaseUrl = env.DATABASE_URL;
    this.redisUrl = env.REDIS_URL;
    this.jwtSecret = env.JWT_SECRET;
    this.enableDocs = env.ENABLE_DOCS === 'true';
  }
}

export function loadConfig(source: EnvironmentSource): AppConfig {
  return new AppConfig(parseEnvironment(envSchema, source));
}

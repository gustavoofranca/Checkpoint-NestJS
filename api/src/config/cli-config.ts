import { z } from 'zod';
import { databaseUrl } from './env.schema';
import { type EnvironmentSource, parseEnvironment } from './parse-environment';

// The CLIs need only the database, plus the demo password for the seed. Requiring the API's
// full environment (JWT secret, Redis) to run a seed would be friction without benefit.

export function loadDatabaseUrl(source: EnvironmentSource): string {
  return parseEnvironment(z.object({ DATABASE_URL: databaseUrl }), source).DATABASE_URL;
}

// Same bounds as user passwords (docs/SECURITY.md section 2).
const seedSchema = z.object({
  DATABASE_URL: databaseUrl,
  SEED_DEMO_PASSWORD: z.string().min(12).max(128),
});

export interface SeedConfig {
  databaseUrl: string;
  demoPassword: string;
}

export function loadSeedConfig(source: EnvironmentSource): SeedConfig {
  const env = parseEnvironment(seedSchema, source);
  return { databaseUrl: env.DATABASE_URL, demoPassword: env.SEED_DEMO_PASSWORD };
}

import { describe, expect, it } from 'vitest';
import { loadDatabaseUrl, loadSeedConfig } from './cli-config';
import { InvalidEnvironmentError } from './invalid-environment.error';

const DATABASE_URL = 'postgresql://checkpoint:unused@127.0.0.1:1/checkpoint';

describe('loadDatabaseUrl', () => {
  it('returns DATABASE_URL and ignores the rest of the environment', () => {
    expect(loadDatabaseUrl({ DATABASE_URL })).toBe(DATABASE_URL);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadDatabaseUrl({})).toThrow(InvalidEnvironmentError);
  });
});

describe('loadSeedConfig', () => {
  it('returns the database URL and the demo password', () => {
    expect(loadSeedConfig({ DATABASE_URL, SEED_DEMO_PASSWORD: 'a-demo-password' })).toEqual({
      databaseUrl: DATABASE_URL,
      demoPassword: 'a-demo-password',
    });
  });

  it('rejects a demo password shorter than 12 characters without echoing it', () => {
    let problems: readonly string[] = [];
    try {
      loadSeedConfig({ DATABASE_URL, SEED_DEMO_PASSWORD: 'short-pw' });
    } catch (error) {
      if (!(error instanceof InvalidEnvironmentError)) {
        throw error;
      }
      problems = error.problems;
    }

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^SEED_DEMO_PASSWORD: /);
    expect(problems[0]).not.toContain('short-pw');
  });
});

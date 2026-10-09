import { describe, expect, it } from 'vitest';
import { testEnv } from '../../test/support/test-config';
import { loadConfig } from './app-config';
import { InvalidEnvironmentError } from './invalid-environment.error';

function problemsFor(source: Record<string, string | undefined>): readonly string[] {
  try {
    loadConfig(source);
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) {
      return error.problems;
    }
    throw error;
  }
  throw new Error('expected loadConfig to reject the environment');
}

describe('loadConfig', () => {
  it('builds a typed config from a valid environment', () => {
    const config = loadConfig(
      testEnv({ PORT: '4000', CORS_ORIGINS: 'https://a.test, https://b.test' }),
    );

    expect(config.nodeEnv).toBe('test');
    expect(config.port).toBe(4000);
    expect(config.corsOrigins).toEqual(['https://a.test', 'https://b.test']);
  });

  it('applies defaults for PORT and LOG_LEVEL', () => {
    const config = loadConfig(testEnv({ PORT: undefined, LOG_LEVEL: undefined }));

    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
  });

  it('rejects a missing JWT_SECRET with a message naming the variable', () => {
    expect(problemsFor(testEnv({ JWT_SECRET: undefined }))).toEqual(['JWT_SECRET: is required']);
  });

  it('rejects a JWT_SECRET shorter than 32 bytes without echoing it', () => {
    const shortSecret = 'too-short-to-sign-tokens';

    const problems = problemsFor(testEnv({ JWT_SECRET: shortSecret }));

    expect(problems).toEqual(['JWT_SECRET: must be at least 32 bytes']);
    expect(problems.join('\n')).not.toContain(shortSecret);
  });

  it('counts JWT_SECRET length in bytes, not characters', () => {
    // 16 characters of 2 bytes each in UTF-8.
    expect(() => loadConfig(testEnv({ JWT_SECRET: 'é'.repeat(16) }))).not.toThrow();
    expect(problemsFor(testEnv({ JWT_SECRET: 'é'.repeat(15) }))).toEqual([
      'JWT_SECRET: must be at least 32 bytes',
    ]);
  });

  it('requires NODE_ENV instead of assuming one', () => {
    expect(problemsFor(testEnv({ NODE_ENV: undefined }))).toEqual(['NODE_ENV: is required']);
  });

  it('rejects a CORS origin that carries a path', () => {
    const problems = problemsFor(testEnv({ CORS_ORIGINS: 'https://a.test/app' }));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^CORS_ORIGINS\.0: must be a bare origin/);
  });

  it('rejects an empty CORS_ORIGINS', () => {
    expect(problemsFor(testEnv({ CORS_ORIGINS: '' }))).toHaveLength(1);
  });

  it('rejects connection URLs with the wrong scheme', () => {
    const problems = problemsFor(
      testEnv({ DATABASE_URL: 'mysql://db:3306/app', REDIS_URL: 'http://cache:6379' }),
    );

    expect(problems.map((problem) => problem.split(':')[0])).toEqual(['DATABASE_URL', 'REDIS_URL']);
  });

  it('reports every invalid variable at once', () => {
    const problems = problemsFor(testEnv({ NODE_ENV: undefined, JWT_SECRET: undefined }));

    expect(problems).toHaveLength(2);
  });

  it('puts every problem in the error message', () => {
    expect(() => loadConfig(testEnv({ JWT_SECRET: undefined }))).toThrow(
      'Invalid environment configuration:\n  - JWT_SECRET: is required',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { toTestDatabaseUrl, toTestRedisUrl } from './test-database-url';

describe('toTestDatabaseUrl', () => {
  it('points to the sibling _test database and keeps everything else', () => {
    expect(toTestDatabaseUrl('postgresql://app:pw@localhost:5433/checkpoint?schema=public')).toBe(
      'postgresql://app:pw@localhost:5433/checkpoint_test?schema=public',
    );
  });

  it('leaves a URL that already targets a test database unchanged', () => {
    expect(toTestDatabaseUrl('postgresql://app:pw@db:5432/checkpoint_test')).toBe(
      'postgresql://app:pw@db:5432/checkpoint_test',
    );
  });

  it('rejects a URL without a database name', () => {
    expect(() => toTestDatabaseUrl('postgresql://app:pw@db:5432')).toThrow(
      'DATABASE_URL must name a database',
    );
  });
});

describe('toTestRedisUrl', () => {
  it('points at logical database 1 and keeps the credentials', () => {
    expect(toTestRedisUrl('redis://:secret-placeholder@localhost:6379')).toBe(
      'redis://:secret-placeholder@localhost:6379/1',
    );
    expect(toTestRedisUrl('redis://localhost:6379/0')).toBe('redis://localhost:6379/1');
  });
});

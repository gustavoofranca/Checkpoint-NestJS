import { describe, expect, it } from 'vitest';
import { toTestDatabaseUrl } from './test-database-url';

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

const TEST_SUFFIX = '_test';

// Tests write and delete rows, so they run against a sibling database: checkpoint becomes
// checkpoint_test on the same server. Idempotent, so it is safe to apply twice.
export function toTestDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, '');
  if (name === '') {
    throw new Error('DATABASE_URL must name a database');
  }
  if (!name.endsWith(TEST_SUFFIX)) {
    url.pathname = `/${name}${TEST_SUFFIX}`;
  }
  return url.href;
}

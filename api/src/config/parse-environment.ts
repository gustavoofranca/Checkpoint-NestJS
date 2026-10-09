import type { z } from 'zod';
import { InvalidEnvironmentError } from './invalid-environment.error';

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

// Issue messages never include the received value, so a rejected secret is not echoed to the logs.
const reportMissing: z.core.$ZodErrorMap = (issue) =>
  issue.input === undefined ? 'is required' : undefined;

export function parseEnvironment<T extends z.ZodType>(
  schema: T,
  source: EnvironmentSource,
): z.output<T> {
  const result = schema.safeParse(source, { error: reportMissing });
  if (!result.success) {
    throw new InvalidEnvironmentError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

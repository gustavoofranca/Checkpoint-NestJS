import { InvalidEnvironmentError } from '../config/invalid-environment.error';

export class CliUsageError extends Error {}

type ErrorClass = new (...args: never[]) => Error;

export function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function describeFailure(error: unknown, expected: readonly ErrorClass[]): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const isExpected =
    error instanceof InvalidEnvironmentError ||
    error instanceof CliUsageError ||
    expected.some((type) => error instanceof type);
  return isExpected ? error.message : (error.stack ?? error.message);
}

// Expected failures (bad environment, bad arguments, domain errors listed by the caller) print
// one line and exit with 1. Anything else keeps its stack trace: it is a bug to investigate.
export function runCli(main: () => Promise<void>, expected: readonly ErrorClass[] = []): void {
  main().catch((error: unknown) => {
    process.stderr.write(`${describeFailure(error, expected)}\n`);
    process.exitCode = 1;
  });
}

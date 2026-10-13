import type { DestinationStream } from 'pino';

export type LogEntry = Record<string, unknown>;

// A pino destination that keeps every line, so tests can check what the app logged.
export class LogCapture implements DestinationStream {
  private lines: string[] = [];

  write(line: string): void {
    this.lines.push(line);
  }

  clear(): void {
    this.lines = [];
  }

  text(): string {
    return this.lines.join('');
  }

  entries(): LogEntry[] {
    return this.lines.map((line) => {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`log line is not a JSON object: ${line}`);
      }
      return Object.fromEntries(Object.entries(parsed));
    });
  }
}

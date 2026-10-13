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

  audit(event: string): LogEntry[] {
    return this.entries().filter((entry) => entry.audit === event);
  }
}

// The request id that nestjs-pino binds to every line logged while a request is handled.
export function loggedRequestId(entry: LogEntry | undefined): unknown {
  const req = entry?.req;
  if (typeof req !== 'object' || req === null || !('id' in req)) {
    return undefined;
  }
  return req.id;
}

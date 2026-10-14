import type * as Sentry from '@sentry/node';

type Transport = ReturnType<NonNullable<Sentry.NodeOptions['transport']>>;
type Envelope = Parameters<Transport['send']>[0];

// A Sentry transport that keeps envelopes instead of sending them, so tests see exactly what the
// SDK would put on the wire.
export class RecordingSentryTransport {
  private readonly envelopes: Envelope[] = [];

  readonly create = (): Transport => ({
    send: (envelope) => {
      this.envelopes.push(envelope);
      return Promise.resolve({});
    },
    flush: () => Promise.resolve(true),
  });

  clear(): void {
    this.envelopes.length = 0;
  }

  // The error events sent so far, as the JSON objects Sentry would receive.
  events(): Record<string, unknown>[] {
    return this.envelopes.flatMap(([, items]) =>
      items.flatMap(([header, payload]) => {
        if (header.type !== 'event') {
          return [];
        }
        const parsed: unknown = JSON.parse(JSON.stringify(payload));
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          return [];
        }
        return [Object.fromEntries(Object.entries(parsed))];
      }),
    );
  }
}

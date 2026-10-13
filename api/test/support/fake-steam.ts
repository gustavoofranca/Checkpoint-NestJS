import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

// A local stand-in for store.steampowered.com/api/appdetails. Steam is the only dependency tests
// replace, and they replace it at the HTTP boundary: the real client sends real requests here.

export type SteamBehaviour =
  | { kind: 'game'; data: Record<string, unknown> }
  | { kind: 'no-data' }
  | { kind: 'status'; status: number }
  | { kind: 'body'; body: string }
  | { kind: 'chunked'; chunk: string; times: number }
  | { kind: 'redirect'; location: string }
  | { kind: 'drop' }
  | { kind: 'hang' };

export function steamGame(appId: number, overrides: Record<string, unknown> = {}) {
  return {
    type: 'game',
    name: `Game ${String(appId)}`,
    steam_appid: appId,
    is_free: false,
    short_description: `Description of game ${String(appId)}.`,
    header_image: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${String(appId)}/header.jpg`,
    release_date: { coming_soon: false, date: 'Sep 17, 2020' },
    developers: ['Studio'],
    publishers: ['Publisher'],
    price_overview: { currency: 'USD', initial: 1999 },
    genres: [{ description: 'Action' }],
    ...overrides,
  };
}

export class FakeSteam {
  // Per app id, the behaviours to play in order; the last one repeats.
  private readonly script = new Map<number, SteamBehaviour[]>();
  readonly requests: number[] = [];
  private server: Server | undefined;

  on(appId: number, ...behaviours: SteamBehaviour[]): this {
    this.script.set(appId, behaviours);
    return this;
  }

  async start(): Promise<string> {
    this.server = createServer((request, response) => {
      this.handle(request, response);
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    const address = this.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a TCP address');
    }
    return `http://127.0.0.1:${String(address.port)}/api/appdetails`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (server === undefined) {
      return;
    }
    // Requests left hanging on purpose would otherwise keep the server open.
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }

  private handle(request: IncomingMessage, response: ServerResponse): void {
    const appId = Number(
      new URL(request.url ?? '/', 'http://localhost').searchParams.get('appids'),
    );
    this.requests.push(appId);
    const behaviours = this.script.get(appId) ?? [{ kind: 'no-data' }];
    const behaviour = behaviours.length > 1 ? behaviours.shift() : behaviours[0];
    switch (behaviour?.kind) {
      case 'game':
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ [String(appId)]: { success: true, data: behaviour.data } }));
        return;
      case 'status':
        response.writeHead(behaviour.status);
        response.end();
        return;
      case 'body':
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(behaviour.body);
        return;
      case 'chunked':
        // No Content-Length: the client only learns the size while reading.
        response.writeHead(200, { 'content-type': 'application/json' });
        for (let index = 0; index < behaviour.times; index += 1) {
          response.write(behaviour.chunk);
        }
        response.end();
        return;
      case 'redirect':
        response.writeHead(302, { location: behaviour.location });
        response.end();
        return;
      case 'drop':
        // The connection dies after the headers and part of the body.
        response.writeHead(200, { 'content-type': 'application/json', 'content-length': '1000' });
        response.write('{"');
        response.socket?.destroy();
        return;
      case 'hang':
        return;
      case 'no-data':
      case undefined:
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ [String(appId)]: { success: false } }));
    }
  }
}

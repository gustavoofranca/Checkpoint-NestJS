import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeSteam, steamGame } from '../../../../test/support/fake-steam';
import { SteamClient, SteamUnavailableError } from './steam-client';

describe('SteamClient', () => {
  let steam: FakeSteam;
  let client: SteamClient;

  beforeEach(async () => {
    steam = new FakeSteam();
    const baseUrl = await steam.start();
    client = new SteamClient({
      baseUrl,
      requestTimeoutMs: 300,
      maxResponseBytes: 64 * 1024,
      retryDelaysMs: [10, 10],
    });
  });

  afterEach(async () => {
    await steam.stop();
  });

  it('returns a normalized game', async () => {
    steam.on(10, { kind: 'game', data: steamGame(10, { name: 'Counter-Strike' }) });

    expect(await client.fetchAppDetails(10)).toMatchObject({
      outcome: 'game',
      game: { steamAppId: 10, title: 'Counter-Strike', priceCents: 1999 },
    });
  });

  it('rejects an app Steam has no store data for', async () => {
    steam.on(11, { kind: 'no-data' });

    expect(await client.fetchAppDetails(11)).toEqual({
      outcome: 'rejected',
      reason: 'Steam has no store data for it',
    });
  });

  it.each([
    ['not JSON', '<html>maintenance</html>', 'response is not JSON'],
    ['JSON of another shape', '{"oops": true}', 'response does not have the expected shape'],
  ])('rejects a body that is %s', async (_, body, reason) => {
    steam.on(12, { kind: 'body', body });

    expect(await client.fetchAppDetails(12)).toEqual({ outcome: 'rejected', reason });
  });

  it('strips HTML and rejects an image from an unlisted host', async () => {
    steam.on(13, {
      kind: 'game',
      data: steamGame(13, { name: '<b>Bold</b> Game', header_image: 'https://evil.example/x.jpg' }),
    });

    expect(await client.fetchAppDetails(13)).toEqual({
      outcome: 'rejected',
      reason: 'header image is not an https URL on an allowed Steam host',
    });
  });

  it('retries after 429 and succeeds', async () => {
    steam.on(14, { kind: 'status', status: 429 }, { kind: 'game', data: steamGame(14) });

    expect(await client.fetchAppDetails(14)).toMatchObject({ outcome: 'game' });
    expect(steam.requests).toEqual([14, 14]);
  });

  it('gives up after the last retry when Steam keeps failing', async () => {
    steam.on(15, { kind: 'status', status: 503 });

    await expect(client.fetchAppDetails(15)).rejects.toThrow(SteamUnavailableError);
    expect(steam.requests).toEqual([15, 15, 15]);
  });

  it('retries a response whose connection drops halfway through the body', async () => {
    steam.on(21, { kind: 'drop' }, { kind: 'game', data: steamGame(21) });

    expect(await client.fetchAppDetails(21)).toMatchObject({ outcome: 'game' });
    expect(steam.requests).toEqual([21, 21]);
  });

  it('treats a request that never answers as unavailable once the timeout passes', async () => {
    steam.on(16, { kind: 'hang' });

    await expect(client.fetchAppDetails(16)).rejects.toThrow(SteamUnavailableError);
  });

  it('does not follow a redirect to another host', async () => {
    steam.on(17, { kind: 'redirect', location: 'https://evil.example/appdetails' });

    expect(await client.fetchAppDetails(17)).toEqual({
      outcome: 'rejected',
      reason: 'unexpected HTTP 302',
    });
    expect(steam.requests).toEqual([17]);
  });

  it('stops reading a response larger than the cap', async () => {
    steam.on(18, {
      kind: 'body',
      body: `{"18":{"success":true,"data":"${'x'.repeat(100 * 1024)}"}}`,
    });

    expect(await client.fetchAppDetails(18)).toEqual({
      outcome: 'rejected',
      reason: 'response larger than 65536 bytes',
    });
  });

  it('stops a response without Content-Length as soon as it passes the cap', async () => {
    steam.on(19, { kind: 'chunked', chunk: 'x'.repeat(16 * 1024), times: 10 });

    expect(await client.fetchAppDetails(19)).toEqual({
      outcome: 'rejected',
      reason: 'response larger than 65536 bytes',
    });
  });

  it('rejects a status that retrying would not change, without retrying', async () => {
    steam.on(20, { kind: 'status', status: 404 });

    expect(await client.fetchAppDetails(20)).toEqual({
      outcome: 'rejected',
      reason: 'unexpected HTTP 404',
    });
    expect(steam.requests).toEqual([20]);
  });

  it('rejects an answer without a body', async () => {
    steam.on(22, { kind: 'status', status: 204 });

    expect(await client.fetchAppDetails(22)).toEqual({
      outcome: 'rejected',
      reason: 'unexpected HTTP 204',
    });
  });

  it('refuses an app id that is not a positive integer before any request', async () => {
    await expect(client.fetchAppDetails(-1)).rejects.toThrow('Invalid Steam app id');
    expect(steam.requests).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeSteamApp } from './normalize-steam-app';
import { parseReleaseDate } from './parse-release-date';

// Shape and values taken from a real appdetails response (Hades, app 1145360).
function hadesPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'game',
    name: 'Hades',
    steam_appid: 1145360,
    is_free: false,
    short_description:
      'Defy the god of the dead as you hack and slash out of the Underworld in this rogue-like dungeon crawler.',
    header_image:
      'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145360/header.jpg?t=1758127023',
    release_date: { coming_soon: false, date: 'Sep 17, 2020' },
    developers: ['Supergiant Games'],
    publishers: ['Supergiant Games'],
    price_overview: { currency: 'USD', initial: 2499, final: 1249 },
    genres: [
      { id: '1', description: 'Action' },
      { id: '23', description: 'Indie' },
      { id: '3', description: 'RPG' },
    ],
    ...overrides,
  };
}

function normalizedOrFail(payload: unknown, appId = 1145360) {
  const result = normalizeSteamApp(appId, payload);
  if (!result.ok) {
    throw new Error(`expected a game, got: ${result.reason}`);
  }
  return result.game;
}

describe('normalizeSteamApp', () => {
  it('maps a real payload to a catalog game', () => {
    expect(normalizedOrFail(hadesPayload())).toEqual({
      steamAppId: 1145360,
      title: 'Hades',
      shortDescription:
        'Defy the god of the dead as you hack and slash out of the Underworld in this rogue-like dungeon crawler.',
      headerImageUrl:
        'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145360/header.jpg?t=1758127023',
      releaseDate: '2020-09-17',
      developers: ['Supergiant Games'],
      publishers: ['Supergiant Games'],
      isFree: false,
      priceCents: 2499,
      currency: 'USD',
      genres: ['Action', 'Indie', 'RPG'],
    });
  });

  it('strips HTML from text fields', () => {
    const game = normalizedOrFail(
      hadesPayload({
        name: 'Hades <b>II</b>',
        short_description: '<p>Battle <script>alert(1)</script>beyond &amp; below</p>',
        developers: ['<i>Supergiant</i> Games'],
      }),
    );

    expect(game.title).toBe('Hades II');
    expect(game.shortDescription).toBe('Battle alert(1) beyond & below');
    expect(game.developers).toEqual(['Supergiant Games']);
  });

  it('rejects an image URL from a host outside the allow-list', () => {
    const result = normalizeSteamApp(
      1145360,
      hadesPayload({ header_image: 'https://steamstatic.com.evil.example/header.jpg' }),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'header image is not an https URL on an allowed Steam host',
    });
  });

  it('rejects an image URL over plain http', () => {
    const result = normalizeSteamApp(
      1145360,
      hadesPayload({
        header_image: 'http://shared.akamai.steamstatic.com/store_item_assets/header.jpg',
      }),
    );

    expect(result.ok).toBe(false);
  });

  it('rejects anything that is not a game', () => {
    expect(normalizeSteamApp(1145360, hadesPayload({ type: 'dlc' }))).toEqual({
      ok: false,
      reason: 'not a game (type: dlc)',
    });
  });

  it('rejects an answer for a different app than the one requested', () => {
    expect(normalizeSteamApp(1145360, hadesPayload({ steam_appid: 1145350 })).ok).toBe(false);
  });

  it('rejects a payload with the wrong shape', () => {
    expect(normalizeSteamApp(1145360, { name: 'Hades' })).toEqual({
      ok: false,
      reason: 'payload does not have the expected shape',
    });
  });

  it('rejects a title that is empty once HTML is removed', () => {
    expect(normalizeSteamApp(1145360, hadesPayload({ name: '<span></span>' })).ok).toBe(false);
  });

  it('stores no price for a free game', () => {
    const game = normalizedOrFail(hadesPayload({ is_free: true }));

    expect(game).toMatchObject({ isFree: true, priceCents: null, currency: null });
  });

  it('stores no price when Steam sends none or an invalid currency', () => {
    expect(normalizedOrFail(hadesPayload({ price_overview: undefined }))).toMatchObject({
      priceCents: null,
      currency: null,
    });
    expect(
      normalizedOrFail(hadesPayload({ price_overview: { currency: 'US$', initial: 2499 } })),
    ).toMatchObject({ priceCents: null, currency: null });
  });

  it('has no release date for an unreleased game', () => {
    const game = normalizedOrFail(
      hadesPayload({ release_date: { coming_soon: true, date: 'Coming soon' } }),
    );

    expect(game.releaseDate).toBeNull();
  });

  it('truncates a long description and drops empty or duplicate names', () => {
    const game = normalizedOrFail(
      hadesPayload({
        short_description: 'x'.repeat(1500),
        developers: ['Supergiant Games', '', 'Supergiant Games', '<br>'],
        genres: undefined,
      }),
    );

    expect(game.shortDescription).toHaveLength(1000);
    expect(game.shortDescription.endsWith('…')).toBe(true);
    expect(game.developers).toEqual(['Supergiant Games']);
    expect(game.genres).toEqual([]);
  });

  it('does not split a surrogate pair when truncating', () => {
    const game = normalizedOrFail(hadesPayload({ short_description: `${'x'.repeat(998)}🎮🎮` }));

    expect(game.shortDescription).toBe(`${'x'.repeat(998)}…`);
  });
});

describe('parseReleaseDate', () => {
  it.each([
    ['Sep 17, 2020', '2020-09-17'],
    ['17 Sep, 2020', '2020-09-17'],
    ['Feb 29, 2024', '2024-02-29'],
    ['  Jul 9, 2013 ', '2013-07-09'],
  ])('parses %j', (text, expected) => {
    expect(parseReleaseDate(text)).toBe(expected);
  });

  it.each(['Coming soon', 'Q2 2026', '2026', 'Feb 30, 2024', 'Foo 1, 2020', ''])(
    'returns null for %j',
    (text) => {
      expect(parseReleaseDate(text)).toBeNull();
    },
  );
});

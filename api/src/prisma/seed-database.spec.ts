import { describe, expect, it } from 'vitest';
import type { CatalogGame } from '../modules/sync/catalog-game';
import { assignSlugs } from './seed-database';

function game(steamAppId: number, title: string): CatalogGame {
  return {
    steamAppId,
    title,
    shortDescription: '',
    headerImageUrl: 'https://shared.akamai.steamstatic.com/header.jpg',
    releaseDate: null,
    developers: [],
    publishers: [],
    isFree: true,
    priceCents: null,
    currency: null,
    genres: [],
  };
}

describe('assignSlugs', () => {
  it('slugifies each title', () => {
    expect(assignSlugs([game(1145360, 'Hades')]).get(1145360)).toBe('hades');
  });

  it('gives the plain slug to the lowest app id and suffixes the rest, in any input order', () => {
    const forward = assignSlugs([game(20, 'Portal'), game(400, 'Portal')]);
    const reversed = assignSlugs([game(400, 'Portal'), game(20, 'Portal')]);

    expect(forward).toEqual(reversed);
    expect(forward.get(20)).toBe('portal');
    expect(forward.get(400)).toBe('portal-400');
  });

  it('falls back to the app id when the title has no usable characters', () => {
    expect(assignSlugs([game(1234, '原神')]).get(1234)).toBe('app-1234');
  });
});

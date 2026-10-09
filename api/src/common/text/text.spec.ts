import { describe, expect, it } from 'vitest';
import { slugify } from './slugify';
import { stripHtml } from './strip-html';
import { titleSortKey } from './title-sort-key';

describe('titleSortKey', () => {
  it('ignores case, accents and trademark signs', () => {
    expect(titleSortKey('ARMORED CORE™ VI')).toBe('armored core vi');
    expect(titleSortKey('Pokémon® Café')).toBe('pokemon cafe');
  });

  it('orders titles the way a reader expects', () => {
    const titles = ['ARK: Survival Ascended', 'Age of Empires IV', 'among us', 'Ägypten'];

    expect([...titles].sort((a, b) => (titleSortKey(a) < titleSortKey(b) ? -1 : 1))).toEqual([
      'Age of Empires IV',
      'Ägypten',
      'among us',
      'ARK: Survival Ascended',
    ]);
  });

  it('collapses whitespace and caps the length', () => {
    expect(titleSortKey('  Half   Life  ')).toBe('half life');
    expect(titleSortKey('x'.repeat(300))).toHaveLength(200);
  });
});

describe('stripHtml', () => {
  it('removes tags and collapses the whitespace they leave', () => {
    expect(stripHtml('<p>Hack and <strong>slash</strong></p>\n<br/>out')).toBe(
      'Hack and slash out',
    );
  });

  it('removes tags together with their attributes', () => {
    expect(stripHtml('<img src=x onerror="alert(1)">Safe text')).toBe('Safe text');
  });

  it('decodes named and numeric entities', () => {
    expect(stripHtml('Tom &amp; Jerry &quot;quoted&quot; &#8212; &#x2122;')).toBe(
      'Tom & Jerry "quoted" — ™',
    );
  });

  it('keeps unknown or invalid entities as written', () => {
    expect(stripHtml('&unknownx; &#0; &#x110000;')).toBe('&unknownx; &#0; &#x110000;');
  });

  it('leaves a decoded angle bracket as text', () => {
    expect(stripHtml('1 &lt; 2')).toBe('1 < 2');
  });
});

describe('slugify', () => {
  it('builds lowercase words joined by hyphens', () => {
    expect(slugify('The Witcher 3: Wild Hunt')).toBe('the-witcher-3-wild-hunt');
  });

  it('removes accents', () => {
    expect(slugify('Pokémon Café — Édition')).toBe('pokemon-cafe-edition');
  });

  it('drops trademark signs instead of spelling them out', () => {
    expect(slugify('BioShock™ Remastered')).toBe('bioshock-remastered');
    expect(slugify('Call of Duty®: Black Ops III')).toBe('call-of-duty-black-ops-iii');
  });

  it('folds compatibility characters such as ligatures and full-width letters', () => {
    expect(slugify('ﬁnal ＦＡＮＴＡＳＹ')).toBe('final-fantasy');
  });

  it('trims hyphens left at the ends', () => {
    expect(slugify('  ...Hades II!  ')).toBe('hades-ii');
  });

  it('returns an empty string when no ASCII letter or digit remains', () => {
    expect(slugify('原神')).toBe('');
  });

  it('caps the length without leaving a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(99)} b`);

    expect(slug).toBe('a'.repeat(99));
  });
});

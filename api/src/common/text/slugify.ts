const MAX_SLUG_LENGTH = 100;

// Lowercase ASCII words joined by single hyphens, which is what the database CHECK accepts.
// Returns an empty string when nothing usable remains (for example a title in another script);
// callers decide the fallback.
export function slugify(text: string): string {
  return (
    text
      // NFKD would turn ™ into "TM" ("bioshocktm"), so legal marks (™ ® © ℠) go first.
      .replace(/[\u2122\u00ae\u00a9\u2120]/g, '')
      .normalize('NFKD')
      // Combining diacritical marks, which NFKD split off the letters.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, MAX_SLUG_LENGTH)
      .replace(/^-+|-+$/g, '')
  );
}

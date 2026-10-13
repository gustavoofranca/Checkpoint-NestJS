const MAX_LENGTH = 200;

// Key for sorting titles the way a reader expects: case, accents and trademark signs ignored.
// Computed here rather than by the database collation, which differs between images (Alpine's
// PostgreSQL compares bytes, so "ARK" sorted before "Age").
export function titleSortKey(title: string): string {
  return title
    .replace(/[™®©℠]/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LENGTH);
}

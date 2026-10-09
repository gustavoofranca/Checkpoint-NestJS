// Makes user input match literally inside a LIKE / ILIKE pattern: %, _ and the escape character
// itself (PostgreSQL's default, backslash) lose their special meaning (docs/SECURITY.md section 3).
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

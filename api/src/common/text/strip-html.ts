const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntity(entity: string, body: string): string {
  if (body.startsWith('#x') || body.startsWith('#X')) {
    return codePointOrSelf(Number.parseInt(body.slice(2), 16), entity);
  }
  if (body.startsWith('#')) {
    return codePointOrSelf(Number.parseInt(body.slice(1), 10), entity);
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
}

function codePointOrSelf(codePoint: number, entity: string): string {
  const isValid = Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff;
  return isValid ? String.fromCodePoint(codePoint) : entity;
}

// Turns third-party HTML into plain text: tags removed, common entities decoded, whitespace
// collapsed. The result is stored and rendered as text, never as HTML (docs/SECURITY.md section 3),
// so a decoded "<" is harmless.
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi, (entity, body: string) =>
      decodeEntity(entity, body),
    )
    .replace(/\s+/g, ' ')
    .trim();
}

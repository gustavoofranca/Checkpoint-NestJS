import { stripHtml } from '../../../common/text/strip-html';
import { type CatalogGame, catalogGameSchema } from '../catalog-game';
import { parseReleaseDate } from './parse-release-date';
import { type SteamAppData, steamAppDataSchema } from './steam-app-details.schema';

// Exact hosts of Steam's image CDN. A suffix match would also accept any subdomain someone
// manages to get under these domains.
export const STEAM_IMAGE_HOSTS: ReadonlySet<string> = new Set([
  'shared.akamai.steamstatic.com',
  'shared.fastly.steamstatic.com',
  'shared.cloudflare.steamstatic.com',
  'cdn.akamai.steamstatic.com',
  'cdn.fastly.steamstatic.com',
  'cdn.cloudflare.steamstatic.com',
]);

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 1000;
const MAX_NAME = 100;
const MAX_GENRE = 60;
const MAX_LIST_ITEMS = 10;
const MAX_IMAGE_URL = 500;

export type NormalizeResult = { ok: true; game: CatalogGame } | { ok: false; reason: string };

function reject(reason: string): NormalizeResult {
  return { ok: false, reason };
}

// Cuts on a UTF-16 boundary without splitting a surrogate pair.
function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  let end = max - 1;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) {
    end -= 1;
  }
  return `${text.slice(0, end).trimEnd()}…`;
}

function cleanList(values: readonly string[], maxLength: number): string[] {
  const cleaned = values.map((value) => truncate(stripHtml(value), maxLength)).filter(Boolean);
  return [...new Set(cleaned)].slice(0, MAX_LIST_ITEMS);
}

function allowedImageUrl(raw: string): string | null {
  const url = URL.parse(raw);
  if (url?.protocol !== 'https:' || !STEAM_IMAGE_HOSTS.has(url.hostname)) {
    return null;
  }
  return url.href.length <= MAX_IMAGE_URL ? url.href : null;
}

// The list price, not the discounted one: a snapshot taken during a sale would otherwise keep
// the sale price until the next sync.
function price(data: SteamAppData): Pick<CatalogGame, 'priceCents' | 'currency'> {
  const overview = data.price_overview;
  if (data.is_free || overview === undefined) {
    return { priceCents: null, currency: null };
  }
  const currency = overview.currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { priceCents: null, currency: null };
  }
  return { priceCents: overview.initial, currency };
}

// Turns one appdetails `data` object into a catalog game, or explains why it cannot be one.
// Steam data is untrusted input (docs/SECURITY.md section 3).
export function normalizeSteamApp(requestedAppId: number, payload: unknown): NormalizeResult {
  const parsed = steamAppDataSchema.safeParse(payload);
  if (!parsed.success) {
    return reject('payload does not have the expected shape');
  }
  const data = parsed.data;
  if (data.type !== 'game') {
    return reject(`not a game (type: ${truncate(data.type, 20)})`);
  }
  if (data.steam_appid !== requestedAppId) {
    return reject(`Steam answered for app ${String(data.steam_appid)} instead`);
  }
  const title = stripHtml(data.name);
  if (title === '' || title.length > MAX_TITLE) {
    return reject('title is empty or too long');
  }
  const headerImageUrl = allowedImageUrl(data.header_image);
  if (headerImageUrl === null) {
    return reject('header image is not an https URL on an allowed Steam host');
  }

  const candidate: CatalogGame = {
    steamAppId: data.steam_appid,
    title,
    shortDescription: truncate(stripHtml(data.short_description), MAX_DESCRIPTION),
    headerImageUrl,
    releaseDate:
      data.release_date === undefined || data.release_date.coming_soon
        ? null
        : parseReleaseDate(data.release_date.date),
    developers: cleanList(data.developers ?? [], MAX_NAME),
    publishers: cleanList(data.publishers ?? [], MAX_NAME),
    isFree: data.is_free,
    ...price(data),
    genres: cleanList(
      (data.genres ?? []).map((genre) => genre.description),
      MAX_GENRE,
    ),
  };

  // Last guard: the same schema the seed applies to the bundled snapshot.
  const checked = catalogGameSchema.safeParse(candidate);
  return checked.success
    ? { ok: true, game: checked.data }
    : reject('normalized game failed validation');
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

// With l=english Steam writes "Sep 17, 2020" and, for some apps, "17 Sep, 2020".
const MONTH_FIRST = /^([A-Za-z]{3})[A-Za-z]* (\d{1,2}), (\d{4})$/;
const DAY_FIRST = /^(\d{1,2}) ([A-Za-z]{3})[A-Za-z]*, (\d{4})$/;

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDay =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isRealDay ? date.toISOString().slice(0, 10) : null;
}

function fromParts(monthName: string, day: string, year: string): string | null {
  const month = MONTHS[monthName.toLowerCase()];
  return month === undefined ? null : isoDate(Number(year), month, Number(day));
}

// Returns YYYY-MM-DD, or null for anything that is not one exact calendar day: "Coming soon",
// "Q2 2026", "2026", or an impossible date.
export function parseReleaseDate(text: string): string | null {
  const trimmed = text.trim();
  const monthFirst = MONTH_FIRST.exec(trimmed);
  if (monthFirst?.[1] !== undefined && monthFirst[2] !== undefined && monthFirst[3] !== undefined) {
    return fromParts(monthFirst[1], monthFirst[2], monthFirst[3]);
  }
  const dayFirst = DAY_FIRST.exec(trimmed);
  if (dayFirst?.[1] !== undefined && dayFirst[2] !== undefined && dayFirst[3] !== undefined) {
    return fromParts(dayFirst[2], dayFirst[1], dayFirst[3]);
  }
  return null;
}

import { pilotArea } from "./content/pilot";

/** Today's date (YYYY-MM-DD) and weekday in the pilot area's time zone. */
export function localToday(now = new Date()): { date: string; weekday: string } {
  const tz = pilotArea().timezone;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
  return { date, weekday };
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Turn a clock time from JustServe into a UTC timestamp.
 * Values that already have an offset are used as-is. Values with no offset are Utah wall-clock
 * times (the site labels them "Mountain Standard Time" even during daylight saving).
 * Year 0001 placeholders, which JustServe uses for "no date", become null.
 */
export function zonedWallTimeToIso(value: string | null | undefined, timeZone = pilotArea().timezone): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v || v.startsWith("0001-")) return null;
  if (/[zZ]$/.test(v) || /[+-]\d{2}:?\d{2}$/.test(v)) {
    const normalized = v.replace(/(\.\d{3})\d+/, "$1");
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 1900) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] ?? 0);
  // What UTC instant has these clock numbers in `timeZone`?
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(utcGuess)).map((p) => [p.type, p.value]));
  const asZoned = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return new Date(utcGuess - (asZoned - utcGuess)).toISOString();
}

/** Next occurrence (today counts) of a weekday name. */
export function nextWeekday(isoToday: string, name: string): string {
  const target = WEEKDAYS.indexOf(name.toLowerCase());
  const current = new Date(isoToday + "T12:00:00Z").getUTCDay();
  return addDays(isoToday, (target - current + 7) % 7);
}

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

/** Next occurrence (today counts) of a weekday name. */
export function nextWeekday(isoToday: string, name: string): string {
  const target = WEEKDAYS.indexOf(name.toLowerCase());
  const current = new Date(isoToday + "T12:00:00Z").getUTCDay();
  return addDays(isoToday, (target - current + 7) % 7);
}

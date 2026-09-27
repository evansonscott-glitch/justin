import { pilotArea } from "../content/pilot";
import { zonedWallTimeToIso } from "../dates";
import type { ReaderProject } from "./types";

/** A place on a JustServe listing. Latitude/longitude of 0 means "not set". */
interface Place {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal?: string | null;
  county?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface Slot {
  start?: string | null;
  end?: string | null;
  startFormatted?: string | null;
  endFormatted?: string | null;
  volunteersCapped?: boolean;
  totalVolunteersNeeded?: number | null;
  existingVolunteers?: number | null;
  groupLimit?: number | null;
  sunday?: boolean;
  monday?: boolean;
  tuesday?: boolean;
  wednesday?: boolean;
  thursday?: boolean;
  friday?: boolean;
  saturday?: boolean;
}

/** Search-card shape from POST /api/v2/projects/search. */
export interface SearchCard {
  id: string;
  statusId?: number;
  title?: string | null;
  shortDescription?: string | null;
  organizationName?: string | null;
  indoors?: boolean;
  suitableAllAges?: boolean;
  groupProjects?: boolean;
  totalNextOpportunities?: number;
  nextOpportunity?: { start?: string | null; end?: string | null } | null;
  location?: Place | null;
}

/** Detail shape from POST /api/v1/projects/{id}/en-us. Only the fields we keep. */
export interface ProjectDetail {
  id?: string;
  title?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  isActive?: boolean;
  archivedProject?: boolean;
  deleted?: boolean;
  isUnlistedProject?: boolean;
  indoors?: boolean;
  suitableAllAges?: boolean;
  groupProject?: boolean;
  organization?: { name?: string | null } | null;
  projectOwnerLocation?: Place | null;
  recurring?: {
    end?: string | null;
    location?: Place | null;
    recurringTimes?: Slot[] | null;
  } | null;
  onGoing?: { start?: string | null; end?: string | null; schedule?: string | null; location?: Place | null }[] | null;
  dtl?: { location?: Place | null; timeSlots?: Slot[] | null }[] | null;
}

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function clean(value: string | null | undefined): string | null {
  const s = value?.trim();
  return s ? s : null;
}

/** JustServe uses 0,0 when a listing has no map point. That is not a real place. */
export function realPoint(place: Place | null | undefined): { lat: number; lng: number } | null {
  const lat = place?.latitude;
  const lng = place?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return null;
  return { lat, lng };
}

function placeUseful(place: Place | null | undefined): boolean {
  if (!place) return false;
  return Boolean(clean(place.address) || clean(place.city) || realPoint(place));
}

function pickPlace(detail: ProjectDetail | null, card: SearchCard): { place: Place | null; source: string } {
  const blocks: { place: Place | null | undefined; source: string }[] = [];
  for (const block of detail?.dtl ?? []) blocks.push({ place: block.location, source: "shift" });
  for (const block of detail?.onGoing ?? []) blocks.push({ place: block.location, source: "ongoing" });
  if (detail?.recurring) blocks.push({ place: detail.recurring.location, source: "recurring" });
  blocks.push({ place: card.location, source: "search" });
  // The organizer's area is a last resort. It is sometimes a different city than the shift.
  blocks.push({ place: detail?.projectOwnerLocation, source: "owner-area" });
  const hit = blocks.find((b) => placeUseful(b.place));
  return { place: hit?.place ?? null, source: hit?.source ?? "none" };
}

function positive(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function slotWhen(slot: Slot): { start: string | null; end: string | null } {
  // startFormatted is a real UTC timestamp. The plain start field is Utah wall-clock time.
  const start = zonedWallTimeToIso(slot.startFormatted) ?? zonedWallTimeToIso(slot.start);
  const end = zonedWallTimeToIso(slot.endFormatted) ?? zonedWallTimeToIso(slot.end);
  return { start, end };
}

function daysOf(slot: Slot): string[] {
  return DAY_KEYS.filter((d) => slot[d]);
}

function clockLabel(start: string | null | undefined, end: string | null | undefined): string | null {
  const fmt = (value: string | null | undefined) => {
    const m = value?.match(/T(\d{2}):(\d{2})/);
    if (!m) return null;
    let h = Number(m[1]);
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m[2]} ${ap}`;
  };
  const a = fmt(start);
  const b = fmt(end);
  if (!a) return null;
  return b ? `${a}–${b}` : a;
}

function capOf(slot: Slot | undefined): { capacity: number | null; spotsLeft: number | null; groupLimit: number | null } {
  if (!slot) return { capacity: null, spotsLeft: null, groupLimit: null };
  // 0 means "not capped", not "nobody can come".
  const capacity = slot.volunteersCapped ? positive(slot.totalVolunteersNeeded) : null;
  const signedUp = typeof slot.existingVolunteers === "number" ? slot.existingVolunteers : null;
  const spotsLeft = capacity != null && signedUp != null ? Math.max(0, capacity - signedUp) : null;
  const groupLimit = positive(slot.groupLimit);
  return { capacity, spotsLeft, groupLimit };
}

function future(iso: string | null, now: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= now - 60 * 60 * 1000;
}

interface Schedule {
  recurring: boolean;
  startsAt: string | null;
  endsAt: string | null;
  capacity: number | null;
  spotsLeft: number | null;
  note: string | null;
}

function scheduleFrom(detail: ProjectDetail | null, card: SearchCard, now = Date.now()): Schedule {
  const dated: { start: string | null; end: string | null; slot: Slot }[] = [];
  for (const block of detail?.dtl ?? []) {
    for (const slot of block.timeSlots ?? []) dated.push({ ...slotWhen(slot), slot });
  }
  const upcoming = dated.filter((s) => future(s.end ?? s.start, now)).sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
  const recurringTimes = detail?.recurring?.recurringTimes ?? [];
  const ongoing = detail?.onGoing ?? [];
  // Several dated shifts are not the same thing as a weekly repeat. Only the repeating
  // structures (or, if we never opened the project page, "more than one upcoming time") count.
  const recurring =
    Boolean(detail?.recurring) || ongoing.length > 0 || (!detail && (card.totalNextOpportunities ?? 0) > 1);

  let startsAt: string | null = null;
  let endsAt: string | null = null;
  let capSlot: Slot | undefined;

  if (upcoming.length) {
    startsAt = upcoming[0].start;
    endsAt = upcoming[upcoming.length - 1].end ?? upcoming[0].end;
    capSlot = upcoming[0].slot;
  } else if (recurringTimes.length) {
    startsAt = zonedWallTimeToIso(card.nextOpportunity?.start);
    endsAt = zonedWallTimeToIso(card.nextOpportunity?.end);
    const seriesEnd = zonedWallTimeToIso(detail?.recurring?.end);
    // Keep the project visible until the series ends, not just until the next shift.
    if (seriesEnd) endsAt = seriesEnd;
    capSlot = recurringTimes[0];
  } else if (ongoing.length) {
    startsAt = zonedWallTimeToIso(ongoing[0].start);
    endsAt = zonedWallTimeToIso(ongoing[0].end);
    capSlot = undefined;
  } else {
    startsAt = zonedWallTimeToIso(card.nextOpportunity?.start);
    endsAt = zonedWallTimeToIso(card.nextOpportunity?.end);
  }

  const cap = capOf(capSlot);
  const days = [...new Set(recurringTimes.flatMap(daysOf))];
  const clock = clockLabel(recurringTimes[0]?.start ?? recurringTimes[0]?.end, recurringTimes[0]?.end);
  const bits: string[] = [];
  if (days.length) bits.push(days.map((d) => d[0].toUpperCase() + d.slice(1) + "s").join(", "));
  if (clock) bits.push(clock);
  if (ongoing[0]?.schedule) bits.push(htmlToText(ongoing[0].schedule));
  if (cap.capacity) bits.push(`up to ${cap.capacity} volunteers`);
  if (cap.groupLimit && cap.groupLimit !== cap.capacity) bits.push(`groups limited to ${cap.groupLimit}`);
  const note = bits.length ? `When: ${bits.join("; ")}.` : null;

  return { recurring: recurring || recurringTimes.length > 0, startsAt, endsAt, ...cap, note };
}

/** Map one public listing into a database row. Returns null when the listing is not public. */
export function toReaderProject(card: SearchCard, detail: ProjectDetail | null): ReaderProject | null {
  if (card.statusId != null && card.statusId !== 1) return null;
  if (detail && (detail.archivedProject || detail.deleted || detail.isUnlistedProject || detail.isActive === false)) return null;

  const { place, source } = pickPlace(detail, card);
  const point = realPoint(place);
  const city = clean(place?.city);
  const snapped = point ? null : citySnap(city);
  const schedule = scheduleFrom(detail, card);
  const longText = htmlToText(detail?.longDescription);
  const shortText = htmlToText(detail?.shortDescription) || htmlToText(card.shortDescription);
  let description = longText || shortText || null;
  if (schedule.note && description && !description.includes(schedule.note)) description = `${description}\n\n${schedule.note}`;
  else if (schedule.note && !description) description = schedule.note;

  const street = clean(place?.address);
  const precision = street ? "street" : point ? "map" : city ? "city" : "none";

  return {
    id: card.id,
    url: `https://www.justserve.org/projects/${card.id}`,
    title: clean(detail?.title) ?? clean(card.title),
    orgName: clean(detail?.organization?.name) ?? clean(card.organizationName),
    description,
    address: street,
    city,
    lat: point?.lat ?? snapped?.lat ?? null,
    lng: point?.lng ?? snapped?.lng ?? null,
    startsAt: schedule.startsAt,
    endsAt: schedule.endsAt,
    recurring: schedule.recurring,
    capacity: schedule.capacity,
    spotsLeft: schedule.spotsLeft,
    // Coordinator names, phones, emails, and volunteer account ids are left out on purpose.
    raw: {
      precision,
      placeSource: source,
      indoors: detail?.indoors ?? card.indoors ?? null,
      suitableAllAges: detail?.suitableAllAges ?? card.suitableAllAges ?? null,
      groupProject: detail?.groupProject ?? card.groupProjects ?? null,
      county: clean(place?.county),
      state: clean(place?.state),
      postal: clean(place?.postal),
      cityApproximate: Boolean(snapped),
    },
  };
}

function citySnap(city: string | null): { lat: number; lng: number } | null {
  if (!city) return null;
  const hit = pilotArea().cities.find((c) => c.name.toLowerCase() === city.toLowerCase());
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const AGE_RE = /\b(ages?\s*\d+|\d+\s*\+|must be \d+|adults only|all ages|under \d+|\d+\s*years? old)\b/i;

export interface CorpusStats {
  projects: number;
  title: number;
  description: number;
  city: number;
  street: number;
  mapPoint: number;
  cityApproximate: number;
  startTime: number;
  recurring: number;
  capacity: number;
  ageMentioned: number;
}

/** Counts which facts a batch of listings actually has. Used by the spike report and the probe. */
export function corpusStats(projects: ReaderProject[]): CorpusStats {
  const n = (pred: (p: ReaderProject) => boolean) => projects.filter(pred).length;
  return {
    projects: projects.length,
    title: n((p) => Boolean(p.title)),
    description: n((p) => (p.description?.length ?? 0) >= 40),
    city: n((p) => Boolean(p.city)),
    street: n((p) => Boolean(p.address)),
    mapPoint: n((p) => p.lat != null && !(p.raw as { cityApproximate?: boolean })?.cityApproximate),
    cityApproximate: n((p) => Boolean((p.raw as { cityApproximate?: boolean })?.cityApproximate)),
    startTime: n((p) => Boolean(p.startsAt)),
    recurring: n((p) => Boolean(p.recurring)),
    capacity: n((p) => p.capacity != null),
    ageMentioned: n((p) => AGE_RE.test(p.description ?? "")),
  };
}

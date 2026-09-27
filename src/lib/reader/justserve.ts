import { pilotArea } from "../content/pilot";
import type { ProjectSource, ReaderProject } from "./types";
import { corpusStats, milesBetween, toReaderProject, type ProjectDetail, type SearchCard } from "./map";

export const CRAWL_USER_AGENT =
  process.env.CRAWL_USER_AGENT || "JustinPilot/0.1 (Utah Area JustServe pilot; unofficial; read-only)";

/** Minimum gap between requests to JustServe.org (brief §1: at most 1 request/second). */
export const MIN_REQUEST_GAP_MS = 1100;

const SEARCH_URL = "https://www.justserve.org/api/v2/projects/search";

let lastRequest = 0;
/** Polite fetch: waits so requests are at least MIN_REQUEST_GAP_MS apart, and identifies itself. */
export async function politeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const wait = lastRequest + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const extra = init.headers;
  const headers: Record<string, string> = { "user-agent": CRAWL_USER_AGENT, accept: "application/json" };
  if (extra && typeof extra === "object" && !Array.isArray(extra) && !(extra instanceof Headers)) {
    Object.assign(headers, extra);
  }
  return fetch(url, { ...init, headers });
}

interface SearchResponse {
  items?: SearchCard[];
  pageCount?: number;
  itemCount?: number;
  searchLatitude?: number;
  searchLongitude?: number;
}

export interface ReadOptions {
  /** Stop after this many search pages. Omit to read every page. */
  maxPages?: number;
  /** How many listings to open for the full description and street address. Omit to open all. */
  maxDetails?: number;
  pageSize?: number;
}

/** The public site searches by a city name. Use the pilot city closest to the configured center. */
export function pilotSearchLocation(): string {
  const area = pilotArea();
  if (!area.cities.length) throw new Error("inputs/pilot_area.json has no cities");
  const city = area.cities.reduce((best, c) => {
    const score = (c.lat - area.center.lat) ** 2 + (c.lng - area.center.lng) ** 2;
    const bestScore = (best.lat - area.center.lat) ** 2 + (best.lng - area.center.lng) ** 2;
    return score < bestScore ? c : best;
  });
  return `${city.name}, UT`;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    const res = await politeFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      last = `${res.status} ${url}`;
      continue;
    }
    if (!res.ok) throw new Error(`JustServe returned ${res.status} for ${url}`);
    return (await res.json()) as T;
  }
  throw new Error(`JustServe kept failing (${last})`);
}

/**
 * Read public projects the same way the JustServe website does.
 *
 * The site's terms of use forbid robots and forbid copying listings onto another site without
 * written permission. Do not run a full refresh until that permission is in hand. See docs/data-spike.md.
 */
export async function readPilot(opts: ReadOptions = {}): Promise<ReaderProject[]> {
  const area = pilotArea();
  const location = pilotSearchLocation();
  const pageSize = opts.pageSize ?? 100;
  const cards: SearchCard[] = [];
  const seen = new Set<string>();
  let pageCount = 1;
  let origin = { lat: area.center.lat, lng: area.center.lng };

  for (let page = 0; page < pageCount && page < (opts.maxPages ?? 30); page++) {
    const data = await postJson<SearchResponse>(SEARCH_URL, {
      page,
      size: pageSize,
      radius: area.radius_miles,
      location,
      volunteerFromAnywhere: false,
      includeOrgInfo: true,
      publishedOnly: false,
      language: "en-us",
      browserLocale: "en-us",
      radiusType: 1,
      timesOfDay: [],
      includeFilledProjects: false,
      disasterRecoveryProjectsOnly: false,
    });
    if (page === 0) {
      pageCount = data.pageCount ?? 1;
      if (data.searchLatitude != null && data.searchLongitude != null) {
        origin = { lat: data.searchLatitude, lng: data.searchLongitude };
      }
      console.log(`JustServe search "${location}" within ${area.radius_miles} miles: ${data.itemCount ?? "?"} projects, ${pageCount} pages`);
    }
    for (const item of data.items ?? []) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      cards.push(item);
    }
    if (!data.items?.length) break;
  }

  if (!cards.length) throw new Error("JustServe search returned no projects; refusing to refresh.");

  const detailLimit = opts.maxDetails ?? cards.length;
  const projects: ReaderProject[] = [];
  let droppedFar = 0;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    let detail: ProjectDetail | null = null;
    if (i < detailLimit) {
      try {
        detail = await postJson<ProjectDetail>(`https://www.justserve.org/api/v1/projects/${card.id}/en-us`, {
          latitude: String(origin.lat),
          longitude: String(origin.lng),
          lang: "en-us",
        });
      } catch (err) {
        console.error(`Detail failed for ${card.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
    const project = toReaderProject(card, detail);
    if (!project) continue;
    if (project.lat != null && project.lng != null && !(project.raw as { cityApproximate?: boolean }).cityApproximate) {
      if (milesBetween({ lat: project.lat, lng: project.lng }, area.center) > area.radius_miles + 2) {
        droppedFar++;
        continue;
      }
    }
    projects.push(project);
  }
  if (droppedFar) console.log(`Left out ${droppedFar} projects whose map point is outside the pilot radius.`);
  console.log("Listing facts:", JSON.stringify(corpusStats(projects)));
  return projects;
}

export const justServeSource: ProjectSource = {
  name: "justserve",
  fetchAll(): Promise<ReaderProject[]> {
    console.log("Reading public JustServe listings. Their terms of use require written permission before automated copying. See docs/data-spike.md.");
    return readPilot();
  },
};

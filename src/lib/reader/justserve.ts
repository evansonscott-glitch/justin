import type { ProjectSource, ReaderProject } from "./types";

export const CRAWL_USER_AGENT =
  process.env.CRAWL_USER_AGENT || "JustinPilot/0.1 (Utah Area JustServe pilot; unofficial; read-only)";

/** Minimum gap between requests to JustServe.org (brief §1: at most 1 request/second). */
export const MIN_REQUEST_GAP_MS = 1100;

let lastRequest = 0;
/** Polite fetch: waits so requests are at least MIN_REQUEST_GAP_MS apart, and identifies itself. */
export async function politeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const wait = lastRequest + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  return fetch(url, { ...init, headers: { "user-agent": CRAWL_USER_AGENT, ...(init.headers ?? {}) } });
}

/**
 * JustServe.org reader. Filled in after the Milestone 0 spike (docs/data-spike.md) documents how
 * public search results are loaded.
 */
export const justServeSource: ProjectSource = {
  name: "justserve",
  async fetchAll(): Promise<ReaderProject[]> {
    throw new Error("JustServe reader not implemented yet — waiting on the Milestone 0 data spike (docs/data-spike.md).");
  },
};

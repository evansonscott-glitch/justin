/** One project as read from a public JustServe.org page or response, normalized to our columns. */
export interface ReaderProject {
  id: string; // JustServe project id
  url: string; // live JustServe.org listing
  title: string | null;
  orgName: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  startsAt: string | null; // ISO timestamp
  endsAt: string | null;
  recurring: boolean | null;
  capacity: number | null;
  spotsLeft: number | null;
  raw: unknown; // original record, stored as-is
}

/**
 * Where projects come from. The JustServe implementation is written after the Milestone 0 spike
 * shows whether results come from a JSON endpoint or need a page crawl.
 */
export interface ProjectSource {
  name: string;
  /** Every public project in the pilot area. Must respect the crawl rules (≤1 req/s, descriptive UA). */
  fetchAll(): Promise<ReaderProject[]>;
}

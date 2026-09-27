/** A project as shown on a result card. Every card links to its live JustServe.org listing. */
export interface ProjectCard {
  id: string;
  url: string;
  title: string;
  orgName: string | null;
  city: string | null;
  startsAt: string | null;
  endsAt: string | null;
  recurring: boolean | null;
  summary: string | null;
  distanceMiles: number | null;
  tags: {
    minAge: number | null;
    familyFriendly: boolean | null;
    setting: string | null;
    groupMax: number | null;
    categories: string[];
  };
  isSample: boolean;
}

/** Structured form of a free-text search (brief §6 step 1). */
export interface ParsedQuery {
  location: string | null;
  date_from: string | null; // YYYY-MM-DD
  date_to: string | null; // YYYY-MM-DD
  min_age_needed: number | null; // youngest person who will attend
  group_size: number | null;
  setting: "indoor" | "outdoor" | null;
  categories: string[];
  free_text: string;
}

export interface SearchRequest {
  q?: string;
  lat?: number;
  lng?: number;
  dateFrom?: string;
  dateTo?: string;
  tags?: string[]; // quick-filter chips: kids_ok, indoor, outdoor, family, or a category
  groupSize?: number;
  limit?: number;
  sessionId?: string;
  channel?: "finder" | "chat" | "eval";
  /** Set false to skip search_log (the eval harness does this). */
  log?: boolean;
}

export interface SearchResult {
  parsed: ParsedQuery;
  radiusMiles: number;
  projects: ProjectCard[];
  /** The query named a kind of service and none of the results match it (they're just nearby/soon). */
  noTopicMatch: boolean;
}

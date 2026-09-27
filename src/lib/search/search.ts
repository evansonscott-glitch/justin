import ranking from "../../../config/ranking.json";
import { db } from "../db";
import { findCity, pilotArea } from "../content/pilot";
import type { ParsedQuery, ProjectCard, SearchRequest, SearchResult } from "../types";
import { addDays, localToday, nextWeekday } from "../dates";
import { parseQuery } from "./parse";

/** Quick-filter chips that aren't categories. */
const CONTROL_CHIPS = new Set(["kids_ok", "family", "indoor", "outdoor", "this_week"]);

const METERS_PER_MILE = 1609.344;

interface Row {
  id: string;
  url: string;
  title: string | null;
  org_name: string | null;
  city: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
  recurring: boolean | null;
  source: string;
  summary: string | null;
  min_age: number | null;
  family_friendly: boolean | null;
  setting: string | null;
  group_max: number | null;
  categories: string[] | null;
  text_rank: number;
  distance_m: number | null;
  days_from_target: number | null;
}

/** Words from the free-text part of the query, OR-ed into a tsquery. */
function toTsQuery(text: string): string | null {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return words.length ? words.join(" | ") : null;
}

/**
 * Brief §6: hard filters (active, date overlap, radius, group capacity, min age), then a weighted
 * score over text match, distance, date closeness, and tag matches. Weights live in config/ranking.json.
 */
export async function searchProjects(req: SearchRequest): Promise<SearchResult> {
  const parsed: ParsedQuery = await parseQuery(req.q ?? "");
  const chips = new Set(req.tags ?? []);
  let dateFrom = req.dateFrom ?? parsed.date_from;
  let dateTo = req.dateTo ?? parsed.date_to ?? dateFrom;
  if (chips.has("this_week") && !req.dateFrom) {
    const today = localToday().date;
    dateFrom = today;
    dateTo = nextWeekday(addDays(today, 1), "sunday");
  }
  const groupSize = req.groupSize ?? parsed.group_size;
  const setting = chips.has("indoor") ? "indoor" : chips.has("outdoor") ? "outdoor" : parsed.setting;
  const categories = [...new Set([...parsed.categories, ...[...chips].filter((t) => !CONTROL_CHIPS.has(t))])];

  let center: { lat: number; lng: number } | null = null;
  if (req.lat != null && req.lng != null) center = { lat: req.lat, lng: req.lng };
  else {
    const city = findCity(parsed.location);
    if (city) center = { lat: city.lat, lng: city.lng };
  }

  const limit = req.limit ?? (req.channel === "chat" ? ranking.chat_result_limit : ranking.finder_result_limit);
  const tsq = toTsQuery([parsed.free_text, ...categories].join(" "));

  const run = async (radiusMiles: number) => {
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const tz = p(pilotArea().timezone);
    const where: string[] = ["p.status = 'active'"];

    if (dateFrom) {
      where.push(`(p.starts_at is null or p.recurring or (p.starts_at at time zone ${tz})::date <= ${p(dateTo)}::date)`);
      where.push(`(p.ends_at is null or (p.ends_at at time zone ${tz})::date >= ${p(dateFrom)}::date)`);
    } else {
      where.push(`(p.ends_at is null or p.ends_at >= now())`);
    }

    let distanceExpr = "null::float";
    if (center) {
      const point = `ST_SetSRID(ST_MakePoint(${p(center.lng)}, ${p(center.lat)}), 4326)::geography`;
      distanceExpr = `ST_Distance(p.geo, ${point})`;
      where.push(`p.geo is not null and ST_DWithin(p.geo, ${point}, ${p(radiusMiles * METERS_PER_MILE)})`);
    }
    if (groupSize) {
      where.push(`coalesce(t.group_max, p.spots_left, p.capacity) is null or coalesce(t.group_max, p.spots_left, p.capacity) >= ${p(groupSize)}`);
    }
    if (parsed.min_age_needed != null) {
      where.push(`(t.min_age is null or t.min_age <= ${p(parsed.min_age_needed)})`);
    }
    if (chips.has("kids_ok") || chips.has("family")) {
      where.push(`(t.family_friendly is true or t.min_age <= 12)`);
    }
    if (setting) {
      where.push(`t.setting in (${p(setting)}, 'both')`);
    }

    const textRank = tsq
      ? `ts_rank(to_tsvector('english', coalesce(p.title,'') || ' ' || coalesce(p.org_name,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(t.summary,'') || ' ' || array_to_string(coalesce(t.categories, '{}'), ' ')), to_tsquery('english', ${p(tsq)}))`
      : "0";
    const target = dateFrom ? `${p(dateFrom)}::date` : `(now() at time zone ${tz})::date`;

    const sql = `
      select p.id, p.url, p.title, p.org_name, p.city, p.starts_at, p.ends_at, p.recurring, p.source,
             t.summary, t.min_age, t.family_friendly, t.setting, t.group_max, t.categories,
             ${textRank} as text_rank,
             ${distanceExpr} as distance_m,
             case when p.starts_at is null or p.recurring then null
                  else abs((p.starts_at at time zone ${tz})::date - ${target}) end as days_from_target
      from projects p
      left join project_tags t on t.project_id = p.id
      where ${where.map((w) => `(${w})`).join(" and ")}
      limit 500`;
    const { rows } = await db().query<Row>(sql, params);
    return rows;
  };

  let radiusMiles = ranking.default_radius_miles;
  let rows = await run(radiusMiles);
  if (center && rows.length < ranking.min_results_before_widening) {
    radiusMiles = ranking.widened_radius_miles;
    rows = await run(radiusMiles);
  }

  const w = ranking.weights;
  const maxRank = Math.max(0, ...rows.map((r) => Number(r.text_rank)));
  const scored = rows.map((r) => {
    const text = maxRank > 0 ? Number(r.text_rank) / maxRank : 0;
    const distance = r.distance_m != null ? Math.max(0, 1 - r.distance_m / (radiusMiles * METERS_PER_MILE)) : 0.5;
    const date = r.days_from_target != null ? 1 / (1 + Number(r.days_from_target)) : 0.5;
    let tagHits = 0;
    let tagWanted = 0;
    for (const c of categories) {
      tagWanted++;
      if (r.categories?.includes(c)) tagHits++;
    }
    if (setting) {
      tagWanted++;
      if (r.setting === setting || r.setting === "both") tagHits++;
    }
    const tag = tagWanted ? tagHits / tagWanted : 0;
    return { r, score: w.text_match * text + w.distance * distance + w.date_closeness * date + w.tag_match * tag };
  });
  scored.sort((a, b) => b.score - a.score);

  const projects = scored.slice(0, limit).map(({ r }) => toCard(r));
  await logSearch(req, parsed, projects.map((x) => x.id));
  return { parsed, radiusMiles, projects };
}

function toCard(r: Row): ProjectCard {
  return {
    id: r.id,
    url: r.url,
    title: r.title ?? "Untitled project",
    orgName: r.org_name,
    city: r.city,
    startsAt: r.starts_at ? r.starts_at.toISOString() : null,
    endsAt: r.ends_at ? r.ends_at.toISOString() : null,
    recurring: r.recurring,
    summary: r.summary,
    distanceMiles: r.distance_m != null ? Math.round((r.distance_m / METERS_PER_MILE) * 10) / 10 : null,
    tags: {
      minAge: r.min_age,
      familyFriendly: r.family_friendly,
      setting: r.setting,
      groupMax: r.group_max,
      categories: r.categories ?? [],
    },
    isSample: r.source === "sample",
  };
}

async function logSearch(req: SearchRequest, parsed: ParsedQuery, ids: string[]) {
  try {
    await db().query(
      `insert into search_log (session_id, query, parsed, result_ids, channel) values ($1, $2, $3, $4, $5)`,
      [req.sessionId ?? null, req.q ?? "", JSON.stringify({ ...parsed, chips: req.tags ?? [] }), ids, req.channel ?? "finder"],
    );
  } catch (err) {
    console.error("search_log insert failed", err);
  }
}

/** Full stored listing text for one project — the only source Justin may quote project facts from. */
export async function getProject(id: string) {
  const { rows } = await db().query(
    `select p.id, p.url, p.title, p.org_name, p.description, p.address, p.city, p.starts_at, p.ends_at,
            p.recurring, p.capacity, p.spots_left, p.status, p.source,
            t.min_age, t.family_friendly, t.setting, t.group_min, t.group_max, t.effort, t.time_of_day, t.categories
     from projects p left join project_tags t on t.project_id = p.id where p.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

import crypto from "node:crypto";
import { db } from "../db";
import type { ProjectSource, ReaderProject } from "./types";

/** Hash of the fields that matter for search and tagging. Unchanged hash → no re-tagging. */
export function contentHash(p: ReaderProject): string {
  const basis = [p.title, p.orgName, p.description, p.address, p.city, p.startsAt, p.endsAt, p.recurring, p.capacity]
    .map((v) => (v == null ? "" : String(v)))
    .join("␟");
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

export interface RefreshStats {
  fetched: number;
  inserted: number;
  updated: number;
  deactivated: number;
}

/**
 * Upserts a full refresh keyed on the JustServe project id (Milestone 1). Projects missing from the
 * refresh, or whose end date has passed, become inactive. Rows are never deleted, so history
 * stays available for the health report.
 */
export async function applyRefresh(projects: ReaderProject[]): Promise<RefreshStats> {
  const client = await db().connect();
  const stats: RefreshStats = { fetched: projects.length, inserted: 0, updated: 0, deactivated: 0 };
  try {
    await client.query("begin");
    // Real data replaces the made-up samples the first time the reader succeeds.
    if (projects.length > 0) await client.query(`delete from projects where source = 'sample'`);

    for (const p of projects) {
      const hash = contentHash(p);
      const { rows } = await client.query<{ inserted: boolean }>(
        `insert into projects (id, url, title, org_name, description, address, city, geo, starts_at, ends_at,
                               recurring, capacity, spots_left, raw, content_hash, status, source, first_seen, last_seen)
         values ($1, $2, $3, $4, $5, $6, $7,
                 case when $8::float is null or $9::float is null then null
                      else ST_SetSRID(ST_MakePoint($9, $8), 4326)::geography end,
                 $10, $11, $12, $13, $14, $15, $16, 'active', 'justserve', now(), now())
         on conflict (id) do update set
           url = excluded.url, title = excluded.title, org_name = excluded.org_name,
           description = excluded.description, address = excluded.address, city = excluded.city,
           geo = excluded.geo, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
           recurring = excluded.recurring, capacity = excluded.capacity, spots_left = excluded.spots_left,
           raw = excluded.raw, content_hash = excluded.content_hash, status = 'active', last_seen = now()
         returning (xmax = 0) as inserted`,
        [p.id, p.url, p.title, p.orgName, p.description, p.address, p.city, p.lat, p.lng, p.startsAt, p.endsAt,
         p.recurring, p.capacity, p.spotsLeft, JSON.stringify(p.raw ?? null), hash],
      );
      if (rows[0]?.inserted) stats.inserted++;
      else stats.updated++;
    }

    const ids = projects.map((p) => p.id);
    const gone = await client.query(
      `update projects set status = 'inactive'
       where source = 'justserve' and status = 'active' and not (id = any($1::text[]))`,
      [ids],
    );
    const ended = await client.query(
      `update projects set status = 'inactive'
       where source = 'justserve' and status = 'active' and ends_at is not null and ends_at < now()`,
    );
    stats.deactivated = (gone.rowCount ?? 0) + (ended.rowCount ?? 0);
    await client.query("commit");
    return stats;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Runs one full refresh from a source and records it in reader_runs. */
export async function refreshFrom(source: ProjectSource): Promise<RefreshStats> {
  const { rows } = await db().query<{ id: number }>(`insert into reader_runs (source) values ($1) returning id`, [source.name]);
  const runId = rows[0].id;
  try {
    const projects = await source.fetchAll();
    const stats = await applyRefresh(projects);
    await db().query(
      `update reader_runs set finished_at = now(), fetched = $2, inserted = $3, updated = $4, deactivated = $5 where id = $1`,
      [runId, stats.fetched, stats.inserted, stats.updated, stats.deactivated],
    );
    return stats;
  } catch (err) {
    await db().query(`update reader_runs set finished_at = now(), error = $2 where id = $1`, [
      runId,
      err instanceof Error ? err.message : String(err),
    ]);
    throw err;
  }
}

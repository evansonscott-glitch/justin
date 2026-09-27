import { db } from "../db";

export type FlagKind = "ended_still_live" | "likely_duplicate" | "missing_time" | "missing_address" | "missing_description";

interface Flag {
  project_id: string;
  kind: FlagKind;
  detail: string;
  city: string | null;
}

/** A project counts as "still live" on JustServe.org if the most recent refresh saw it. */
const STILL_LIVE = `p.last_seen >= (select max(last_seen) from projects x where x.source = p.source) - interval '30 minutes'`;

const QUERIES: Record<FlagKind, string> = {
  ended_still_live: `
    select p.id as project_id, p.city,
           'Ended ' || to_char(p.ends_at at time zone 'America/Denver', 'Mon DD') || ' but still listed' as detail
    from projects p
    where p.ends_at < now() and ${STILL_LIVE}`,
  likely_duplicate: `
    select b.id as project_id, b.city,
           'Looks like a duplicate of ' || a.id || ' (' || coalesce(a.title, '') || ')' as detail
    from projects a
    join projects b
      on a.id < b.id
     and lower(a.org_name) = lower(b.org_name)
     and similarity(lower(a.title), lower(b.title)) > 0.6
     and (a.starts_at is null or b.starts_at is null or abs(extract(epoch from a.starts_at - b.starts_at)) <= 7 * 86400)
    where a.status = 'active' and b.status = 'active'`,
  missing_time: `
    select p.id as project_id, p.city, 'No date or time listed' as detail
    from projects p
    where p.status = 'active' and p.starts_at is null and coalesce(p.recurring, false) = false`,
  missing_address: `
    select p.id as project_id, p.city, 'No address listed' as detail
    from projects p
    where p.status = 'active' and nullif(trim(p.address), '') is null and p.geo is null`,
  missing_description: `
    select p.id as project_id, p.city, 'Description missing or very short' as detail
    from projects p
    where p.status = 'active' and length(coalesce(trim(p.description), '')) < 40`,
};

/**
 * Nightly listing-health pass (Milestone 5). Opens a flag for each new problem and resolves flags
 * whose problem has gone away, so the admin page always shows the current list, grouped by city.
 */
export async function runHealthReport() {
  const found: Flag[] = [];
  for (const [kind, sql] of Object.entries(QUERIES) as [FlagKind, string][]) {
    const { rows } = await db().query<Omit<Flag, "kind">>(sql);
    for (const r of rows) found.push({ ...r, kind });
  }

  const { rows: open } = await db().query<{ id: number; project_id: string; kind: string }>(
    `select id, project_id, kind from health_flags where resolved_at is null`,
  );
  const key = (projectId: string, kind: string) => `${projectId}␟${kind}`;
  const openKeys = new Map(open.map((f) => [key(f.project_id, f.kind), f.id]));
  const foundKeys = new Set(found.map((f) => key(f.project_id, f.kind)));

  let opened = 0;
  for (const f of found) {
    if (openKeys.has(key(f.project_id, f.kind))) continue;
    await db().query(`insert into health_flags (project_id, kind, detail, city) values ($1, $2, $3, $4)`, [
      f.project_id,
      f.kind,
      f.detail,
      f.city,
    ]);
    opened++;
  }
  const toResolve = open.filter((f) => !foundKeys.has(key(f.project_id, f.kind))).map((f) => f.id);
  if (toResolve.length) {
    await db().query(`update health_flags set resolved_at = now() where id = any($1::bigint[])`, [toResolve]);
  }

  const byKind: Record<string, number> = {};
  for (const f of found) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  return { open: found.length, opened, resolved: toResolve.length, byKind };
}

/** Brief §1: chat messages are kept for 90 days, then deleted. */
export async function purgeOldChats() {
  const { rowCount } = await db().query(`delete from chat_messages where created_at < now() - interval '90 days'`);
  return { deletedMessages: rowCount ?? 0 };
}

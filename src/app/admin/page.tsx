import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdminToken } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Justin admin", robots: { index: false, follow: false } };

const TZ = "America/Denver";
const fmt = (d: Date | string | null) =>
  d ? new Date(d).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);

const FLAG_LABELS: Record<string, string> = {
  ended_still_live: "Ended but still live",
  likely_duplicate: "Likely duplicate",
  missing_time: "Missing time",
  missing_address: "Missing address",
  missing_description: "Missing description",
};

function Login({ error, configured }: { error: boolean; configured: boolean }) {
  return (
    <div>
      <h1 style={{ fontSize: 24 }}>Admin</h1>
      {!configured ? (
        <p className="meta">ADMIN_PASSWORD isn&apos;t set, so the admin page is locked.</p>
      ) : (
        <form method="post" action="/api/admin/login" className="search-row">
          <input type="password" name="password" placeholder="Password" aria-label="Password" autoComplete="current-password" />
          <button className="btn" type="submit">
            Sign in
          </button>
        </form>
      )}
      {error && <p className="meta">That password didn&apos;t work.</p>}
    </div>
  );
}

interface EvalTarget {
  queries: number;
  labeled: number;
  top3HitRate: number | null;
  medianLatencyMs: number | null;
  errors: number;
  factIssueReplies: number;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const jar = await cookies();
  if (!isAdminToken(jar.get(ADMIN_COOKIE)?.value)) {
    const { error } = await searchParams;
    return <Login error={error === "1"} configured={Boolean(process.env.ADMIN_PASSWORD)} />;
  }

  const q = <T,>(sql: string, params: unknown[] = []) => db().query(sql, params).then((r) => r.rows as T[]);
  const [counts, lastRun, searchStats, unmet, recent, flags, evalRun] = await Promise.all([
    q<{ source: string; status: string; n: number }>(`select source, status, count(*)::int as n from projects group by 1, 2 order by 1, 2`),
    q<{ started_at: Date; finished_at: Date | null; fetched: number | null; error: string | null }>(
      `select started_at, finished_at, fetched, error from reader_runs order by started_at desc limit 1`,
    ),
    q<{ searches: number; unmet: number; chats: number }>(
      `select (select count(*)::int from search_log where created_at > now() - interval '7 days' and channel <> 'eval') as searches,
              (select count(*)::int from search_log where created_at > now() - interval '7 days' and channel <> 'eval'
                 and coalesce(unmet, cardinality(result_ids) = 0)) as unmet,
              (select count(distinct session_id)::int from chat_messages where created_at > now() - interval '7 days') as chats`,
    ),
    q<{ query: string; n: number; last: Date }>(
      `select lower(trim(query)) as query, count(*)::int as n, max(created_at) as last
       from search_log
       where coalesce(unmet, cardinality(result_ids) = 0) and trim(query) <> '' and channel <> 'eval' and created_at > now() - interval '30 days'
       group by 1 order by n desc, last desc limit 50`,
    ),
    q<{ created_at: Date; channel: string; query: string; n: number; unmet: boolean; clicked_id: string | null; chips: string[] | null }>(
      `select created_at, channel, query, cardinality(result_ids) as n, coalesce(unmet, cardinality(result_ids) = 0) as unmet, clicked_id,
              array(select jsonb_array_elements_text(coalesce(parsed->'chips', '[]'::jsonb))) as chips
       from search_log where channel <> 'eval' order by created_at desc limit 50`,
    ),
    q<{ city: string | null; kind: string; detail: string; project_id: string; url: string; title: string | null; created_at: Date }>(
      `select f.city, f.kind, f.detail, f.project_id, p.url, p.title, f.created_at
       from health_flags f join projects p on p.id = f.project_id
       where f.resolved_at is null order by f.city nulls last, f.kind, f.created_at`,
    ),
    q<{ created_at: Date; summary: { targets: Record<string, EvalTarget | null>; notes: string[]; sampleData: boolean }; report_md: string }>(
      `select created_at, summary, report_md from eval_runs order by created_at desc limit 1`,
    ),
  ]);

  const byCity = new Map<string, typeof flags>();
  for (const f of flags) {
    const city = f.city ?? "Unknown city";
    byCity.set(city, [...(byCity.get(city) ?? []), f]);
  }
  const stats = searchStats[0];
  const run = lastRun[0];
  const ev = evalRun[0];

  return (
    <div className="admin">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 24, margin: "4px 0" }}>Admin</h1>
        <form method="post" action="/api/admin/logout">
          <button className="chip" type="submit">
            Sign out
          </button>
        </form>
      </div>

      <section>
        <h2>Overview</h2>
        <ul className="stat-list">
          {counts.map((c) => (
            <li key={`${c.source}-${c.status}`}>
              <b>{c.n}</b> {c.status} {c.source === "sample" ? "sample (made-up)" : "JustServe.org"} projects
            </li>
          ))}
          <li>
            <b>{stats.searches}</b> searches in the last 7 days, <b>{stats.unmet}</b> unmet (no results or no match)
          </li>
          <li>
            <b>{stats.chats}</b> chat conversations in the last 7 days
          </li>
          <li>
            Last data refresh:{" "}
            {run ? (
              <>
                {fmt(run.started_at)} {run.error ? <span className="bad">failed: {run.error}</span> : `${run.fetched ?? 0} projects`}
              </>
            ) : (
              "never"
            )}
          </li>
        </ul>
      </section>

      <section>
        <h2>Unmet searches (30 days)</h2>
        {unmet.length === 0 ? (
          <p className="meta">None yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Query</th>
                <th>Times</th>
                <th>Last</th>
              </tr>
            </thead>
            <tbody>
              {unmet.map((u) => (
                <tr key={u.query}>
                  <td>{u.query}</td>
                  <td>{u.n}</td>
                  <td>{fmt(u.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Listing health</h2>
        {flags.length === 0 ? (
          <p className="meta">No open flags. The health report runs nightly.</p>
        ) : (
          [...byCity.entries()].map(([city, list]) => (
            <details key={city} open>
              <summary>
                {city} ({list.length})
              </summary>
              <ul className="flag-list">
                {list.map((f) => (
                  <li key={`${f.project_id}-${f.kind}`}>
                    <span className="fact">{FLAG_LABELS[f.kind] ?? f.kind}</span>{" "}
                    <a href={f.url} target="_blank" rel="noopener noreferrer">
                      {f.title ?? f.project_id}
                    </a>{" "}
                    <span className="meta">— {f.detail}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))
        )}
      </section>

      <section>
        <h2>Latest eval</h2>
        {!ev ? (
          <p className="meta">No eval runs yet. Run npm run eval.</p>
        ) : (
          <>
            <p className="meta">
              {fmt(ev.created_at)}
              {ev.summary.sampleData && " · ran against made-up sample data"}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Top-3 hit rate</th>
                  <th>Labeled</th>
                  <th>Median latency</th>
                  <th>Unverified facts</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["justserve", "JustServe.org search"],
                    ["finder", "Justin finder"],
                    ["chat", "Justin chat"],
                  ] as const
                ).map(([k, name]) => {
                  const t = ev.summary.targets[k];
                  return (
                    <tr key={k}>
                      <td>{name}</td>
                      <td>{t ? pct(t.top3HitRate) : "not run"}</td>
                      <td>{t ? `${t.labeled}/${t.queries}` : "—"}</td>
                      <td>{t?.medianLatencyMs != null ? `${t.medianLatencyMs} ms` : "—"}</td>
                      <td>{k === "chat" && t ? t.factIssueReplies : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {ev.summary.notes.map((n) => (
              <p className="meta" key={n}>
                {n}
              </p>
            ))}
            <details>
              <summary>Full report</summary>
              <pre className="report">{ev.report_md}</pre>
            </details>
          </>
        )}
      </section>

      <section>
        <h2>Recent searches</h2>
        {recent.length === 0 ? (
          <p className="meta">None yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Where</th>
                <th>Query</th>
                <th>Results</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={i}>
                  <td>{fmt(r.created_at)}</td>
                  <td>{r.channel}</td>
                  <td>
                    {r.query || <span className="meta">(filters only)</span>}
                    {r.chips?.length ? <span className="meta"> [{r.chips.join(", ")}]</span> : null}
                  </td>
                  <td className={r.unmet ? "bad" : ""}>
                    {r.n}
                    {r.unmet && r.n > 0 ? " (no match)" : ""}
                  </td>
                  <td>{r.clicked_id ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

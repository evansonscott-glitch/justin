/**
 * Eval harness (brief §9). Runs every query in inputs/test_queries.csv against:
 *   1. JustServe.org search — from evals/justserve_baseline.json, captured with the spike method
 *   2. the Justin finder
 *   3. the Justin chat (needs ANTHROPIC_API_KEY)
 * Reports top-3 hit rate, median latency, and chat replies with facts not found in tool output.
 * Writes evals/results-<date>.md and evals/results-latest.json (shown on the admin page).
 *
 *   npm run eval                 # all targets available
 *   npm run eval -- --no-chat    # skip the chat target (saves API spend)
 */
import "./env";
import fs from "node:fs";
import crypto from "node:crypto";
import { db } from "../src/lib/db";
import { parseCsv } from "../src/lib/content/specialists";
import { localToday } from "../src/lib/dates";
import { searchProjects } from "../src/lib/search/search";
import { runJustin } from "../src/lib/agent/justin";
import { hasAnthropicCredentials } from "../src/lib/anthropic";
import { checkFacts, type FactIssue } from "../src/lib/eval/factcheck";

interface Row {
  query: string;
  persona: string;
  good: string[];
  notes: string;
}

interface TargetResult {
  ids: string[];
  latencyMs: number;
  hit: boolean | null; // null = no labels for this query
  error?: string;
  reply?: string;
  factIssues?: FactIssue[];
}

type Baseline = Record<string, { result_ids: string[]; latency_ms?: number }>;

const rows: Row[] = parseCsv(fs.readFileSync("inputs/test_queries.csv", "utf8")).map((r) => ({
  query: r.query,
  persona: r.persona,
  good: (r.good_project_ids ?? "").split("|").map((s) => s.trim()).filter(Boolean),
  notes: r.notes ?? "",
}));

const runChat = !process.argv.includes("--no-chat") && hasAnthropicCredentials();
const baselinePath = "evals/justserve_baseline.json";
const baseline: Baseline | null = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : null;

const hit = (ids: string[], good: string[]) => (good.length ? ids.slice(0, 3).some((id) => good.includes(id)) : null);

const results: { row: Row; justserve?: TargetResult; finder: TargetResult; chat?: TargetResult }[] = [];

for (const row of rows) {
  const entry: (typeof results)[number] = { row, finder: { ids: [], latencyMs: 0, hit: null } };

  if (baseline?.[row.query]) {
    const b = baseline[row.query];
    entry.justserve = { ids: b.result_ids, latencyMs: b.latency_ms ?? NaN, hit: hit(b.result_ids, row.good) };
  }

  let t = performance.now();
  try {
    const r = await searchProjects({ q: row.query, limit: 10, channel: "eval", log: false });
    const ids = r.projects.map((p) => p.id);
    entry.finder = { ids, latencyMs: performance.now() - t, hit: hit(ids, row.good) };
  } catch (err) {
    entry.finder = { ids: [], latencyMs: performance.now() - t, hit: row.good.length ? false : null, error: String(err) };
  }

  if (runChat) {
    t = performance.now();
    try {
      const turn = await runJustin(`eval-${crypto.randomUUID()}`, [], row.query, { channel: "eval" });
      const ids = (turn.reply.cards ?? []).map((c) => c.id);
      entry.chat = {
        ids,
        latencyMs: performance.now() - t,
        hit: hit(ids, row.good),
        reply: turn.reply.text,
        factIssues: checkFacts(turn.reply.text, turn.toolOutputs),
      };
    } catch (err) {
      entry.chat = { ids: [], latencyMs: performance.now() - t, hit: row.good.length ? false : null, error: String(err) };
    }
  }
  results.push(entry);
  process.stdout.write(".");
}
process.stdout.write("\n");

function summarize(pick: (e: (typeof results)[number]) => TargetResult | undefined) {
  const rs = results.map(pick).filter((r): r is TargetResult => Boolean(r));
  if (!rs.length) return null;
  const labeled = rs.filter((r) => r.hit !== null);
  const hits = labeled.filter((r) => r.hit).length;
  const lat = rs.map((r) => r.latencyMs).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const median = lat.length ? lat[Math.floor((lat.length - 1) / 2)] : NaN;
  return {
    queries: rs.length,
    labeled: labeled.length,
    hits,
    top3HitRate: labeled.length ? hits / labeled.length : null,
    medianLatencyMs: Number.isFinite(median) ? Math.round(median) : null,
    errors: rs.filter((r) => r.error).length,
    factIssueReplies: rs.filter((r) => r.factIssues?.length).length,
  };
}

const date = localToday().date;
const summary = {
  date,
  sampleData: results.some((e) => e.finder.ids.some((id) => id.startsWith("sample-"))),
  targets: {
    justserve: summarize((e) => e.justserve),
    finder: summarize((e) => e.finder),
    chat: summarize((e) => e.chat),
  },
  notes: [
    baseline ? null : "JustServe.org baseline not captured yet (evals/justserve_baseline.json).",
    runChat ? null : "Chat target skipped (no ANTHROPIC_API_KEY or --no-chat).",
    rows.every((r) => !r.good.length) ? "No queries are labeled with good_project_ids yet, so hit rates can't be computed." : null,
  ].filter(Boolean),
};

const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const md: string[] = [
  `# Eval results — ${date}`,
  "",
  summary.sampleData ? "> ⚠️ Run against made-up SAMPLE projects, not real JustServe.org data.\n" : "",
  ...summary.notes.map((n) => `- ${n}`),
  "",
  "| Target | Queries | Labeled | Top-3 hit rate | Median latency | Errors | Replies with unverified facts |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...(["justserve", "finder", "chat"] as const).map((k) => {
    const s = summary.targets[k];
    const name = { justserve: "JustServe.org search", finder: "Justin finder", chat: "Justin chat" }[k];
    if (!s) return `| ${name} | not run | | | | | |`;
    return `| ${name} | ${s.queries} | ${s.labeled} | ${pct(s.top3HitRate)} | ${s.medianLatencyMs ?? "—"} ms | ${s.errors} | ${k === "chat" ? s.factIssueReplies : "n/a"} |`;
  }),
  "",
  "## Per query",
  "",
];
for (const e of results) {
  const mark = (r?: TargetResult) => (!r ? "—" : r.hit === null ? "unlabeled" : r.hit ? "✅ hit" : "❌ miss");
  md.push(`### ${e.row.query}`, "");
  md.push(`- Persona: ${e.row.persona || "—"}; good ids: ${e.row.good.join(", ") || "—"}`);
  md.push(`- JustServe.org: ${mark(e.justserve)}${e.justserve ? ` (${e.justserve.ids.slice(0, 3).join(", ")})` : ""}`);
  md.push(`- Finder: ${mark(e.finder)} (top 3: ${e.finder.ids.slice(0, 3).join(", ") || "none"})${e.finder.error ? ` — error: ${e.finder.error}` : ""}`);
  if (e.chat) {
    md.push(`- Chat: ${mark(e.chat)} (cards: ${e.chat.ids.join(", ") || "none"})${e.chat.error ? ` — error: ${e.chat.error}` : ""}`);
    if (e.chat.factIssues?.length) md.push(`- ⚠️ Unverified facts: ${e.chat.factIssues.map((f) => `${f.kind} "${f.text}"`).join("; ")}`);
    if (e.chat.reply) md.push("", "> " + e.chat.reply.replace(/\n/g, "\n> "));
  }
  md.push("");
}

fs.mkdirSync("evals", { recursive: true });
fs.writeFileSync(`evals/results-${date}.md`, md.join("\n"));
fs.writeFileSync("evals/results-latest.json", JSON.stringify({ summary, results }, null, 2));
// Also stored in the database so the admin page can show it wherever the app is deployed.
await db().query(`insert into eval_runs (summary, report_md) values ($1, $2)`, [JSON.stringify(summary), md.join("\n")]);
await db().end();
console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote evals/results-${date}.md`);

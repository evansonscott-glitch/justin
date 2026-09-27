/**
 * Milestone 2 acceptance: exports 25 random tagged projects to a CSV that Scott or Heather marks
 * right/wrong per tag. Target: at least 90% of tags right.
 *
 *   npm run tag:check-sheet            # writes evals/tag-check-<date>.csv
 */
import "./env";
import fs from "node:fs";
import { db } from "../src/lib/db";
import { localToday } from "../src/lib/dates";

const n = Number(process.argv.find((a) => a.startsWith("--n="))?.split("=")[1] ?? 25);
const { rows } = await db().query(
  `select p.id, p.url, p.title, t.min_age, t.family_friendly, t.setting, t.group_max, t.effort, t.time_of_day,
          t.weekday, t.weekend, array_to_string(t.categories, ' ') as categories, t.summary
   from project_tags t join projects p on p.id = t.project_id
   where p.source = 'justserve'
   order by random() limit $1`,
  [n],
);
await db().end();

const tagCols = ["min_age", "family_friendly", "setting", "group_max", "effort", "time_of_day", "weekday", "weekend", "categories", "summary"];
const header = ["id", "url", "title", ...tagCols.flatMap((c) => [c, `${c}_ok (y/n)`]), "notes"];
const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const lines = [header.join(",")];
for (const r of rows) {
  lines.push([r.id, r.url, r.title, ...tagCols.flatMap((c) => [r[c] ?? "null", ""]), ""].map(esc).join(","));
}
fs.mkdirSync("evals", { recursive: true });
const file = `evals/tag-check-${localToday().date}.csv`;
fs.writeFileSync(file, lines.join("\n") + "\n");
console.log(`Wrote ${rows.length} projects to ${file}`);

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, FAST_MODEL, hasAnthropicCredentials } from "../anthropic";
import { db } from "../db";
import { CATEGORIES } from "../search/parse";

/** Tagger output (brief §5). Anything the listing doesn't support is null — never a guess. */
export const TagSchema = z.object({
  min_age: z.number().int().nullable().describe("Minimum volunteer age stated in the listing, else null"),
  family_friendly: z.boolean().nullable().describe("True only if the listing says children/families are welcome; false if it says adults only; else null"),
  setting: z.enum(["indoor", "outdoor", "both", "unknown"]),
  group_min: z.number().int().nullable(),
  group_max: z.number().int().nullable().describe("Largest group the listing says it can take, else null"),
  effort: z.enum(["light", "moderate", "heavy"]).nullable(),
  time_of_day: z.enum(["morning", "afternoon", "evening", "flexible"]).nullable(),
  weekday: z.boolean().nullable(),
  weekend: z.boolean().nullable(),
  categories: z.array(z.enum(CATEGORIES)),
  summary: z.string().describe("One plain-English line, under 15 words, saying what volunteers do"),
});
export type Tags = z.infer<typeof TagSchema>;

const SYSTEM = `You tag volunteer service listings from JustServe.org so people can search them.
Use only what the listing says. If the listing doesn't support a field, use null (or "unknown" for setting). Never guess.
- min_age: only a stated minimum age ("ages 12+", "must be 16"). "Adults only" means 18.
- family_friendly: true only if the listing welcomes kids or families; false if it says adults only.
- group_max: only if the listing states a group size or number of volunteers needed.
- effort: heavy for lifting/construction/long physical work, light for sitting/sorting/visiting.
- time_of_day and weekday/weekend: from the listed date and time when present (times are in Utah).
- categories: zero or more that clearly apply.
- summary: one short plain line about what volunteers do. No dates, times, or places.`;

interface Untagged {
  id: string;
  title: string | null;
  org_name: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
  recurring: boolean | null;
  capacity: number | null;
  content_hash: string;
}

function listingText(p: Untagged): string {
  const tz = "America/Denver";
  const fmt = (d: Date | null) => (d ? d.toLocaleString("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "short" }) : "not listed");
  return [
    `Title: ${p.title ?? ""}`,
    `Organization: ${p.org_name ?? ""}`,
    `City: ${p.city ?? ""}`,
    `Starts: ${p.recurring ? "ongoing / recurring" : fmt(p.starts_at)}`,
    `Ends: ${fmt(p.ends_at)}`,
    `Volunteers needed: ${p.capacity ?? "not listed"}`,
    `Description:\n${p.description ?? ""}`,
  ].join("\n");
}

export async function tagOne(p: Untagged): Promise<Tags> {
  const response = await anthropic().messages.parse({
    model: FAST_MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: listingText(p) }],
    output_config: { format: zodOutputFormat(TagSchema) },
  });
  if (!response.parsed_output) throw new Error(`Tagger returned no parsable output (stop_reason=${response.stop_reason})`);
  return response.parsed_output;
}

/**
 * Tags every active project whose content changed since it was last tagged (Milestone 2).
 * Cached by content hash: unchanged projects are never re-tagged.
 */
export async function tagChangedProjects(opts: { limit?: number; concurrency?: number } = {}) {
  if (!hasAnthropicCredentials()) throw new Error("ANTHROPIC_API_KEY is not set; the tagger needs it.");
  const { rows } = await db().query<Untagged>(
    `select p.id, p.title, p.org_name, p.description, p.address, p.city, p.starts_at, p.ends_at, p.recurring,
            p.capacity, p.content_hash
     from projects p left join project_tags t on t.project_id = p.id
     where p.status = 'active' and p.source = 'justserve'
       and (t.project_id is null or t.content_hash is distinct from p.content_hash)
     order by p.first_seen
     limit $1`,
    [opts.limit ?? 10000],
  );

  let tagged = 0;
  const failed: { id: string; error: string }[] = [];
  const queue = [...rows];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        const t = await tagOne(p);
        await db().query(
          `insert into project_tags (project_id, min_age, family_friendly, setting, group_min, group_max, effort,
                                     time_of_day, weekday, weekend, sunday_appropriate, categories, summary,
                                     content_hash, tagged_at, model)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,null,$11,$12,$13,now(),$14)
           on conflict (project_id) do update set
             min_age = excluded.min_age, family_friendly = excluded.family_friendly, setting = excluded.setting,
             group_min = excluded.group_min, group_max = excluded.group_max, effort = excluded.effort,
             time_of_day = excluded.time_of_day, weekday = excluded.weekday, weekend = excluded.weekend,
             categories = excluded.categories, summary = excluded.summary, content_hash = excluded.content_hash,
             tagged_at = excluded.tagged_at, model = excluded.model`,
          [p.id, t.min_age, t.family_friendly, t.setting, t.group_min, t.group_max, t.effort, t.time_of_day,
           t.weekday, t.weekend, t.categories, t.summary, p.content_hash, FAST_MODEL],
        );
        tagged++;
      } catch (err) {
        failed.push({ id: p.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 4 }, worker));
  return { candidates: rows.length, tagged, failed };
}

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, FAST_MODEL, hasAnthropicCredentials } from "../anthropic";
import { findCity, pilotArea } from "../content/pilot";
import { addDays, localToday, nextWeekday } from "../dates";
import type { ParsedQuery } from "../types";

export const CATEGORIES = [
  "hunger",
  "seniors",
  "environment",
  "health",
  "refugees",
  "youth",
  "disaster",
  "education",
  "animals",
  "community",
] as const;

const ParsedQuerySchema = z.object({
  location: z.string().nullable().describe("City or place the person wants to serve near, or null"),
  date_from: z.string().nullable().describe("Start of requested date range, YYYY-MM-DD, or null"),
  date_to: z.string().nullable().describe("End of requested date range, YYYY-MM-DD, or null"),
  min_age_needed: z.number().int().nullable().describe("Age of the youngest person who will attend, or null"),
  group_size: z.number().int().nullable().describe("Number of people coming, or null"),
  setting: z.enum(["indoor", "outdoor"]).nullable(),
  categories: z.array(z.enum(CATEGORIES)),
  free_text: z.string().describe("The kind of service wanted, stripped of place/date/age/group details"),
});

function emptyParse(q: string): ParsedQuery {
  return {
    location: null,
    date_from: null,
    date_to: null,
    min_age_needed: null,
    group_size: null,
    setting: null,
    categories: [],
    free_text: q,
  };
}

/** Parse a free-text query into filters (brief §6 step 1). Uses Claude when available, keyword rules otherwise. */
export async function parseQuery(q: string): Promise<ParsedQuery> {
  const text = q.trim();
  if (!text) return emptyParse("");
  if (!hasAnthropicCredentials()) return heuristicParse(text);
  try {
    const { date, weekday } = localToday();
    const cities = pilotArea()
      .cities.map((c) => c.name)
      .join(", ");
    const response = await anthropic().messages.parse({
      model: FAST_MODEL,
      max_tokens: 1024,
      system:
        `You turn volunteer-service search queries into filters. Today is ${weekday}, ${date} (Utah). ` +
        `"This weekend" means the coming Saturday–Sunday (just today if today is Sunday); "this week" means today through the coming Sunday. ` +
        `Known cities: ${cities}. Use null for anything the query doesn't say. Never guess ages or group sizes; ` +
        `"kids" alone does not give an age. A youth group or family with no count has group_size null.`,
      messages: [{ role: "user", content: text }],
      output_config: { format: zodOutputFormat(ParsedQuerySchema) },
    });
    const parsed = response.parsed_output;
    if (!parsed) return heuristicParse(text);
    return { ...parsed, categories: [...parsed.categories] };
  } catch (err) {
    console.error("parseQuery: Claude parse failed, using keyword rules", err);
    return heuristicParse(text);
  }
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  hunger: ["food", "hunger", "pantry", "meal", "soup", "garden"],
  seniors: ["senior", "elderly", "care center", "assisted living", "retirement"],
  environment: ["clean", "trail", "tree", "park", "recycl", "litter", "environment"],
  health: ["blood", "health", "hospital", "medical"],
  refugees: ["refugee", "immigrant", "english", "esl"],
  youth: ["tutor", "mentor", "school", "reading", "youth"],
  disaster: ["disaster", "flood", "fire", "emergency", "hygiene kit"],
  animals: ["animal", "shelter", "dog", "cat", "horse"],
};

export function heuristicParse(q: string): ParsedQuery {
  const lower = q.toLowerCase();
  const out = emptyParse(q);
  out.location = findCity(q)?.name ?? null;

  const { date } = localToday();
  if (/\btoday\b|\btonight\b/.test(lower)) {
    out.date_from = out.date_to = date;
  } else if (/\btomorrow\b/.test(lower)) {
    out.date_from = out.date_to = addDays(date, 1);
  } else if (/\bthis weekend\b|\bweekend\b/.test(lower)) {
    // On a Sunday, "this weekend" means today.
    const isSunday = new Date(date + "T12:00:00Z").getUTCDay() === 0;
    out.date_from = isSunday ? date : nextWeekday(date, "saturday");
    out.date_to = isSunday ? date : addDays(out.date_from, 1);
  } else if (/\bthis week\b/.test(lower)) {
    out.date_from = date;
    out.date_to = nextWeekday(date, "sunday");
  } else if (/\bnext week\b/.test(lower)) {
    out.date_from = addDays(nextWeekday(date, "sunday"), 1);
    out.date_to = addDays(out.date_from, 6);
  } else {
    const day = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (day) out.date_from = out.date_to = nextWeekday(date, day[1]);
  }

  const age = lower.match(/(\d{1,2})[\s-]*(?:year|yr)s?[\s-]*old/) ?? lower.match(/\bages?\s+(\d{1,2})/);
  if (age) out.min_age_needed = Number(age[1]);

  const group = lower.match(/(?:group of|party of|team of)\s+(\d{1,3})/) ?? lower.match(/(\d{1,3})\s+(?:people|volunteers|kids|youth|of us)/);
  if (group) out.group_size = Number(group[1]);

  if (/\bindoor|inside\b/.test(lower)) out.setting = "indoor";
  else if (/\boutdoor|outside\b/.test(lower)) out.setting = "outdoor";

  for (const [cat, keys] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keys.some((k) => lower.includes(k))) out.categories.push(cat);
  }
  return out;
}

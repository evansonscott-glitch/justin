/**
 * Brief §9: a simple check that times, addresses and ages in a chat reply appear in the listing
 * text the tools returned. It's deliberately literal; anything it flags gets a human look.
 */

const TZ = "America/Denver";

function normTime(h: string, m: string | undefined, ampm: string): string {
  return `${Number(h)}:${m ?? "00"}${ampm.toLowerCase().replace(/\./g, "")}`;
}

const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/gi;
const AGE_RE = /\b(?:ages?\s+(\d{1,2})|(\d{1,2})\s*\+|(\d{1,2})\s*(?:years?|yrs?)\s*(?:old|and up|or older))/gi;
const ADDRESS_RE = /\b(\d{2,5})\s+(?:[NSEW]\.?\s+)?([A-Z][a-z]+|\d+(?:st|nd|rd|th)?)\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Ln|Lane|Way|Cir|Circle|Ct|Court|Pkwy|Parkway)\b/g;
const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g;

function allowedTimes(source: string): Set<string> {
  const out = new Set<string>();
  for (const m of source.matchAll(TIME_RE)) out.add(normTime(m[1], m[2], m[3]));
  // Tool results carry ISO timestamps; allow their Utah-local clock time too.
  for (const iso of source.match(ISO_RE) ?? []) {
    const s = new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
    const m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/);
    if (m) out.add(normTime(m[1], m[2], m[3]));
  }
  return out;
}

export interface FactIssue {
  kind: "time" | "age" | "address";
  text: string;
}

export function checkFacts(reply: string, toolOutputs: string[]): FactIssue[] {
  const source = toolOutputs.join("\n");
  const issues: FactIssue[] = [];

  const times = allowedTimes(source);
  for (const m of reply.matchAll(TIME_RE)) {
    if (!times.has(normTime(m[1], m[2], m[3]))) issues.push({ kind: "time", text: m[0] });
  }

  for (const m of reply.matchAll(AGE_RE)) {
    const age = m[1] ?? m[2] ?? m[3];
    const inSource = new RegExp(`(?:"min_age":${age}\\b|\\b${age}\\s*\\+|ages?\\s+${age}\\b|\\b${age}\\s*(?:years?|yrs?))`, "i").test(source);
    if (!inSource) issues.push({ kind: "age", text: m[0] });
  }

  for (const m of reply.matchAll(ADDRESS_RE)) {
    if (!source.includes(m[1]) || !source.toLowerCase().includes(m[2].toLowerCase())) {
      issues.push({ kind: "address", text: m[0] });
    }
  }
  return issues;
}

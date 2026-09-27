import { readInput } from "./files";

export interface SpecialistRow {
  city_or_stake: string;
  specialist_name: string;
  contact_method: string | null;
  contact: string | null;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

/**
 * Routing row for a city or stake. Rows with consent_given=no return the name only (brief §8).
 */
export function findSpecialist(cityOrStake: string): SpecialistRow | null {
  const needle = cityOrStake.trim().toLowerCase();
  if (!needle) return null;
  const rows = parseCsv(readInput("specialists.csv"));
  const row =
    rows.find((r) => r.city_or_stake.toLowerCase() === needle) ??
    rows.find((r) => needle.includes(r.city_or_stake.toLowerCase()) || r.city_or_stake.toLowerCase().includes(needle));
  if (!row) return null;
  const consent = row.consent_given.toLowerCase() === "yes";
  return {
    city_or_stake: row.city_or_stake,
    specialist_name: row.specialist_name,
    contact_method: consent ? row.contact_method || null : null,
    contact: consent ? row.contact || null : null,
  };
}

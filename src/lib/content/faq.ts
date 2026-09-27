import { readInput } from "./files";

export interface FaqEntry {
  question: string;
  answer: string;
}

/** Parse inputs/faq.md: each "## " heading is a question; the text beneath it is the answer. */
export function loadFaq(): FaqEntry[] {
  const text = readInput("faq.md").replace(/<!--[\s\S]*?-->/g, "");
  const entries: FaqEntry[] = [];
  for (const chunk of text.split(/^## /m).slice(1)) {
    const [question, ...rest] = chunk.split("\n");
    const answer = rest.join("\n").trim();
    if (question.trim() && answer && !answer.startsWith("PLACEHOLDER")) {
      entries.push({ question: question.trim(), answer });
    }
  }
  return entries;
}

const STOPWORDS = new Set(
  "a an and are be can do does for how i in is it me my of on or the to we what when where who why with you your".split(" "),
);

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/** Best-matching FAQ entries by word overlap. Returns [] when nothing matches — Justin must then route to the specialist. */
export function faqLookup(question: string, limit = 2): FaqEntry[] {
  const q = words(question);
  if (q.size === 0) return [];
  return loadFaq()
    .map((entry) => {
      const e = words(entry.question + " " + entry.answer);
      let overlap = 0;
      for (const w of q) if (e.has(w)) overlap++;
      return { entry, score: overlap / q.size };
    })
    .filter((x) => x.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.entry);
}

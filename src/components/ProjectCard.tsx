import type { ProjectCard as Card } from "@/lib/types";

const TZ = "America/Denver";

function when(p: Card): string | null {
  if (p.recurring) return "Ongoing";
  if (!p.startsAt) return null;
  const start = new Date(p.startsAt);
  const day = start.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
  const time = start.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

export function ProjectCard({ project: p, onOpen }: { project: Card; onOpen?: (id: string) => void }) {
  const facts: string[] = [];
  const w = when(p);
  if (w) facts.push(w);
  if (p.city) facts.push(p.distanceMiles != null ? `${p.city} · ${p.distanceMiles} mi` : p.city);
  if (p.tags.familyFriendly) facts.push("Kids OK");
  else if (p.tags.minAge != null) facts.push(`Ages ${p.tags.minAge}+`);
  if (p.tags.setting && p.tags.setting !== "unknown") facts.push(p.tags.setting === "both" ? "Indoor & outdoor" : p.tags.setting[0].toUpperCase() + p.tags.setting.slice(1));
  if (p.tags.groupMax) facts.push(`Groups up to ${p.tags.groupMax}`);

  return (
    <a className="card" href={p.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen?.(p.id)}>
      <div className="card-title">
        {p.title}
        {p.isSample && <span className="sample-tag">SAMPLE</span>}
      </div>
      {p.orgName && <div className="card-org">{p.orgName}</div>}
      {p.summary && <div className="card-summary">{p.summary}</div>}
      {facts.length > 0 && (
        <div className="card-facts">
          {facts.map((f) => (
            <span className="fact" key={f}>
              {f}
            </span>
          ))}
        </div>
      )}
      <div className="card-cta">View &amp; sign up on JustServe.org →</div>
    </a>
  );
}

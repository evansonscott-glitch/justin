"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectCard } from "@/components/ProjectCard";
import { getSessionId } from "@/components/session";
import type { SearchResult } from "@/lib/types";

type Chip = "near_me" | "this_week" | "kids_ok" | "indoor";

const CHIP_LABELS: Record<Chip, string> = {
  near_me: "Near me",
  this_week: "This week",
  kids_ok: "Kids OK",
  indoor: "Indoor",
};

export default function FinderPage() {
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<Set<Chip>>(new Set());
  const [group, setGroup] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string>("");

  useEffect(() => {
    sessionRef.current = getSessionId();
  }, []);

  const run = useCallback(
    async (query: string, active: Set<Chip>, groupSize: string, here: typeof coords) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ q: query, session: sessionRef.current });
      const tags = [...active].filter((c) => c !== "near_me");
      if (tags.length) params.set("tags", tags.join(","));
      if (groupSize) params.set("group", groupSize);
      if (active.has("near_me") && here) {
        params.set("lat", String(here.lat));
        params.set("lng", String(here.lng));
      }
      try {
        const res = await fetch(`/api/search?${params}`);
        if (!res.ok) throw new Error();
        setResult((await res.json()) as SearchResult);
      } catch {
        setError("Search isn't working right now. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void run("", new Set(), "", null);
  }, [run]);

  const toggle = (chip: Chip) => {
    const next = new Set(chips);
    if (next.has(chip)) next.delete(chip);
    else next.add(chip);
    if (chip === "near_me" && next.has("near_me") && !coords) {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(here);
          void run(q, next, group, here);
        },
        () => {
          next.delete("near_me");
          setChips(new Set(next));
          setError("Couldn't get your location. Try typing a city instead, like “near Orem.”");
        },
      );
    } else {
      void run(q, next, group, coords);
    }
    setChips(next);
  };

  const logClick = (projectId: string) => {
    void fetch("/api/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sessionRef.current, projectId }),
      keepalive: true,
    });
  };

  const anySample = result?.projects.some((p) => p.isSample);

  return (
    <div>
      <h1 style={{ fontSize: 26, margin: "4px 0 12px" }}>Find a way to serve</h1>
      <form
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault();
          void run(q, chips, group, coords);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Saturday morning in Orem with my kids"
          aria-label="Search service projects"
          enterKeyHint="search"
        />
        <button className="btn" type="submit" disabled={loading}>
          Search
        </button>
      </form>

      <div className="chips">
        {(Object.keys(CHIP_LABELS) as Chip[]).map((c) => (
          <button key={c} type="button" className={`chip ${chips.has(c) ? "on" : ""}`} onClick={() => toggle(c)}>
            {CHIP_LABELS[c]}
          </button>
        ))}
        <label className={`chip ${group ? "on" : ""}`}>
          <select
            value={group}
            aria-label="Group size"
            onChange={(e) => {
              setGroup(e.target.value);
              void run(q, chips, e.target.value, coords);
            }}
          >
            <option value="">Group size</option>
            {[2, 5, 10, 15, 20, 30, 50].map((n) => (
              <option key={n} value={n}>
                {n}+ people
              </option>
            ))}
          </select>
        </label>
      </div>

      {anySample && (
        <div className="sample-banner">
          These are made-up sample projects for testing the design. Real JustServe.org listings replace them once the reader runs.
        </div>
      )}
      {error && <div className="meta">{error}</div>}
      {loading && <div className="meta">Searching…</div>}
      {!loading && result && result.projects.length === 0 && (
        <div className="empty">No matching projects. Try a nearby city, a wider date, or fewer filters.</div>
      )}
      {!loading && result?.noTopicMatch && (
        <div className="meta">No exact matches for that kind of service. Here are other projects that fit your filters:</div>
      )}
      {!loading &&
        result?.projects.map((p) => <ProjectCard key={p.id} project={p} onOpen={logClick} />)}
    </div>
  );
}

import { readInput } from "./files";

export interface PilotCity {
  name: string;
  lat: number;
  lng: number;
}

export interface PilotArea {
  name: string;
  timezone: string;
  center: { lat: number; lng: number };
  radius_miles: number;
  stakes: string[];
  cities: PilotCity[];
}

let cached: PilotArea | null = null;

export function pilotArea(): PilotArea {
  if (!cached) cached = JSON.parse(readInput("pilot_area.json")) as PilotArea;
  return cached;
}

/** Resolve a place name ("Orem", "near provo", "American Fork, UT") to a pilot-area city. */
export function findCity(text: string | null | undefined): PilotCity | null {
  if (!text) return null;
  const needle = text.toLowerCase();
  // Longest names first so "American Fork" wins over a shorter partial match.
  const cities = [...pilotArea().cities].sort((a, b) => b.name.length - a.name.length);
  return cities.find((c) => needle.includes(c.name.toLowerCase())) ?? null;
}

import { purgeOldChats, runHealthReport } from "./health/report";
import { justServeSource } from "./reader/justserve";
import { refreshFrom } from "./reader/upsert";
import { hasAnthropicCredentials } from "./anthropic";
import { tagChangedProjects } from "./tagger/tagger";

/** Hourly: full refresh of the pilot area, then tag anything new or changed. */
export async function hourlyRefresh() {
  const refresh = await refreshFrom(justServeSource);
  const tagging = hasAnthropicCredentials() ? await tagChangedProjects() : { skipped: "no ANTHROPIC_API_KEY" };
  return { refresh, tagging };
}

/** Nightly: listing-health report and the 90-day chat purge. */
export async function nightly() {
  const health = await runHealthReport();
  const purge = await purgeOldChats();
  return { health, purge };
}

import "./env";
import { db } from "../src/lib/db";
import { tagChangedProjects } from "../src/lib/tagger/tagger";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
try {
  const result = await tagChangedProjects({ limit: limitArg ? Number(limitArg.split("=")[1]) : undefined });
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db().end();
}

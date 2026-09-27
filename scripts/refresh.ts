import "./env";
import { db } from "../src/lib/db";
import { hourlyRefresh } from "../src/lib/jobs";

try {
  console.log(JSON.stringify(await hourlyRefresh(), null, 2));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db().end();
}

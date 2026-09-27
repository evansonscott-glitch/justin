import "./env";
import { db } from "../src/lib/db";
import { nightly } from "../src/lib/jobs";

try {
  console.log(JSON.stringify(await nightly(), null, 2));
} finally {
  await db().end();
}

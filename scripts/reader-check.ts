/**
 * Checks the JustServe reader without copying a county's listings into the database.
 *
 *   npm run reader:check            # offline checks (time zones, mapping, a fake database row)
 *   npm run reader:check -- --live  # one public search page and one project page, then discard them
 *
 * A full copy is `npm run refresh`. Do not run that until JustServe has given written permission.
 * See docs/data-spike.md.
 */
import "./env";
import fs from "node:fs";
import assert from "node:assert/strict";
import { zonedWallTimeToIso } from "../src/lib/dates";
import { corpusStats, toReaderProject, type ProjectDetail, type SearchCard } from "../src/lib/reader/map";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

check("Utah wall-clock times become the right UTC instant", () => {
  assert.equal(zonedWallTimeToIso("2026-09-28T10:30:00"), "2026-09-28T16:30:00.000Z");
  assert.equal(zonedWallTimeToIso("2026-01-15T10:30:00"), "2026-01-15T17:30:00.000Z");
  assert.equal(zonedWallTimeToIso("0001-01-01T15:00:00"), null);
  assert.equal(zonedWallTimeToIso("2026-10-01T00:00:00.0000000+00:00"), "2026-10-01T00:00:00.000Z");
});

const card: SearchCard = {
  id: "11111111-1111-1111-1111-111111111111",
  statusId: 1,
  title: "Sample pantry cleaning",
  shortDescription: "Short line",
  organizationName: null,
  totalNextOpportunities: 10,
  nextOpportunity: { start: "2026-09-28T10:30:00", end: "2026-09-28T12:30:00" },
  location: { city: null, latitude: 0, longitude: 0 },
};

check("a recurring shift keeps the street, the cap, and drops the phone number", () => {
  const detail: ProjectDetail = {
    isActive: true,
    title: "Sample pantry cleaning",
    longDescription: "<ul><li>Adults only (18+)</li><li>Monday, Wednesday, Friday</li></ul>",
    organization: { name: "Sample Food Bank" },
    projectOwnerLocation: { city: "Biloxi", state: "Mississippi", latitude: 30.39, longitude: -88.89 },
    recurring: {
      end: "2027-09-16T00:00:00.0000000+00:00",
      location: { address: "100 Example Street", city: "Springville", state: "Utah", latitude: 40.15, longitude: -111.64 },
      recurringTimes: [
        {
          start: "0001-01-01T10:30:00",
          end: "0001-01-01T12:30:00",
          volunteersCapped: true,
          totalVolunteersNeeded: 2,
          groupLimit: 2,
          monday: true,
          wednesday: true,
          friday: true,
        },
      ],
    },
  };
  const project = toReaderProject(card, detail);
  assert.ok(project);
  assert.equal(project.city, "Springville");
  assert.equal(project.address, "100 Example Street");
  assert.equal(project.orgName, "Sample Food Bank");
  assert.equal(project.capacity, 2);
  assert.equal(project.recurring, true);
  assert.equal(project.startsAt, "2026-09-28T16:30:00.000Z");
  assert.match(project.description ?? "", /Adults only/);
  assert.match(project.description ?? "", /Mondays/);
  assert.equal(JSON.stringify(project.raw).includes("801"), false);
  assert.equal(project.lat, 40.15);
});

check("a listing with no map point uses the pilot city, and 0,0 is not stored", () => {
  const project = toReaderProject(
    { ...card, id: "22222222-2222-2222-2222-222222222222", organizationName: null, nextOpportunity: { start: "2026-09-29T15:00:00", end: "2026-09-29T16:00:00" } },
    {
      isActive: true,
      longDescription: "<p>Help residents play a game.</p>",
      projectOwnerLocation: { city: "Vineyard", state: "Utah", latitude: 0, longitude: 0 },
      recurring: {
        end: "2026-12-22T00:00:00+00:00",
        location: { latitude: 0, longitude: 0, city: null, address: null },
        recurringTimes: [{ start: "0001-01-01T15:00:00", end: "0001-01-01T16:00:00", volunteersCapped: true, totalVolunteersNeeded: 4, groupLimit: 0, tuesday: true, thursday: true }],
      },
    },
  );
  assert.ok(project);
  assert.equal(project.address, null);
  assert.equal(project.city, "Vineyard");
  assert.equal(project.capacity, 4);
  assert.ok(project.lat && project.lat > 40 && project.lat < 41);
  assert.equal((project.raw as { cityApproximate?: boolean }).cityApproximate, true);
});

check("an unlisted project is skipped", () => {
  assert.equal(toReaderProject(card, { isUnlistedProject: true, isActive: true }), null);
});

check("two dated shifts are not treated as a weekly repeat", () => {
  const project = toReaderProject(
    { ...card, totalNextOpportunities: 2, nextOpportunity: { start: "2026-09-28T20:00:00", end: "2026-09-28T21:00:00" } },
    {
      isActive: true,
      longDescription: "Help set up for one weekend.",
      dtl: [
        {
          location: { address: "10 Example Ave", city: "Orem", latitude: 40.31, longitude: -111.7 },
          timeSlots: [
            { startFormatted: "2026-09-29T02:00:00+00:00", endFormatted: "2026-09-29T03:00:00+00:00", volunteersCapped: false, totalVolunteersNeeded: 0 },
            { startFormatted: "2026-10-03T02:00:00+00:00", endFormatted: "2026-10-03T03:00:00+00:00", volunteersCapped: false, totalVolunteersNeeded: 0 },
          ],
        },
      ],
    },
  );
  assert.ok(project);
  assert.equal(project.recurring, false);
  assert.equal(project.capacity, null);
  assert.equal(project.city, "Orem");
  assert.equal(project.startsAt, "2026-09-29T02:00:00.000Z");
});

// Present only on the machine that saved the spike's Orem search page. Skipped everywhere else.
const captured = "/tmp/js-details/search-p0.json";
if (fs.existsSync(captured)) {
  check("the saved Orem search page has map points and does not keep 0,0", () => {
    const data = JSON.parse(fs.readFileSync(captured, "utf8")) as { items: SearchCard[] };
    const projects = data.items.map((item) => toReaderProject(item, null)).filter((p) => p != null);
    const stats = corpusStats(projects);
    assert.ok(stats.projects >= 90);
    assert.ok(stats.mapPoint >= 80, `map points ${stats.mapPoint}`);
    assert.ok(projects.every((p) => p.lat !== 0 && p.lng !== 0));
    console.log("  saved page:", JSON.stringify(stats));
  });
}

if (process.argv.includes("--db")) {
  process.env.DATABASE_URL ??= "postgres://justin:justin@localhost:5432/justin";
  const { applyRefresh } = await import("../src/lib/reader/upsert");
  const { db } = await import("../src/lib/db");
  const fake = toReaderProject(
    { ...card, title: "Fixture project (not from JustServe)" },
    {
      isActive: true,
      longDescription: "Made-up text used only to test the database write.",
      organization: { name: "Fixture Org" },
      recurring: {
        location: { address: "1 Fixture Way", city: "Orem", latitude: 40.3, longitude: -111.7 },
        recurringTimes: [{ start: "0001-01-01T09:00:00", end: "0001-01-01T11:00:00", volunteersCapped: true, totalVolunteersNeeded: 5, monday: true }],
      },
    },
  );
  assert.ok(fake);
  try {
    const stats = await applyRefresh([fake]);
    const { rows } = await db().query<{ city: string; capacity: number }>(
      "select city, capacity from projects where id = $1",
      [fake.id],
    );
    assert.equal(rows[0]?.city, "Orem");
    assert.equal(rows[0]?.capacity, 5);
    assert.ok(stats.inserted + stats.updated >= 1);
    await db().query("delete from projects where id = $1", [fake.id]);
    // applyRefresh removes made-up samples the first time real rows are written. Put them back.
    const { spawnSync } = await import("node:child_process");
    const seeded = spawnSync("npx", ["tsx", "scripts/seed-samples.ts"], { stdio: "inherit", env: process.env });
    if (seeded.status !== 0) throw new Error("restoring sample projects failed");
    console.log("ok  database write");
  } catch (err) {
    failed++;
    console.error("FAIL database write");
    console.error(err instanceof Error ? err.message : err);
  } finally {
    await db().end();
  }
}

if (process.argv.includes("--live")) {
  const { readPilot } = await import("../src/lib/reader/justserve");
  try {
    const projects = await readPilot({ maxPages: 1, pageSize: 10, maxDetails: 1 });
    assert.ok(projects.length >= 1, "live search returned nothing");
    assert.ok(projects.every((p) => p.url.startsWith("https://www.justserve.org/projects/")));
    assert.ok(projects.every((p) => p.lat !== 0 && p.lng !== 0));
    const stats = corpusStats(projects);
    console.log("ok  live probe", JSON.stringify(stats));
    console.log("  opened", projects.length, "search hits; full page had a street:", Boolean(projects[0].address));
  } catch (err) {
    failed++;
    console.error("FAIL live probe");
    console.error(err instanceof Error ? err.message : err);
  }
}

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("reader checks passed");

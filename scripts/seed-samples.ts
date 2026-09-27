/**
 * Loads ~20 MADE-UP sample projects so the finder and chat can be exercised before the reader
 * is pulling real listings. Every row is source='sample' and shows a SAMPLE badge in the UI.
 * The reader deletes sample rows on its first successful run; `--clear` removes them by hand.
 */
import "./env";
import { db } from "../src/lib/db";
import { pilotArea } from "../src/lib/content/pilot";
import { addDays, localToday } from "../src/lib/dates";

const clearOnly = process.argv.includes("--clear");
await db().query(`delete from projects where source = 'sample'`);
if (clearOnly) {
  console.log("Sample projects removed.");
  await db().end();
  process.exit(0);
}

const today = localToday().date;
const at = (days: number, hhmm: string) => `${addDays(today, days)}T${hhmm}:00-06:00`;
const city = (name: string) => pilotArea().cities.find((c) => c.name === name)!;

interface Sample {
  title: string; org: string; city: string; desc: string;
  start: string | null; end: string | null; recurring?: boolean; capacity?: number;
  tags: { min_age: number | null; family: boolean | null; setting: string; gmin?: number; gmax?: number | null; effort: string; tod: string; cats: string[]; summary: string };
}

const samples: Sample[] = [
  { title: "Food Pantry Sorting Shift", org: "Sample Valley Food Bank", city: "Provo", desc: "Sort donated food and pack boxes for families. Closed-toe shoes required. Ages 12+ with an adult.", start: at(2, "09:00"), end: at(2, "12:00"), capacity: 20,
    tags: { min_age: 12, family: true, setting: "indoor", gmax: 20, effort: "moderate", tod: "morning", cats: ["hunger"], summary: "Sort and pack food boxes at a food bank." } },
  { title: "Trail Cleanup at Sample Canyon", org: "Sample Trails Alliance", city: "Orem", desc: "Pick up litter and clear brush along the lower trail. Gloves and bags provided. Wear sturdy shoes and bring water.", start: at(3, "08:00"), end: at(3, "11:00"), capacity: 40,
    tags: { min_age: 8, family: true, setting: "outdoor", gmax: 40, effort: "moderate", tod: "morning", cats: ["environment"], summary: "Pick up litter and clear brush on a canyon trail." } },
  { title: "Reading Buddies (Weekly)", org: "Sample Elementary PTA", city: "Lehi", desc: "Read one-on-one with 2nd graders for 30 minutes. Background check required. Adults only.", start: null, end: null, recurring: true, capacity: 10,
    tags: { min_age: 18, family: false, setting: "indoor", gmax: 1, effort: "light", tod: "afternoon", cats: ["youth", "education"], summary: "Read one-on-one with young students each week." } },
  { title: "Senior Center Game Night", org: "Sample Senior Living", city: "American Fork", desc: "Play board games and visit with residents. Families welcome; children must stay with parents.", start: at(4, "18:30"), end: at(4, "20:00"), capacity: 15,
    tags: { min_age: null, family: true, setting: "indoor", gmax: 15, effort: "light", tod: "evening", cats: ["seniors"], summary: "Play games and visit with senior residents." } },
  { title: "Hygiene Kit Assembly", org: "Sample Relief Network", city: "Springville", desc: "Assemble hygiene kits for disaster relief. Great for youth groups and families. All ages with supervision.", start: at(6, "10:00"), end: at(6, "12:00"), capacity: 60,
    tags: { min_age: null, family: true, setting: "indoor", gmax: 60, effort: "light", tod: "morning", cats: ["disaster"], summary: "Assemble hygiene kits for disaster relief." } },
  { title: "Refugee Family Furniture Move", org: "Sample Refugee Services", city: "Provo", desc: "Help carry donated furniture into apartments for newly arrived refugee families. Heavy lifting. Ages 16+.", start: at(5, "09:00"), end: at(5, "13:00"), capacity: 8,
    tags: { min_age: 16, family: false, setting: "both", gmax: 8, effort: "heavy", tod: "morning", cats: ["refugees"], summary: "Carry furniture into homes for new refugee families." } },
  { title: "Blood Drive Greeter", org: "Sample Blood Services", city: "Pleasant Grove", desc: "Greet donors, hand out snacks, and help with check-in. Ages 16+.", start: at(7, "14:00"), end: at(7, "18:00"), capacity: 6,
    tags: { min_age: 16, family: false, setting: "indoor", gmax: 6, effort: "light", tod: "afternoon", cats: ["health"], summary: "Greet donors and help run check-in at a blood drive." } },
  { title: "Animal Shelter Dog Walking", org: "Sample Animal Rescue", city: "Spanish Fork", desc: "Walk and socialize shelter dogs. Orientation required on first visit. Ages 14+.", start: null, end: null, recurring: true, capacity: 12,
    tags: { min_age: 14, family: false, setting: "outdoor", gmax: 4, effort: "light", tod: "flexible", cats: ["animals"], summary: "Walk and socialize shelter dogs." } },
  { title: "Community Garden Harvest", org: "Sample Community Gardens", city: "Vineyard", desc: "Harvest vegetables to donate to local pantries. Kids welcome with a parent. Bring gloves if you have them.", start: at(2, "08:30"), end: at(2, "10:30"), capacity: 25,
    tags: { min_age: null, family: true, setting: "outdoor", gmax: 25, effort: "moderate", tod: "morning", cats: ["hunger", "environment"], summary: "Harvest garden vegetables for food pantries." } },
  { title: "Tree Planting Day", org: "Sample Parks Foundation", city: "Saratoga Springs", desc: "Plant saplings along the new park path. Tools provided. Ages 10+.", start: at(9, "09:00"), end: at(9, "12:00"), capacity: 50,
    tags: { min_age: 10, family: true, setting: "outdoor", gmax: 50, effort: "heavy", tod: "morning", cats: ["environment"], summary: "Plant trees along a new park path." } },
  { title: "ESL Conversation Partners", org: "Sample Literacy Center", city: "Orem", desc: "Practice everyday English conversation with adult learners. Tuesdays 7–8 pm. Adults only.", start: null, end: null, recurring: true, capacity: 15,
    tags: { min_age: 18, family: false, setting: "indoor", gmax: 15, effort: "light", tod: "evening", cats: ["refugees", "education"], summary: "Practice English conversation with adult learners." } },
  { title: "Meal Packing Night", org: "Sample Hunger Relief", city: "Lindon", desc: "Pack dry meal kits in an assembly line. Ages 5+ with an adult. Groups of up to 100 welcome.", start: at(1, "18:00"), end: at(1, "20:00"), capacity: 100,
    tags: { min_age: 5, family: true, setting: "indoor", gmax: 100, effort: "light", tod: "evening", cats: ["hunger"], summary: "Pack dry meal kits on an assembly line." } },
  { title: "Care Center Letter Writing", org: "Sample Care Center", city: "Payson", desc: "Write cards for residents. Can be done at home and dropped off. All ages.", start: null, end: null, recurring: true,
    tags: { min_age: null, family: true, setting: "indoor", gmax: null, effort: "light", tod: "flexible", cats: ["seniors"], summary: "Write cards for care center residents from home." } },
  { title: "Flood Sandbag Prep", org: "Sample Emergency Volunteers", city: "Mapleton", desc: "Fill and stack sandbags ahead of spring runoff. Heavy lifting. Ages 14+.", start: at(12, "08:00"), end: at(12, "12:00"), capacity: 30,
    tags: { min_age: 14, family: false, setting: "outdoor", gmax: 30, effort: "heavy", tod: "morning", cats: ["disaster"], summary: "Fill and stack sandbags for flood prep." } },
  { title: "After-School Homework Help", org: "Sample Youth Club", city: "Eagle Mountain", desc: "Help kids with homework. Mon–Thu 3:30–5 pm. Background check required.", start: null, end: null, recurring: true, capacity: 8,
    tags: { min_age: 18, family: false, setting: "indoor", gmax: 8, effort: "light", tod: "afternoon", cats: ["youth", "education"], summary: "Help kids with homework after school." } },
  { title: "Park Playground Repaint", org: "Sample City Parks", city: "Highland", desc: "Scrape and repaint playground equipment. Ages 12+. Wear clothes that can get paint on them.", start: at(10, "09:00"), end: at(10, "13:00"), capacity: 20,
    tags: { min_age: 12, family: true, setting: "outdoor", gmax: 20, effort: "moderate", tod: "morning", cats: ["community"], summary: "Scrape and repaint a park playground." } },
  { title: "Diaper Drive Sorting", org: "Sample Family Services", city: "Salem", desc: "Sort and bundle donated diapers by size. Ages 8+.", start: at(3, "13:00"), end: at(3, "15:00"), capacity: 12,
    tags: { min_age: 8, family: true, setting: "indoor", gmax: 12, effort: "light", tod: "afternoon", cats: ["community"], summary: "Sort donated diapers for families in need." } },
  { title: "Wheelchair Ramp Build", org: "Sample Home Repair Crew", city: "Santaquin", desc: "Build a wheelchair ramp for a local resident. Some construction experience helpful. Ages 16+.", start: at(8, "08:00"), end: at(8, "15:00"), capacity: 10,
    tags: { min_age: 16, family: false, setting: "outdoor", gmax: 10, effort: "heavy", tod: "morning", cats: ["seniors", "community"], summary: "Build a wheelchair ramp for a resident." } },
  { title: "Library Book Sale Setup", org: "Sample Friends of the Library", city: "Alpine", desc: "Set up tables and sort books for the fall book sale.", start: at(4, "10:00"), end: at(4, "12:00"),
    tags: { min_age: null, family: null, setting: "indoor", gmax: null, effort: "moderate", tod: "morning", cats: ["education", "community"], summary: "Set up tables and sort books for a library sale." } },
  { title: "Past Event: Summer Cleanup", org: "Sample Trails Alliance", city: "Cedar Hills", desc: "This event already happened and should never show up in results.", start: at(-10, "08:00"), end: at(-10, "11:00"),
    tags: { min_age: 8, family: true, setting: "outdoor", gmax: 30, effort: "moderate", tod: "morning", cats: ["environment"], summary: "Past trail cleanup (should be filtered out)." } },
];

let n = 0;
for (const s of samples) {
  n++;
  const id = `sample-${String(n).padStart(3, "0")}`;
  const c = city(s.city);
  // Small offset so projects in one city don't sit on the exact same point.
  const lat = c.lat + ((n % 5) - 2) * 0.004;
  const lng = c.lng + ((n % 3) - 1) * 0.004;
  await db().query(
    `insert into projects (id, url, title, org_name, description, address, city, geo, starts_at, ends_at, recurring, capacity, spots_left, raw, content_hash, status, source)
     values ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography, $10, $11, $12, $13, $13, $14, $1, 'active', 'sample')`,
    [id, `https://www.justserve.org/?sample=${id}`, s.title, s.org, s.desc, `${s.city}, UT`, s.city, lng, lat, s.start, s.end, s.recurring ?? false, s.capacity ?? null, JSON.stringify({ sample: true })],
  );
  const t = s.tags;
  await db().query(
    `insert into project_tags (project_id, min_age, family_friendly, setting, group_min, group_max, effort, time_of_day, categories, summary, tagged_at, model)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), 'hand-written sample')`,
    [id, t.min_age, t.family, t.setting, t.gmin ?? 1, t.gmax ?? null, t.effort, t.tod, t.cats, t.summary],
  );
}
console.log(`Loaded ${samples.length} sample projects.`);
await db().end();

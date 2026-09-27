/**
 * Milestone 0 data spike. Opens JustServe.org in headless Chromium the way a member of the public
 * would, runs a Utah County location search, and records every network request so we can see
 * whether results come from a JSON endpoint.
 *
 * Output: docs/spike-output/ (git-ignored raw captures). Findings get written up in docs/data-spike.md.
 *
 * Politeness: one page at a time, >= 1s between navigations, descriptive User-Agent, no logins.
 *
 *   npm run spike                   # default location "Provo, UT"
 *   npm run spike -- "Orem, UT"
 */
import "./env";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Request, type Response } from "playwright";

const LOCATION = process.argv[2] ?? "Provo, UT";
const OUT = path.join("docs", "spike-output");
const UA = process.env.CRAWL_USER_AGENT || "JustinPilot/0.1 (Utah Area JustServe pilot; unofficial; read-only)";
const EXECUTABLE = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined);

fs.mkdirSync(OUT, { recursive: true });
const pause = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

interface Captured {
  step: string;
  method: string;
  url: string;
  resourceType: string;
  status?: number;
  contentType?: string;
  postData?: string | null;
  bodyFile?: string;
}
const captured: Captured[] = [];
let step = "init";
let bodyCount = 0;

const browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

page.on("request", (req: Request) => {
  if (["xhr", "fetch", "document"].includes(req.resourceType())) {
    captured.push({ step, method: req.method(), url: req.url(), resourceType: req.resourceType(), postData: req.postData() });
  }
});
page.on("response", async (res: Response) => {
  const req = res.request();
  if (!["xhr", "fetch"].includes(req.resourceType())) return;
  const entry = [...captured].reverse().find((c) => c.url === req.url() && c.status === undefined);
  const contentType = res.headers()["content-type"] ?? "";
  if (entry) {
    entry.status = res.status();
    entry.contentType = contentType;
  }
  if (contentType.includes("json")) {
    try {
      const body = await res.text();
      const file = `body-${String(++bodyCount).padStart(3, "0")}.json`;
      fs.writeFileSync(path.join(OUT, file), body);
      if (entry) entry.bodyFile = file;
    } catch {}
  }
});

async function snapshot(name: string) {
  fs.writeFileSync(path.join(OUT, `${name}.html`), await page.content());
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

try {
  step = "robots";
  const robots = await context.request.get("https://www.justserve.org/robots.txt");
  fs.writeFileSync(path.join(OUT, "robots.txt"), `HTTP ${robots.status()}\n\n${await robots.text()}`);
  await pause();

  step = "home";
  await page.goto("https://www.justserve.org/", { waitUntil: "networkidle", timeout: 60_000 });
  await snapshot("01-home");
  await pause();

  // Find a location/search box the way a person would: first visible text input on the page.
  step = "search";
  const input = page.locator('input[type="search"], input[type="text"], input:not([type])').first();
  if (await input.isVisible().catch(() => false)) {
    await input.fill(LOCATION);
    await pause(1200);
    await snapshot("02-typed");
    await input.press("Enter");
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
    await pause(2500);
    await snapshot("03-results");

    step = "scroll";
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 4000);
      await pause(2000);
    }
    await snapshot("04-scrolled");

    step = "detail";
    const firstProject = page.locator('a[href*="/projects/"]').first();
    if (await firstProject.isVisible().catch(() => false)) {
      await firstProject.click();
      await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
      await pause(2000);
      await snapshot("05-detail");
    } else {
      console.log("No project link found on results page — check 03-results.png and adjust selectors.");
    }
  } else {
    console.log("No visible search input on the home page — check 01-home.png and adjust selectors.");
  }
} finally {
  fs.writeFileSync(path.join(OUT, "requests.json"), JSON.stringify(captured, null, 2));
  await browser.close();
}

const apiCalls = captured.filter((c) => c.resourceType !== "document");
console.log(`Captured ${captured.length} requests (${apiCalls.length} xhr/fetch, ${bodyCount} JSON bodies) → ${OUT}/`);
for (const c of apiCalls.filter((c) => c.contentType?.includes("json"))) {
  console.log(`  [${c.step}] ${c.method} ${c.status} ${c.url.slice(0, 160)}`);
}

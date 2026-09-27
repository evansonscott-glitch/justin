# Data spike (Milestone 0)

**Run on September 27, 2026.** This is the go/no-go note for Scott.

## Recommendation

**No-go on running Justin against live JustServe listings.**

The website can be read. A search for Orem returns a clean list of real projects, and the important facts (title, short description, next date and time, and usually a map pin) are there. That part of the idea works.

Two things block turning it on:

1. **JustServe's own terms do not allow this.** The terms of use (the page itself says they were updated April 2, 2021) say you may not use a robot, spider, or other automatic tool to access the site or copy what is on it. They also say material from the site may not be posted on another website without prior written permission, and that use by an organization needs that same permission. Justin would copy listings onto another site on a schedule. That needs a yes, in writing, from JustServe before anyone runs the full download.
2. **Ages and group size are usually missing.** People will text things like "something my 10-year-old can do" or "we have a group of 15." Most listings do not actually say a minimum age or how many volunteers they can take. Justin must not guess. Until a person has looked at a sample of tags and agreed they are right, this is not ready to answer those texts.

Building and testing Justin on the made-up sample projects can continue. Do not point the hourly refresh at justserve.org until the written permission is in hand.

## What was actually run

A public visit to www.justserve.org, the same way a browser does, with no login and no sign-up. Requests were at least 1.1 seconds apart, and each one identified itself as the Utah Area pilot.

- The home page, a Provo search, three more pages of that search, and one full project page.
- The public terms of use.
- A later check of the reader: one Orem search page of 10 projects, plus the full page for the first of those, then thrown away. Nothing from that check was saved into Justin's database.
- The first 100 Orem results were used only to count which facts are present. The full descriptions of five projects were opened the same way. About 436 projects came back as the total. Those 436 full pages were **not** downloaded.

No texts or emails were sent. No account was created. Coordinator names, phone numbers, and email addresses showed up on the full project page; they were not copied into this report or into the database.

## How the site loads projects

You do not have to scrape the page layout. The public search talks to the site's own service and gets a structured list back — the same list the website shows.

- Search: `POST https://www.justserve.org/api/v2/projects/search`
- The public site sends a place name (we used "Orem, UT"), a radius of 25 miles, and a page size. One hundred projects per page works. At that size the Orem search is 5 pages.
- Each project then has its own page: `POST https://www.justserve.org/api/v1/projects/{id}/en-us`
- The search card has the title, a short description, the next date and time, and usually a city and a map pin. The street address and the long description are only on the full project page.
- A link of the form `https://www.justserve.org/projects/{id}` opens the public project page without a login.

The reader in `src/lib/reader/justserve.ts` follows that same path. It waits between requests. It does not store coordinator phone numbers or emails. It treats a map pin of 0,0 as "no location," because that is what the site sends when a pin was never set. It treats a volunteer count of 0 as "no cap was given," not "this project is full."

## robots.txt and the terms of use

robots.txt allows the public project pages. It blocks `/admin/`, `/dashboard/`, `/account/`, and `/attachment/`. It does not list a crawl delay. Those rules were followed. They are not the same thing as permission.

The terms are the blocker. In plain language they say:

- Looking at the site for your own personal, noncommercial use is allowed.
- Automatic tools that access the site or copy it are not allowed.
- Putting material from the site on another website needs written permission first.
- Use by an organization needs that same written permission.

The relevant sentence on the terms page is: "you may not … use any robot, spider, or other automatic device, process, or means to access this Site for any purpose, including, without limitation, for monitoring or copying any of the material on this Site."

## Which facts are actually on the listings

Counts below are from the first 100 projects in an "Orem, UT" search, 25-mile radius, on September 27, 2026. Streets and volunteer caps were checked on 5 full project pages, because the search card does not include them.

| Fact | What we found |
| --- | --- |
| Title | On all 100 |
| Short description | On all 100. 97 were long enough to be a real sentence |
| Next date and time | On all 100 search cards |
| Map pin | On 95 of 100. The other 5 used 0,0, which means "no pin" |
| City name | On 83 of 100 |
| Organization name | On 71 of 100 |
| Indoor or outdoor | A yes/no on every card |
| Street address | On none of the 100 search cards. On 4 of the 5 full pages we opened |
| Minimum age | Not a real field. "Suitable for all ages" is only a yes/no, and "no" does not say whether the line is 8, 16, or 18. A stated age ("ages 8", "adults only") was in 3 of 100 short descriptions, and in 1 of the 5 full pages |
| Group size | A real cap on 2 of the 5 full pages. On the search card the number was missing 69 times, 0 (meaning "no cap") 15 times, and a positive number 16 times. Do not treat 0 as "full" or as "zero spots" |
| "For youth groups" | No on all 100 of the first page. The Kids OK chip cannot use this flag |

Times are Utah local time. The site labels the zone "Mountain Standard Time" even in the summer, when Utah is on daylight time. The clock time itself is still Utah time. A 10:30 AM shift in September is 10:30 AM in Utah (4:30 PM UTC). The reader stores it that way.

## Five real projects

These are public listings we opened. Descriptions and contact details are left out on purpose.

1. **Utah Food Bank (Springville) Volunteer Building Cleaning** — Springville, with a street address. Repeats on Monday, Wednesday, and Friday mornings through next September. Capped at 2 volunteers. The description says adults only (18+).
2. **Gala Event Volunteer** — Orem, with a street address. Two dates (the evening of September 28 and October 2), not a weekly repeat. No volunteer cap. No minimum age stated.
3. **Sewing Angel Apparel (burial gowns)** — The shift is in Provo, with a street address. One evening slot. No cap and no minimum age. The organizer's profile city was in another state, so the reader has to use the shift address, not the profile city.
4. **Help in a Head Start Classroom** — Spanish Fork, with a street address. Ongoing into spring 2027 rather than a single shift. No number of volunteers. No minimum age in the description.
5. **Bingo Helpers** — No street and no map pin on the listing at all. The only place named is the organizer's area, Vineyard. It repeats, and it is capped at 4 volunteers. A guessed city is not the same as an address. Justin should not invent a building for this one.

## How many projects

The Orem search, 25 miles, reported **436 projects**. That radius is the pilot area already written down in `inputs/pilot_area.json` (center on Orem). It covers the Utah County cities in that file. It also sticks a little outside the county: West Jordan showed up once in the first 100. This is "within 25 miles of Orem," not a hand-drawn county line.

A full refresh would be about 5 search requests plus one request per project. At one request a second, that is roughly 8 minutes. That is polite enough technically. It is still the copy the terms do not allow, so it was not run.

## Cost per 1,000 texts

**Not measured.** There is no Anthropic API key in this environment. The tagger, Justin's chat replies, and the chat half of the eval were not run, and no dollar figure was invented. The app is set up to use a small model for tagging and a larger one for chat (`FAST_MODEL` and `CHAT_MODEL` in `.env.example`). Cost can be measured the first time those commands are run with a real key. Keep that first run small.

## Risks

- Running the refresh without written permission conflicts with JustServe's terms.
- Justin will sound sure about ages and group sizes the listing never stated, unless the tagger is forced to leave those blank and a person checks a sample.
- Some listings have no address. A few have no map pin either.
- A zero on "volunteers needed" means "not filled in," not "nobody can come."
- Full project pages include a coordinator's name, phone, and email. Justin does not need those, and the reader throws them away. Do not put them in a spreadsheet or a chat reply.
- The public search hides projects the site considers full. Justin will not see those unless that setting is changed later.
- The 25-mile circle includes a few projects outside Utah County.

## Commands

Offline checks, no model key and no copy of JustServe into the database:

```bash
npm run reader:check
```

One small live read (10 search hits and 1 full project), then discarded:

```bash
npm run reader:check -- --live
```

The original browser spike (Provo search). Raw captures stay in `docs/spike-output/`, which is not committed:

```bash
npm run spike
```

These three need a database (`DATABASE_URL`) and, where noted, `ANTHROPIC_API_KEY` in `.env.local`. They were not run here because the key is not set. Do not run `refresh` until JustServe has given written permission.

```bash
npm run refresh                 # full live copy, then tags if a key is set. Needs permission first.
npm run tag                     # tag projects whose text changed. Needs ANTHROPIC_API_KEY.
npm run tag:check-sheet         # writes evals/tag-check-<date>.csv with 25 projects to mark right or wrong.
npm run eval -- --no-chat       # finder only. Needs the database.
npm run eval                    # finder plus chat replies. Needs ANTHROPIC_API_KEY.
```

The hand-check sheet was not created. There are no tagged live projects to put on it, and making up rows would not be a real check.

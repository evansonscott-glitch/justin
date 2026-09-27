# Justin

Justin, the JustServe Assistant, is an unofficial Utah Area JustServe pilot. It's a search-and-chat layer over public JustServe.org listings. Sign-ups always happen on JustServe.org.

**Status: everything except the live JustServe.org reader is built.** The finder, chat, tagger, health report, admin page and eval harness run locally against about 20 **made-up sample projects**, each badged SAMPLE. The last missing piece is the code that reads JustServe.org (`src/lib/reader/justserve.ts`). It gets written after the Milestone 0 data spike shows how the site loads its results.

## What's here

| Path | What it is |
| --- | --- |
| `src/app/page.tsx` | Web finder: one search box + chips (Near me, This week, Kids OK, Indoor, Group size) |
| `src/app/chat/page.tsx` | Web chat, iMessage-style (blue user bubbles, gray Justin bubbles, link cards) |
| `src/app/api/search` | `GET /api/search?q=&lat=&lng=&date_from=&date_to=&tags=&group=` |
| `src/app/api/chat` | `POST /api/chat {sessionId, text}` |
| `src/app/admin/page.tsx` | Password-protected admin page: searches, unmet searches, health flags, eval results |
| `src/lib/reader/` | Reader pipeline: upsert by JustServe id, mark missing/ended projects inactive, keep history |
| `src/lib/tagger/` | Claude tagger (brief §5 schema), cached by content hash |
| `src/lib/health/` | Nightly listing-health report and the 90-day chat purge |
| `src/lib/eval/`, `scripts/eval.ts` | Eval harness and the simple fact check |
| `src/lib/search/` | Query parsing (Claude, with a keyword fallback) and ranking (brief §6) |
| `src/lib/agent/` | Justin's system prompt, tools, and agent loop (brief §7) |
| `src/lib/messaging/` | `MessagingChannel` adapter; `WebChatChannel` for v0 |
| `config/ranking.json` | Ranking weights and radius settings |
| `db/schema.sql` | Postgres + PostGIS + pgvector schema (brief §5) |
| `inputs/` | Scott's input files (currently templates and drafts) |
| `scripts/spike.ts` | Milestone 0: browses JustServe.org as a public visitor and records network traffic |
| `vercel.json`, `src/app/api/cron/` | Hourly refresh and nightly jobs for Vercel Cron |

## Run it locally

Requires Node 22+ and Postgres 16 with the PostGIS and pgvector extensions.

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL; ANTHROPIC_API_KEY turns on chat and smart parsing
npm run db:setup                  # apply the schema
npm run db:seed-samples           # load the made-up sample projects (npm run db:seed-samples -- --clear removes them)
npm run nightly                   # optional: fill the health report so /admin has something to show
npm run dev                       # http://localhost:3000
```

Without `ANTHROPIC_API_KEY`, the finder still works using keyword parsing, and the chat replies that it isn't connected.

## Jobs

| Command | What it does | Schedule when deployed |
| --- | --- | --- |
| `npm run refresh` | Full refresh from JustServe.org, then tags new or changed projects | Hourly (`/api/cron/refresh`) |
| `npm run tag` | Tags only the projects whose content changed | Part of the refresh |
| `npm run nightly` | Listing-health report and the 90-day chat purge | Nightly (`/api/cron/nightly`) |
| `npm run tag:check-sheet` | Exports 25 random tagged projects to a CSV to hand-check (Milestone 2) | — |
| `npm run eval` | Runs `inputs/test_queries.csv` against JustServe.org, the finder and the chat | By hand |

The first successful refresh deletes the sample projects. Cron routes need `CRON_SECRET`. On Vercel's free Hobby plan, cron jobs may be limited to once a day; if so, the hourly refresh needs a paid plan or an outside scheduler.

## Evals

`npm run eval` writes `evals/results-<date>.md` and saves a copy to the database for the admin page. Hit rates need `good_project_ids` filled in for each row of `inputs/test_queries.csv`. The JustServe.org comparison reads `evals/justserve_baseline.json`, which gets captured once the spike works:

```json
{ "<query text>": { "result_ids": ["<justserve id>", "..."], "latency_ms": 1200 } }
```

The fact check flags chat replies that mention a time, age or street address not found in what the tools returned. It's a coarse check, so read the flagged replies.

## Admin

Set `ADMIN_PASSWORD` and open `/admin`.

## Run the data spike (Milestone 0)

The spike needs outbound network access to `www.justserve.org`.

```bash
npm run spike                     # or: npm run spike -- "Orem, UT"
```

Raw captures are saved to `docs/spike-output/`, which is git-ignored. They include `robots.txt`, page snapshots, every XHR and fetch request, and the JSON response bodies. The findings go in `docs/data-spike.md` for Scott's go/no-go.

## Adding a messaging channel (later)

To add a channel such as `TwilioChannel`:

1. Implement `MessagingChannel` from `src/lib/messaging/channel.ts`.
2. Wire it up the same way `webChat()` is wired in `src/lib/agent/service.ts`.
3. Use `cardsAsText()` to turn project cards into short text with links.

The agent itself doesn't change.

## Ground rules built in

- **Public data only.** The crawler reads public pages without logging in, identifies itself, and waits at least 1s between pages.
- **No personal data.** Session IDs are random, and chat stores messages only, with no names, phones or emails. The nightly job deletes messages after 90 days.
- **Facts come from listings.** Justin states project facts only from tool results and links every project to JustServe.org.
- **Adults only.** If someone says they're under 18, Justin kindly suggests they ask a parent or leader, then ends the chat.
- **Unofficial label.** Every page shows: "Justin is an unofficial Utah Area JustServe pilot. Sign-ups happen on JustServe.org."

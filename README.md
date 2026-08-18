# Arsenal World Cup Hub — The Gunners at the World Cup

**Live:** https://arsenal-world-cup-hub-psi.vercel.app

A hub that tracks **Arsenal FC players competing for their national teams at the FIFA World Cup 2026**, skinned to match arsenal.com. 15 Gunners, 9 nations, one north-London lens on the world's biggest tournament.

> Built for a hackathon. Live data is "live-first with a demo-safety snapshot fallback" so the demo never shows a blank screen (see [Demo safety](#demo-safety)).

## Production integrations

| Sponsor | Where it's used | What it does |
|---|---|---|
| **Bright Data** | optional Ask web-search tool | Used only when `BRIGHTDATA_API_TOKEN` is configured. The deployed app reports the missing provider instead of presenting snapshot data as live search. |
| **OpenRouter** | Ask · Oracle · Briefing | Runs the live desk agent, writes the inspectable Oracle proposal, and generates the briefing. |
| **Azure PostgreSQL** | all fresh AI/search runs | Durable audit records plus per-requester public-demo cost bounds. |
| **Verified runner** | Player Oracle | A bounded TypeScript Monte-Carlo engine computes 20,000 matches; no unavailable sandbox is claimed. |
| **VideoDB** | Arsenal Goals | YouTube goal compilations ingested + spoken-word indexed; semantic search returns matching moments stitched into a playable HLS supercut. |

## The five modules

1. **Gunners Today** (`/`) — player-first grid of the 15 Gunners with real arsenal.com headshots and a three-state status badge (LIVE / KO / FT), a navy hero with live stats, and All / In action / By nation filters.
2. **Ask the Gunners Desk** (`/ask`) — streaming OpenRouter chat with two tools — `squadInfo` (the roster) and optional `searchWeb` (Bright Data) — and a **visible tool-trace** so you watch it work.
3. **Player Oracle** (`/oracle`) — pick a Gunner → the live model writes an inspectable Monte-Carlo proposal → a bounded server runner computes win/draw/loss probability and expected impact.
4. **Arsenal Goals** (`/goals`) — semantic search over Gunner goal highlights via **VideoDB**; matching commentary moments are compiled into a playable supercut.
5. **Daily Gunners Briefing** (`/briefing`) — OpenRouter writes a recap of the Gunners' day from the tracker snapshot.

## Architecture

- **Next.js 16** (App Router, Turbopack) · **React 19** · **Tailwind v4** · **AI SDK v6** (`ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`).
- Server-only secrets live in API route handlers (`app/api/*`); client pages never import the sponsor clients.
- Model access: `lib/ai.ts` (OpenRouter through the AI SDK). Optional web search: `lib/brightdata.ts`.
- Azure PostgreSQL stores run inputs/results, enforces per-requester cost bounds, and honors optional `Idempotency-Key` replay before quota checks.
- Data: `lib/gunners.ts` (typed snapshot) → `lib/feed.ts` (`getGunnersToday()` live-first + fallback).
- Design system exported from the Paper mock → `docs/design/arsenal-design-system.md`.

## Setup

```bash
cp .env.example .env.local   # fill in the sponsor keys (see below)
npm install
npm run dev                  # http://localhost:3000
```

Required env vars (`.env.local`):

```
OPEN_ROUTER_API_KEY=      OPENROUTER_MODEL=
BRIGHTDATA_API_TOKEN=     BRIGHTDATA_SERP_ZONE=     BRIGHTDATA_UNLOCKER_ZONE=
VIDEO_DB_API_KEY=
DATABASE_URL=              ARSENAL_REQUEST_SALT=
```

### One-time data prep (already run; included in the repo)

```bash
node --env-file=.env.local scripts/scrape_player_imgs.mjs   # headshots → public/players/, urls → data/player_img_urls.json
node --env-file=.env.local scripts/ingest_highlights.mjs    # ingest Gunner goal clips into VideoDB
node --env-file=.env.local scripts/preflight/<sponsor>.mjs  # smoke-test any sponsor
```

## Demo script (~4 min)

1. **Gunners Today** — 15 Gunners, real headshots, the live/kickoff/FT badges; filter "In action".
2. **Ask** — "Which Arsenal players represent Spain?" → watch the roster tool-trace, then the live model answer. Use a current-news prompt only when Bright Data is configured.
3. **Oracle** — pick Saka → OpenRouter writes an inspectable proposal, then the bounded built-in TypeScript Monte-Carlo runner computes win probability + xG.
4. **Goals** — search "free kick" → VideoDB finds moments across videos and plays the supercut.
5. **Briefing** — the auto-written daily recap.

## Demo safety

It's only ~2 days into the group stage, so a live window may have **no** Gunner on the pitch. The hub never depends on that:

- The grid renders a curated **snapshot** (`data/arsenal_wc_squad.json` / `lib/gunners.ts`) that doubles as the showcase; `?demo=1` forces it.
- LIVE is an opportunistic overlay only when a match is truly in progress.
- The other four modules don't need a live match to demo.
- Each API route degrades gracefully (e.g. the Oracle falls back to a known-good simulation template if codegen fails).

## Notes

- WC 2026 fixtures/opponents in the mock are illustrative; real fixtures are wired at the data layer.
- Arsenal Goals uses real Arsenal goal compilations as stand-ins (the WC 2026 goals haven't happened yet).

# Arsenal World Cup Hub — The Gunners at the World Cup

**Live:** https://arsenal-world-cup-hub.vercel.app

A hub that tracks **Arsenal FC players competing for their national teams at the FIFA World Cup 2026**, skinned to match arsenal.com. 15 Gunners, 9 nations, one north-London lens on the world's biggest tournament — with five AI/data sponsors doing real work on every screen.

> Built for a hackathon. Live data is "live-first with a demo-safety snapshot fallback" so the demo never shows a blank screen (see [Demo safety](#demo-safety)).

## The five sponsors (and where each does real work)

| Sponsor | Where it's used | What it does |
|---|---|---|
| **Bright Data** | Ask the Gunners Desk · player headshots | Live Google SERP + Web Unlocker. The Ask agent calls it as a tool for current scores/news; the squad headshots were scraped from arsenal.com through the Unlocker. |
| **OpenRouter** | Ask · Oracle · Briefing | Runs the live desk agent, writes the inspectable Oracle proposal, and generates the briefing. |
| **Azure PostgreSQL** | all fresh AI/search runs | Durable audit records plus per-requester public-demo cost bounds. |
| **Verified runner** | Player Oracle | A bounded TypeScript Monte-Carlo engine computes 20,000 matches; no unavailable sandbox is claimed. |
| **VideoDB** | Arsenal Goals | YouTube goal compilations ingested + spoken-word indexed; semantic search returns matching moments stitched into a playable HLS supercut. |

## The five modules

1. **Gunners Today** (`/`) — player-first grid of the 15 Gunners with real arsenal.com headshots and a three-state status badge (LIVE / KO / FT), a navy hero with live stats, and All / In action / By nation filters.
2. **Ask the Gunners Desk** (`/ask`) — streaming chat. Kimi (via TokenRouter) with two tools — `squadInfo` (the roster) and `searchWeb` (Bright Data) — and a **visible tool-trace** so you watch it work.
3. **Player Oracle** (`/oracle`) — pick a Gunner → the live model writes an inspectable Monte-Carlo proposal → a bounded server runner computes win/draw/loss probability and expected impact.
4. **Arsenal Goals** (`/goals`) — semantic search over Gunner goal highlights via **VideoDB**; matching commentary moments are compiled into a playable supercut.
5. **Daily Gunners Briefing** (`/briefing`) — Kimi auto-writes a recap of the Gunners' day from the live tracker.

## Architecture

- **Next.js 16** (App Router, Turbopack) · **React 19** · **Tailwind v4** · **AI SDK v6** (`ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`).
- Server-only secrets live in API route handlers (`app/api/*`); client pages never import the sponsor clients.
- Model access: `lib/ai.ts` (TokenRouter provider). Sponsor clients: `lib/brightdata.ts`, `lib/daytona.ts`.
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
TOKENROUTER_API_KEY=      TOKENROUTER_BASE_URL=https://api.tokenrouter.com/v1   TOKENROUTER_MODEL=
BRIGHTDATA_API_TOKEN=     BRIGHTDATA_SERP_ZONE=     BRIGHTDATA_UNLOCKER_ZONE=
DAYTONA_API_KEY=
VIDEO_DB_API_KEY=
MOONSHOT_API_KEY=         # direct Kimi (optional; app routes models through TokenRouter)
```

### One-time data prep (already run; included in the repo)

```bash
node --env-file=.env.local scripts/scrape_player_imgs.mjs   # headshots → public/players/, urls → data/player_img_urls.json
node --env-file=.env.local scripts/ingest_highlights.mjs    # ingest Gunner goal clips into VideoDB
node --env-file=.env.local scripts/preflight/<sponsor>.mjs  # smoke-test any sponsor
```

## Demo script (~4 min)

1. **Gunners Today** — 15 Gunners, real headshots, the live/kickoff/FT badges; filter "In action".
2. **Ask** — "What's the latest World Cup 2026 news?" → watch the Bright Data tool-trace, then the answer.
3. **Oracle** — pick Saka → Kimi writes the sim, Daytona runs it → win-probability chart + xG. Expand the generated code.
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

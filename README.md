# JEV City

**The little city with big decisions.** 25 citizens live in an illustrated isometric district. Every time one of them decides what to do next — keep to their routine, go home, shelter, help a neighbor, get supplies, report for duty, or wait — that decision comes from [TypeSafe JEV](https://docs.typesafe.ai). Click anyone to see exactly what JEV returned: the full choice distribution, two rubric scores, a yes/no probability, and the measured latency.

Three scenarios: **Ordinary Morning**, **Citywide Blackout** (dusk, the grid fails) and **Meteor Near the Market**.

## Honesty rules
- **Recorded Replay** (default) plays back real `jev-1.13.0` decisions captured earlier. It makes no live calls and labels timings as historical.
- **Live JEV** calls the API through a guarded server proxy; timings are measured per request.
- **Rules** is a hand-written heuristic baseline, labeled as such — never shown as model probabilities.
- If live calls fail, the city falls back to rules and says so on screen.

Measured so far: 1,509/1,509 valid live decisions, p50 94 ms, p95 167 ms upstream ([details](docs/PHASE0-RESULTS.md)).

## Run locally
```bash
npm install
cp .env.example .env.local   # add TYPESAFE_API_KEY; set JEV_LIVE_ENABLED=true for live mode
npm run dev
```

| Command | What it does |
|---|---|
| `npm test` | Determinism, feasibility, contract and proxy-security tests |
| `npm run record` | Re-capture replays with live JEV (~1,500 calls, ≈ $0.06) |
| `npm run build` | Production build |

## Architecture
- `src/sim/` — deterministic simulation (seeded, fixed 100 ms tick). The engine computes which actions are *feasible*; JEV only chooses among them. Movement, hazards and consequences are ordinary code.
- `src/jev/` — strict decision contract, server-only JEV client, shared budget.
- `src/app/api/decision` — the only route that can spend money.
- `src/client/` — PixiJS renderer and the controller that feeds decisions from replay, live JEV or rules.
- `docs/` — PRD, decision contract and visual direction (product/architecture by ChatGPT; implementation by Claude Code).

## Deploying to Vercel
Set `TYPESAFE_API_KEY`, `JEV_LIVE_PASSCODE` and an Upstash Redis integration before setting `JEV_LIVE_ENABLED=true`. Without Redis, production live mode fails closed and the public site runs on recorded replays.

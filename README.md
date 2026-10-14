# JEV City

**The little city with big decisions.** 25 citizens live in an illustrated isometric district. Every time one of them decides what to do next — keep to their routine, go home, shelter, help a neighbor, get supplies, report for duty, wait, get medical care, move away from danger, check on family, warn others, join a festival, restore power or direct traffic — that decision comes from [TypeSafe JEV](https://docs.typesafe.ai). Click anyone to see exactly what JEV returned: the full choice distribution, two rubric scores, a yes/no probability, and the measured latency.

Eight scenarios: **Ordinary Morning**, **Citywide Blackout** (dusk, the grid fails), **Meteor Near the Market**, **Office Fire** (smoke → flames → fire engine), **Street Festival** (Saturday evening on the plaza), **Flash Flood** (water rises in the low streets), **Meteor Strike + Power Failure** (a cascading incident) and **Big City Blackout** (100 citizens on a 44×44 map).

Power never comes back on a timer (sim v7): utility staff who choose *restore power* drive a van through deterministic traffic and do the repair; a backup crew drives in later if nobody does. Responders who choose *direct traffic* turn a dark all-way stop back into a flowing junction (measured ~3.5× throughput).

Decisions have consequences (sim v6): a warning reaches the people it was given to and changes what they know next; a family search uses only where a housemate *said* they'd be; responders who report for duty put the fire out sooner; nurses who report in add clinic beds. Every step is labeled in the inspector's *Why did the world change?* trail as a JEV decision, simulation logic or a safety rule.

## Honesty rules
- **Recorded Replay** (default) plays back real `jev-1.13.0` decisions captured earlier. It makes no live calls and labels timings as historical.
- **Live JEV** calls the API through a guarded server proxy; timings are measured per request.
- **Rules** is a hand-written heuristic baseline, labeled as such — never shown as model probabilities.
- If live calls fail, the city falls back to rules and says so on screen.

Measured so far (sim v7 recordings, 8 scenarios): 4,902/4,902 valid live decisions, p50 97 ms, p95 140 ms upstream ([details](docs/PHASE0-RESULTS.md)).

## Run locally
```bash
npm install
cp .env.example .env.local   # add TYPESAFE_API_KEY; set JEV_LIVE_ENABLED=true for live mode
npm run dev
```

| Command | What it does |
|---|---|
| `npm test` | Determinism, feasibility, contract and proxy-security tests |
| `npm run record` | Re-capture replays with live JEV (~4,900 calls, ≈ $0.22) |
| `npm run build` | Production build |

## Architecture
- `src/sim/` — deterministic simulation (seeded, fixed 100 ms tick). The engine computes which actions are *feasible*; JEV only chooses among them. Movement, hazards and consequences are ordinary code.
- `src/jev/` — strict decision contract, server-only JEV client, shared budget.
- `src/app/api/decision` — the only route that can spend money.
- `src/client/` — PixiJS renderer and the controller that feeds decisions from replay, live JEV or rules.
- `docs/` — PRD, decision contract and visual direction (product/architecture by ChatGPT; implementation by Claude Code).

## Deploying to Vercel
Set `TYPESAFE_API_KEY`, `JEV_LIVE_PASSCODE` and an Upstash Redis integration before setting `JEV_LIVE_ENABLED=true`. Without Redis, production live mode fails closed and the public site runs on recorded replays.

## License
MIT. See [LICENSE](LICENSE).

# JEV City — Lean MVP Product Requirements Document

**Version:** 0.1 • **Date:** 2026-10-13 • **Status:** Proposed for Claude Code review  
**Owner:** Product/architecture (ChatGPT) • **Implementation:** Claude Code • **Approver:** Product owner

## 1. Goal

Build a public, browser-based, visually compelling **25-citizen decision simulation** demonstrating how TypeSafe JEV makes typed, context-sensitive decisions in a changing world. The user watches individual citizens respond differently to events and inspects exactly what JEV returned. The demo does **not** claim JEV controls animation, navigation, or world physics.

**Primary success question:** Can visitors see real, differentiated agent decisions, inspect their inputs and outputs, and distinguish measured JEV performance from replay/scripted activity?

**Audience:** developers, AI product builders, technical creators, and demo viewers.

## 2. MVP boundaries

**In scope**
- One bounded isometric city district with roads, houses, market, clinic, emergency shelter, workplaces, and safe walking paths.
- Exactly **25 initialized citizens** per run, seeded and individually identifiable. Recommended roles: 17 residents/commuters, 4 retail/service workers, 2 healthcare workers, 2 emergency responders. Each has stable ID, home/workplace, personality traits, current needs and short memory.
- Three scenarios (see §3); start, pause, reset, speed adjustment, time-of-day toggle.
- Live vs **Recorded Replay** mode displayed conspicuously; replay is the default for public visitors.
- A click-to-inspect citizen drawer with state summary, eligible actions, provider decision, complete choice distribution, two rubric scores, a Noul, enacted action, and provenance (live/recorded/fallback).
- Event feed showing incident, citizen action, and causal effect; small metrics panel with calls, measured latency, provider-reported token usage, and estimated API spend computed using a recorded provider tariff.
- Deterministic movement and world updates. Decision adapters: JEV, rule-based baseline; a conventional LLM baseline is Phase 0 evaluation / optional private benchmark, not required in public MVP.
- Vercel-hosted Next.js app with PixiJS client rendering; serverless decision API, strictly bounded usage, no exposed provider credentials.

**Out of scope**
- Multiplayer, user-generated citizen names/prompts, real-world maps, persistent accounts, speech, generated stories, economics/markets, combat, crowdsourced live traffic, >25 simultaneous agents, physical meteor simulation, fully general agent planning, guaranteed scientifically calibrated personalities.
- Cost/performance claims based on documentation alone or a few cherry-picked calls.

## 3. Scenarios and scripted world rules

The three presets initialize from documented seeds and reset the entire world. Each contains preauthored **world events**; individual reactions come from JEV when Live mode is enabled, or from recorded JEV outputs in Replay mode.

1. **Ordinary Morning** — The district is operational. Citizens commute, shop, work, rest, and interact. Purpose: establish a behavioral baseline and readable movement. A citizen's available action list is restricted to meaningful actions for their state.
2. **Citywide Blackout** — Lights go out, some businesses close, a clinic remains a safe facility, and a few citizens require assistance. Purpose: show heterogeneous responses (shelter, assist, return home, duty, wait). Power loss and business closures are **deterministic scenario rules**, not JEV predictions.
3. **Meteor Near the Market** — A localized, **predefined** hazard zone appears with dust/lighting effects, path closures, stranded citizens, and responders. Purpose: high-impact visual demonstration. Impact radius, blocked tiles, and responder availability are deterministic; JEV judges which of the currently **feasible** actions each citizen takes. No gore, combat, procedural destruction, or real physics claims.

## 4. End-user journey

1. Visitor opens a polished city overview with a running **Recorded Replay** and a clearly visible mode label. No live paid calls merely from viewing the page.
2. Visitor chooses a scenario and presses Start. City animates and the event feed updates.
3. Visitor clicks a moving citizen. Inspector freezes the latest available decision snapshot (without freezing the world) and shows: name/role, local facts, choice probabilities, model top choice, executed action, two scores and their rubric distributions, Noul value, event time, provider/model and measured provenance.
4. Visitor changes scenario or time of day and can pause/reset/speed up.
5. If Live mode is available, visitor explicitly requests a limited live session; the UI displays allowance remaining. Exhaustion or API failure cleanly switches to replay/fallback and labels that change; never quietly calls the result 'live JEV'.

## 5. Functional requirements and acceptance criteria

| ID | Requirement | Acceptance test |
|---|---|---|
| F01 | Seeding and scenario reset | Same seed + scenario + action log produces the same citizen positions/events on two replays (snapshot assertions). All three scenarios start with 25 unique IDs. |
| F02 | All actions physically plausible | A shared `getEligibleActions(world,citizen)` function excludes unreachable, unavailable, or role-inappropriate actions. Across fixture suite, executed action is always in the eligible set and pathfinding never crosses blocked tiles. |
| F03 | JEV typed contract | Proxy creates its own `model/state/questions`, calls official `/v1/systemone`, validates response, rejects unexpected/missing/non-finite values and unknown options, logs requested/resolved model. See `JEV-DECISION-CONTRACT.md`. |
| F04 | Full decision inspection | For every executed JEV decision, inspector displays all returned Choice probabilities, two Score distributions, Noul, raw top choice, enacted action, and sampling/fallback status. Percentages are explicitly marked rounded. |
| F05 | Simulation consequences | Blackout changes light + available venues; meteor blocks predefined roads + causes deterministic hazard avoidance. Actions change positions/state and are visible in event feed. |
| F06 | Live/replay distinction | Initial public page load makes zero upstream JEV calls. Replay mode never calls JEV. UI marks events and telemetry as Live, Recorded, Rules, or Fallback. No invented timings or costs. |
| F07 | Security and budgets | Secrets absent from browser bundles and responses. Bounded and validated request payloads, server-owned criteria, shared atomic daily/session budgets, IP throttling, timeout, fallback, and server-side kill switch are covered by integration tests. |
| F08 | Responsiveness | Map + inspector usable at desktop 1280×800; tablet 768px view has accessible inspector. Citizens are individually selectable by pointer; inspector controls keyboard accessible. |
| F09 | Visual readability | Day and night have materially different lighting but role markers, hazards, selection outlines, and accessible UI text remain identifiable in both modes. |
| F10 | Operational quality | Clean lint/typecheck/build, deterministic unit tests and API contract tests. On a documented reference desktop, 25 citizens maintain >=30 FPS during scripted replay for >=95% of frames over a two-minute test; report hardware/browser. |
| F11 | Honest benchmark display | Only measured results appear in performance panels; each metric includes source, sample size, mode, run time and model ID. If no valid live samples exist, show `Not measured` instead of a default number. |
| F12 | Error resilience | Simulate 401, 422, 429, 529, timeout, malformed response and budget exhaustion; gameplay remains usable and falls back with clearly visible source label. |

## 6. Minimal domain model

- `World`: scenario, seed, simulated time, map walkability, outage/hazard regions, venues, event queue.
- `Citizen`: id, role, traits (e.g., sociability, altruism, caution), needs (fatigue, supplies), position, home/work, memory summary, action cooldown, current goal.
- `DecisionSnapshot`: citizen ID, simulated timestamp, compact world/citizen facts, **eligible** action IDs, question-contract version.
- `DecisionResult`: provider, actual model version, answered questions, top choice, sampled/enacted choice, provenance, latency, input/output tokens, tariff version, scenario/seed, decision ID.
- `ReplayLog`: versioned scenario/seed + ordered snapshots, decisions, world event timestamps, engine/model metadata. Keep personally identifying visitor data out.

## 7. Behavioral model and determinism

- Fixed simulation tick (recommend 100 ms logical tick), rendering interpolates positions with `requestAnimationFrame`.
- Citizen decisions occur on **events** (incident, reached destination, need threshold) with a cooldown (initial design: no more than one candidate decision per 20 simulated seconds/citizen). Tune after real throughput data.
- The engine computes eligible actions *before* calling any provider. JEV chooses only from those candidates. Never let JEV issue arbitrary coordinates, tool calls or executable scripts.
- For diversity, optional **seeded sampling** from returned Choice probabilities. Display `model_top_choice` and `enacted_choice` separately; log sample seed and rule. If no sampling enabled, enact top choice. Emergency safety/path gating still overrides action and is labeled as a guardrail.
- Keep deterministic hazard rules and any citizen override separate from model output. NPCs do not need a JEV call on every animation frame.

## 8. Nonfunctional and deployment constraints

- Next.js App Router; PixiJS loaded client-side only to avoid SSR browser globals. Public deployment on Vercel.
- `/api/decision` is **not** a generic provider proxy: accepts only a bounded, strict application DTO and constructs official JEV questions on the server. Defend against API key leakage, uncontrolled prompt sizes, arbitrary criteria, repeat requests, and bypassing session quotas.
- Use a shared durable/atomic limiter and budget store (e.g., Upstash Redis) across Vercel functions; in-memory counters are inadequate. Use a per-session/IP rate limit *and* a global daily cap; reserve allowance before the provider call, count retries within the budget, and fail closed on store failure. Set account/provider spend alerts and a manual kill switch as a second line of defense.
- Do not assume Vercel serverless processes own durable world state. Client owns one local, deterministic session; server validates the bounded input and governs cost. No synchronization across visitors in MVP.
- No provider key in `NEXT_PUBLIC_` variables; use `TYPESAFE_API_KEY` server-side. CORS origin checks and CSRF protection for spend-triggering endpoints; secure session cookie/token. Public replay assets can be static.

## 9. Measurement and comparison: no fabricated metrics

- Separate **client-end-to-end time** (click/request → response) from **server-to-JEV round-trip time** and local rule compute time; report them by name. Never label HTTP time as raw model inference time.
- For each JEV request record: actual resolved `model`, status, server `performance` duration, browser duration if available, input/output tokens returned by provider, code version, payload-size bucket, retries, scenario/citizen snapshot ID, time stamp, cache/replay flag.
- Compute p50/p95 only from actual per-request samples and show `n`; display failures/timeouts separately, and identify warmup/cold-start handling. Exclude replay, caches, fallback, mock data, and unsuccessful calls from successful-call latency distributions. Do not hide their frequency.
- For a formal benchmark, save a fixed suite of >=60 representative citizen snapshots across three scenarios. Run all engines against the **same state, eligible actions and required fields**, with repeated trials and separate rate caps. Include rule baseline, JEV and optional LLM baseline using validated structured output. Report action feasibility and independent human-rated scenario consistency; do not claim an objective 'correct' personality decision without a rubric.
- Show USD **estimated from actual provider-reported input tokens multiplied by the applicable documented tariff** and label it `token-based estimated API cost`; true invoiced cost requires provider/account reconciliation. Separate infrastructure and LLM expenses; never present price estimates as billed amounts.
- Benchmarks must not modify the production public demo budget; run with a separate account/key/budget or an isolated quota.

## 10. Delivery gates

**Phase 0 / Go–No-Go** (must pass before rich art): confirm TypeSafe credentials and at least one real direct-API request; validate all typed response shapes; run 25 different citizen snapshots; verify quotas, rate limiter and log records; establish baseline measurements with actual samples; report failure modes and current provider limits. Do not choose Go solely from marketing latency claims. Decision-maker approves actual results.

**Phase 1 / Playable MVP:** deterministic city + 25 citizens + three scenarios + replay + decision inspector + guarded live JEV mode + tested budgets + traceable metrics.

**Phase 2 / Optional:** LLM comparison in public, extra citizen roles, richer simulations, audience-controlled events, 100+ agents. No Phase 2 work before Phase 1 acceptance.

## 11. Open design choices for Claude to challenge

- Should live mode require an authenticated admin passcode initially, given public demo cost exposure? **My default: yes**, then open limited anonymous sessions after observing actual request usage.
- Is 100 ms logical tick appropriate for chosen map size and PixiJS animation? Benchmark; adjust without changing semantic decision frequency.
- Is meteor visually affordable without undermining clarity or spending weeks on art? Keep impact as tiles + shaders/particles, not physics/destruction.
- Is sampling useful or does top-choice-only produce sufficient diversity with individualized traits? Decide using a controlled experiment and retain provenance either way.

## References (canonical)

- TypeSafe API: https://docs.typesafe.ai/api
- TypeSafe models and versioning: https://docs.typesafe.ai/models
- TypeSafe primitives: https://docs.typesafe.ai/primitives
- Vercel Redis: https://vercel.com/docs/redis
- Vercel rate limiting: https://vercel.com/kb/guide/add-rate-limiting-vercel

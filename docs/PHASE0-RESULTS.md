# Phase 0 — Go/No-Go results

**Recommendation: GO.** Measured 2026-10-13/14 against the official TypeSafe endpoint (`POST https://api.typesafe.ai/v1/systemone`), model pinned to `jev-1.13.0`. All numbers below are real upstream round-trips measured from a developer laptop (server-side `performance.now()` around `fetch`), not browser time.

| Run | Requests | Valid | Failed | p50 | p95 | Max | Mean tokens (in / out) |
|---|---|---|---|---|---|---|---|
| Spike (300 ticks × 3 scenarios) | 196 | 196 | 0 | 92 ms | 174 ms | 226 ms | 946 / 110 |
| Full replay capture (2,400 ticks × 3) | 1,509 | 1,509 | 0 | 94 ms | 167 ms | 406 ms | 942 / 109 |

Raw spike output: `docs/phase0-results.json`. Replays: `public/replays/*.json` (every decision keeps its own measured timing and capture time).

## Contract findings
- Response shapes match `JEV-DECISION-CONTRACT.md` exactly: Choice (`choice`, `probabilities`, `confidence`), Score (`score` 0–3 weighted, `legend`, `probabilities`, `confidence`), Noul (`noul`, no confidence), `usage` tokens. Zero contract violations in 1,705 calls.
- `response.model` resolves to `jev-1.13.0` for every call.
- Distributions are informative: only ~6–8% of choices had a top probability ≥ 0.95, so the inspector shows genuine splits rather than 100/0/0.
- One request carries all four questions; no extra network calls.

## Cost
Tariff (docs.typesafe.ai/models, 2026-10-13): **$0.042 per 1M input tokens, output free.** ≈ 940 input tokens/decision → ≈ $0.00004 per decision; the entire 1,509-decision recording ≈ $0.06 (token-based estimate, not an invoice). Published limits: 80 req/s, 100K tokens/s.

## Things we learned / changed
- OpenRouter's `typesafe/jev-router` is **not** JEV decisions: it routes to another LLM (DeepSeek in our test), broke the JSON schema 3/3 times and cost ~10× more. Excluded from all JEV claims.
- Original `seek_supplies` gate was too permissive (JEV picked it ~35% of the time). Now gated on supply need ≥ 0.55.
- The meteor initially left in-flight paths crossing the new closure — caught by test F02, fixed by re-routing on impact.
- Determinism: decisions apply at a fixed logical think-time (4 ticks = 400 ms sim time). If a live response is late the sim waits rather than diverging, so live runs can be recorded and replayed exactly.

## Security posture (F07)
Kill switch (`JEV_LIVE_ENABLED`), passcode (required in production), same-origin check, 4 KB body cap, strict Zod DTO, server-built questions/criteria/model, shared atomic budget (Upstash Redis; production fails closed without it), 429/529 single retry counted against budget, 5 s timeout, no key in client bundle or responses. Covered by `tests/api.test.ts`.

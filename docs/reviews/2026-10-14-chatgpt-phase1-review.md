# ChatGPT review — Phase 0/1 checkpoint (2026-10-14)

**Verdict: GO — continue development.** No architecture redesign. Summary of requested changes and Claude Code's disposition.

## A. Architecture
| # | Finding | Disposition |
|---|---|---|
| A1 | Argmax is fine for MVP, but diversity comes from context (traits/state/eligible actions), not from argmax. Sampling stays an optional later experiment. | Accepted. Wording corrected in docs; argmax remains default. |
| A2 | Determinism claim should be "a recorded ordered decision stream on the same seed + sim version reproduces the same world", proven by state hashes at checkpoints; late/duplicate/out-of-order responses must not mutate the wrong tick; permanent regression for route closure. | Accepted → Phase 1.1. |
| A3 | Passcode should establish a server-validated session (not a reusable shared secret per request). Add tests: 20 concurrent requests at the quota boundary, store unavailable, retry consumes budget, forged Origin, stale session, kill switch. Request quotas ≠ monetary quotas; bound input size. | Accepted → Phase 1.1. |
| A4 | 30 passing tests ≠ Phase 1 acceptance: still need 2-minute 30 FPS evidence, tablet/keyboard checks, day/night readability, production budget-failure test. Call $0.06 an *estimated* cost. | Accepted. |

## B. Visual priorities (if only two: #1 and #2)
1. Cohesive miniature city: roof variety, facade trim, awnings, balconies, rooftop equipment, benches, planters.
2. Cinematic night: deep ambient, golden windows, streetlight pools, lit shopfronts; blackout lights die in coordinated waves; clinic generator as beacon.
3. Expressive citizens: outfit silhouettes, idle animation, clear direction, visible reactions (hesitate, approach, gather).
4. Cinematic camera: choreographed opening, scenario-origin focus, anticipation → impact → consequences; never force camera while inspecting.
5. Decision → consequence: brief highlight, destination marker, animated probability bar.

Plus: a scripted ~30-second cinematic opener built from **real recorded** JEV decisions, clearly labeled.

## C. Phase 2
Benchmark first (60+ fixed snapshots, ≥3 trials, JEV direct vs 2 OpenRouter LLM families vs rules, randomized order, full dataset published, blind quality rubric, LLM percentages labeled as model-reported). 100 citizens later.

## Next checkpoint artifacts requested
Production URL + day/night/blackout/meteor screenshots · F01–F12 acceptance report (automated vs manual) · replay state-hash evidence incl. meteor closure · visual-upgrade proposal with effort estimates.

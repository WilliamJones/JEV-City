# Phase 1 acceptance report (F01–F12)

Status as of 2026-10-14. **Auto** = covered by `npm test` (41 tests). **Manual** = verified by driving the app in Chrome; evidence noted.

| ID | Requirement | How verified | Status |
|---|---|---|---|
| F01 | Seeding & reset; 25 unique IDs | Auto: identical state for same seed/decisions; each recording replays with **identical state hashes at 8 checkpoints** and identical applied-decision order (1,509 decisions) | ✅ |
| F02 | Plausible actions; paths never cross blocked tiles | Auto: eligibility invariants across 1,500 ticks × 3 scenarios; route-closure regression (mid-step citizen re-planned before entering the crater) | ✅ |
| F03 | Typed JEV contract | Auto: DTO rejects extra fields/unknown actions/out-of-range; server rebuilds questions; malformed 200 = failure (8 cases). Live: 0 contract violations in 2,000+ real calls | ✅ |
| F04 | Full decision inspection | Manual: inspector shows all choice probabilities, top vs enacted, both score distributions, noul, provenance, rounded-percent notice | ✅ |
| F05 | Consequences | Auto: blackout toggles + stranded citizens; meteor blocks tiles. Manual: venues close, lights fail, traffic queues at closure | ✅ |
| F06 | Live/replay distinction; zero calls on load | Manual: default mode is Recorded Replay; replay path never calls `/api/decision`; every decision labeled Live/Recorded/Rules/Fallback; timings marked historical | ✅ |
| F07 | Security & budgets | Auto: kill switch, same-origin, HMAC session (forged/expired rejected), body cap, strict DTO, global/IP/session caps, **20 concurrent requests at the cap → exactly 5 succeed**, store outage → no provider call, prod fails closed without Redis/secret/passcode | ✅ (prod Redis test pending deploy) |
| F08 | Desktop 1280×800; tablet; keyboard | Manual: layout verified at 1456×816; citizen list + inspector are keyboard-operable (buttons, Esc closes, Space pauses). Tablet: stacked layout via `lg:` breakpoint | ⚠️ tablet visual check pending on deployed URL |
| F09 | Day/night readability | Manual screenshots: day, night, blackout, meteor; citizens get a rim-light tint at night; hazards use outline + cones + hatch, not color alone | ✅ |
| F10 | ≥30 FPS for ≥95% of frames over 2 min | Measured: 2 × 7,200 frames (meteor day, blackout night), 25 citizens + traffic + FX: mean 1.1 ms, **p95 2.3 ms, p99 2.9 ms per frame; 99.99–100% under 33 ms**. Host: Apple Silicon Mac, 10 cores, Chrome 154, WebGL, 1699×1126 canvas @1×. CPU+submit time; GPU time not isolated | ✅ |
| F11 | Honest metrics | Manual: panels show `Not measured` without samples; replay stats labeled historical with capture date and `n`; cost labeled token-based estimate | ✅ |
| F12 | Error resilience | Auto: 401/422/429/529/timeout/malformed/budget exhaustion each return a labeled failure; client falls back to rules and shows a FALLBACK banner | ✅ |

## Also delivered
- Guided opener built only from real recorded decisions (test-enforced: split distributions, distinct citizens/actions, ≥6 sim-minutes apart).
- Benchmark (Phase 2A): `/benchmark`, 540 measured calls, full dataset at `/benchmark/results.json`. Decision quality explicitly **not yet evaluated**.

# ChatGPT design review — v7 plan (restore power, cascading meteor→blackout, traffic control, Big City)

Date: 2026-10-14 · Status: approved by the product owner ("do all but live mode"). Summarised from ChatGPT's reply to Claude Code's v6 checkpoint.

## Verdict on v6
- Festival finding (6/370 attend, mean P(attend)=0.11) is **valid and kept** — no prompt tuning. Grey visitors OK as labeled scenery.
- Optional later: a truthful positive social signal (e.g. invitation / housemate already attending) as real simulated state, compared in a separately labeled recording.
- Human-rater evaluation dropped: fine, as long as no decision-quality claims are made.

## v7 order (14 actions, contract `jev-city-decision-v3`, `rules-v3`, SIM_VERSION 7, still the same 4 questions)
1. **restore_power** — criterion: *"Travel to an assigned electrical repair site and help restore power by working on an active utility work order."* Gate: role `utility`; open, unfinished work order; site isolated + safe + reachable; ≤2 utility citizens per order; not already working it. Work 240 units; 1 unit/tick per worker on site (max 2); backup contractor dispatched at outage + 900, travels physically, 1 unit/tick on site. **No fixed-tick restoration.** Visible service vehicle, fenced repair area, progress, circuit-by-circuit restoration, inspector credits who repaired. Banner copy per state (outage / awaiting response / utility en route / repairing / contractor arrived / restored). Tests V7-P01..P07.
2. **Meteor + power failure** (`meteor_blackout`): impact beside the substation's utility corridor → linked outage spreading by circuit → dark signals → independent road clearance and electrical repair (either may finish first). Citizens see dark lights but don't magically know the cause. Banner copy per state. Tests V7-C01..C08.
3. **direct_traffic** — criterion: *"Travel to a reachable intersection with inactive traffic signals and manually direct queued vehicles until relieved or normal signals resume."* Gate: responder; a dark intersection with ≥3 queued vehicles or avg wait > 80 ticks; no controller there; not on a higher-priority response; reachable; ≤2 staffed intersections. Simulation picks the intersection (congestion, then id). Must have real consequences: measured throughput/queues, and utility/contractor vehicle travel through actual traffic. If no improvement is measured, say so. Tests V7-T01..T08.
4. **Big City** (`big_city_blackout`): one separate 100-citizen scenario on a 44×44 map (70 resident, 10 service, 8 healthcare, 8 responder, 4 utility), two clinics/shelters, apartments. Culling/spatial lookups, searchable/filterable citizen picker, camera presets. Stress-test with rules first, short real-JEV sample, then capped full recording. Tests V7-S01..S08.

## Also
- Freeze v6 (code tag, recordings, benchmark) as an immutable baseline; replay files declare their sim version and mismatches fail visibly.
- Counterfactual mechanism tests: change one decision, hold everything else constant, check downstream outcome changes (restoration tick, queues, recipient inputs). These test mechanisms, not decision quality.

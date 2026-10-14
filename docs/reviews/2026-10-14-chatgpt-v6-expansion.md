# ChatGPT design review — decision & event expansion (proposed sim v6)

Date: 2026-10-14 · Requested by product owner: "Are there any more decisions the people can make?" and "any more interesting events?"
Status: **proposal, not implemented.** Summarised from ChatGPT's reply to Claude Code's checkpoint message.

## Guiding principles
1. **Consequential choices over more choices** — one citizen's action should change what other citizens observe and decide next.
2. **Show the causal chain** — inspector "Why did the world change?" history: decision → movement → world effect → later decisions, each labelled (recorded JEV decision / deterministic simulation / safety override).
3. Immediate danger is handled by a deterministic, labelled **safety override**, never by hoping JEV picks the safe action.

## New actions (7 → 12)
| Rank | Action ID | Choice criteria string | Gate (summary) | New state |
|---|---|---|---|---|
| 1 | `seek_medical_care` | Travel to an operational clinic to seek treatment for the citizen's own injury or health problem. | injured, can travel, not in treatment, clinic reachable & operational | `injurySeverity`, `careStatus`, `clinicStatus`, `clinicCapacityRemaining` |
| 2 | `move_away_from_hazard` | Leave a nearby hazardous area and move to the nearest reachable safe location without traveling all the way to a designated shelter. | hazard = nearby (not immediate), safe tile reachable | `nearestSafeTileId`, `safeRouteAvailable`, `evacuationZoneId` |
| 3 | `check_on_family` | Travel to the last known location of a household or family member to check on their wellbeing during a disruption. | incident active, linked relative not confirmed safe, last-known place reachable | `familyMemberIds`, last-known places/contact ticks, `familyConcern` |
| 4 | `warn_others` | Travel to nearby people who have not received a credible hazard warning and communicate the known danger. | citizen knows an alert, reachable unwarned group, cooldown/dedup | `knownAlertIds`, `warnedGroupIds`, cooldown, `world.activeAlerts` |
| 5 | `attend_festival` | Visit an open public festival to participate in social activities, entertainment, or community gatherings. | festival open, capacity, safe, no emergency | `festivalPhase`, venue, capacity, `festivalStatus` |

Warnings deliver a factual alert ID into recipients' next state — they do not force behaviour.

**Cut / deferred:** `go_look` (disaster tourism), `direct_traffic` (keep deterministic for now), `volunteer_at_shelter` / `share_supplies` (need inventory/occupancy), `restore_power` (only honest once power restoration depends on repair state, not a fixed tick), drive-vs-walk (deterministic planner, not a Choice).

**JEV questions:** keep the same four in one request; improve observation state instead of adding questions.

## New events (3 → 6 scenarios)
1. **Building fire** (office) — smoke warning → flames + cordon → peak smoke → crew suppression (gated on real crew state) → recovery. Bounded, never spreads endlessly.
2. **Street festival** (market plaza) — positive contrast scenario; crowd size must come from actual attendance choices; decorative NPCs visibly distinct from the 25 citizens.
3. **Flash flood** — tile elevation + seeded rain; roads close progressively; tiles become impassable *before* anyone enters; recovery per actual closures.
Deferred: gas leak (duplicates fire), multi-event combos (later).
Banner copy for every phase is specified in ChatGPT's reply; response/recovery lines must be gated on real state.

## Benchmark consequences
- New versions: SIM_VERSION 6, `CitizenDecisionInputV2`, `jev-city-actions-v2`, `rules-v2`, `quality-rubric-v2`, `sim-v6-{scenario}.json`; archive v5 data; no direct v5↔v6 improvement claims.
- Blind eval: 360 snapshots (60 × 6 scenarios), or a labelled 30-per-scenario pilot. Raters see only what the citizen could know.
- Rules baseline gets honest heuristics for every new action; must not be weakened.
- Freeze schema before the final re-record.

## Acceptance tests V6-01 … V6-12
Gates reject ineligible actions; each action executable in a controlled state; labelled safety overrides; clinic capacity; family uses known locations only; warnings expire/dedupe; festival attendance changes real venue population; closures block entry; all six scenarios replay with identical hashes; rules deterministic; every consequence traceable; still exactly four JEV questions. Curated tour only shows actions a real recorded JEV decision actually selected.

## Suggested order
1 state + infrastructure → 2 fire → 3 festival → 4 flood → 5 freeze, re-record, re-benchmark.

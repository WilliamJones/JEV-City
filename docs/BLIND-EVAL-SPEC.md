# Blind quality evaluation — spec v1.0 (ChatGPT, approved 2026-10-14)

> **Status: DISCARDED (2026-10-14, product owner decision).** No human-rater study will be run. The app and benchmark make no decision-quality claims. Kept for reference only.

> **v6 update (2026-10-14, from the decision-expansion review):** the evaluation now targets sim v6 / `quality-rubric-v2`: **360 fresh snapshots (60 × 6 scenarios)**, or a clearly labeled pilot of 30 per scenario. Raters see only what the citizen could know (e.g. a housemate's *last known* place, never their true location). Deliberately include snapshots where several actions are equally defensible and some where an action is clearly inappropriate; stratify by phase and action-set size; avoid adjacent near-duplicate ticks. v5 results are archived and not compared directly with v6. Auxiliary scores (perceived risk, duty pressure) are not rated with the action rubric.

**Goal:** measure whether each engine's chosen action is *appropriate*, independently of speed/cost, without raters knowing which engine chose what.

## Design
- **Raters rate every eligible action, not engine outputs.** Each engine's selection is later scored by looking up the human rating of the action it chose — so different-but-equally-good choices are not penalized.
- **3 independent human raters** who did not build JEV City (not the product owner's AI collaborators). No AI expertise needed.
- **Datasets:** 12 calibration snapshots (training, excluded) → existing 60 snapshots as a pilot (exploratory only) → **180 fresh snapshots** (60 per scenario) for the published result, sampled by a pre-registered plan from mixed rules/JEV trajectories (provenance hidden).
- **10% hidden repeats** to check rater self-consistency (not counted as extra observations).

## Rubric (per eligible action)
*Given what this citizen knows, their personality, needs, responsibilities and circumstances, how appropriate and behaviorally plausible is this action?*

| Score | Label | Definition |
|---|---|---|
| 3 | Highly appropriate | Strongly consistent with circumstances, traits, needs, responsibilities |
| 2 | Reasonable | Plausible and defensible, even if another action is preferable |
| 1 | Weak | Possible but poorly aligned with important aspects |
| 0 | Inappropriate | Contradicts a critical constraint, unjustified serious danger, or extremely implausible |

Flags (separate from the score): **Critical safety concern** (Y/N), **Insufficient information** (Y/N, requires a note; no score).

## Rater view
Neutral card: role, traits, needs, responsibilities, time, scenario, hazard proximity, resources, nearby people — exactly what the engine saw. All eligible actions in randomized order. **Never** shown (and never sent to the rater's browser): engine names, selected actions, probabilities, confidence, latency, cost.

## Process
Calibrate on 12 → review disagreements → **freeze** rubric, snapshots, exclusions and analysis plan → independent rating (randomized snapshot + action order per rater, autosave) → **lock ratings** → compute agreement → only then join engine outputs.

## Agreement
Ordinal **Krippendorff's α** over (snapshot, action) units, with 95% CI by resampling whole snapshots. ≥ 0.80 strong; 0.667–0.799 tentative (label exploratory); < 0.667 no comparative quality claims. Also report exact agreement, within-one agreement, α per scenario. Never drop dissenting raters or edit the rubric after seeing results.

## Metrics per engine (Tracks A and B separately)
Mean action quality (0–3; average a snapshot's 3 trials first) · acceptable-action rate (≥2 from ≥2 raters) · unacceptable rate (0 from ≥2 raters) · decision regret (best eligible score − chosen score) · safety-concern rate · repeatability (reported separately) · coverage including failures (429s, timeouts, invalid).

**Comparison:** paired per-snapshot differences, 10,000 stratified bootstrap resamples (by scenario, keeping trials together), 95% CIs. Equivalence margin (candidate ±0.25) must be fixed **before** unblinding; non-significance ≠ equivalence.

## Implementation contract
`RatingRecord { raterId, snapshotId, actionId, score|null, criticalSafetyConcern, insufficientInformation, note?, rubricVersion }` with unique (raterId, snapshotId, actionId) in a persistent DB (not Vercel's temp filesystem). Engine trials stored separately, never reachable from rater endpoints. Deterministic analysis script tested on synthetic fixtures with known α and quality outcomes. Public results added to `/benchmark` only after ratings are locked.

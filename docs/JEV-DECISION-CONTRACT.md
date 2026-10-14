# JEV City — Exact Decision Contract (proposed application schema)

**Version:** `jev-city-decision-v1` • **Verified TypeSafe docs:** 2026-10-13.  
**Important:** The upstream TypeSafe JSON envelope and answer field names below are documented. Our **citizen state fields, action IDs, rubrics, thresholds, eligibility and sampling policy are proposed application choices**, not TypeSafe-required or empirically validated semantics. Fixtures are synthetic, not a real paid API response.

## 1. Official direct endpoint and model

`POST https://api.typesafe.ai/v1/systemone`  
Headers: `Authorization: Bearer ${TYPESAFE_API_KEY}` and `Content-Type: application/json`.  
Body must have `model`, `state`, `questions`. Pin `model: "jev-1.13.0"` for controlled comparisons; `jev-latest` is acceptable for exploratory development, but log `response.model` because aliases move.

**Do not use third-party `/api/v1/decide` endpoints or `jv_live_` credential formats when claiming direct TypeSafe results.** There are independent JEV gateways with different pricing and limits.

## 2. Application-level input: `CitizenDecisionInputV1`

A strict DTO accepted by our `/api/decision` route. The server **rebuilds** the upstream `questions` map; browsers do not submit arbitrary questions, provider model names, URLs, prompts, or JSON blobs. Strictly validate, sanitize, and bound the DTO using a runtime validator (e.g., Zod):

```ts
type ActionId =
  | 'continue_routine'
  | 'go_home'
  | 'seek_shelter'
  | 'help_neighbor'
  | 'seek_supplies'
  | 'report_for_duty'
  | 'wait';

type CitizenDecisionInputV1 = {
  contractVersion: 'jev-city-decision-v1';
  scenario: 'ordinary_morning' | 'blackout' | 'meteor';
  seed: number; // bounded integer
  simulationMinute: number; // bounded 0..1439
  citizen: {
    id: string; // one of the 25 scenario citizen IDs
    role: 'resident' | 'service' | 'healthcare' | 'responder';
    locationId: string; // valid fixed map node
    currentPlan: string; // bounded enum, not arbitrary free text
    traits: { caution: number; altruism: number; sociability: number }; // 0..1
    needs: { fatigue: number; supplies: number }; // 0..1
  };
  local: {
    blackout: boolean;
    hazard: 'none' | 'distant' | 'nearby' | 'immediate';
    nearbyPersonNeedsHelp: boolean;
    clinicOperational: boolean;
    reachableHome: boolean;
    reachableShelter: boolean;
    shopAvailable: boolean;
    isOnDuty: boolean;
  };
  eligibleActionIds: ActionId[]; // server rechecks invariants; 2..7 unique allowed
};
```

**Trust model:** The browser simulates the world, so client-submitted observations are not authoritative against a malicious visitor. This MVP is a display, not a shared economy. The server must still verify IDs, numeric bounds, finite numbers, scene flags, acceptable combinations, action keys, size (recommend <=4KB body) and a secure live-session allowance. Client cannot increase throughput, criteria size, or cost by providing crafted data.

`getEligibleActions` is a deterministic engine function, not a Jev result. Example gates: `report_for_duty` only if responder/healthcare role with an active incident, `help_neighbor` only when help is needed and reachable, `seek_supplies` only if a shop is open and reachable, `go_home` only if safe/reachable, `seek_shelter` only if shelter reachable, `continue_routine` only when current plan is feasible, `wait` always allowed (except enforce >=2 choices before Choice, otherwise skip upstream and execute deterministically). If a safety rule would veto a valid option, remove it **before** JEV evaluation whenever possible.

## 3. Exact upstream questions for MVP v1

For each citizen, create exactly one upstream request with **four independent questions** against the same state; do not create four network calls. Questions refer to the compact, structured `state`. All choice descriptions are built from a server-controlled map and **only eligible actions** are passed.

**`next_action` — Choice**

```json
{
  "type": "choice",
  "instructions": "For this simulated citizen, which eligible next action best matches their current circumstances, needs, role and traits? Use only the supplied eligible actions; do not assume unstated paths or capabilities.",
  "criteria": {
    "go_home": "Return to the citizen's home using a reachable route.",
    "seek_shelter": "Travel to a reachable designated safe building.",
    "help_neighbor": "Help a nearby person explicitly flagged as needing assistance.",
    "report_for_duty": "Travel to the assigned emergency or healthcare post when currently on duty.",
    "wait": "Stay at a safe location and re-evaluate later."
  }
}
```

The illustrated criteria map above is for a **particular nurse under blackout**. The full server map has seven action keys as listed in the input DTO; never send ineligible keys just to pad probabilities.

**`perceived_risk` — Score (0..3 weighted numeric value)**

```json
{
  "type": "score",
  "instructions": "How much immediate personal danger would this citizen perceive from the local situation? Evaluate perceived danger, not objective map danger or action feasibility.",
  "criteria": [
    "No credible immediate threat to this citizen.",
    "Mild concern or a distant disruption, but personally safe now.",
    "Near or consequential threat; the citizen is worried and may need to act.",
    "Direct, immediate danger to this citizen at their present location."
  ]
}
```

**`duty_pressure` — Score (0..3 weighted numeric value)**

```json
{
  "type": "score",
  "instructions": "How strongly do this citizen's current role and nearby dependents create an immediate responsibility to help others? Do not treat general fear as duty.",
  "criteria": [
    "No immediate obligation or person relying on this citizen.",
    "Helping is optional; no one is specifically depending on the citizen.",
    "A nearby individual or existing responsibility creates meaningful pressure to assist.",
    "This citizen has explicit emergency-duty responsibilities and immediate people depending on them."
  ]
}
```

**`would_interrupt_routine` — Noul**

```json
{
  "type": "noul",
  "instructions": "Given current local conditions and this citizen's traits, is this citizen likely to abandon their ordinary routine during the next decision interval?"
}
```

Note: The questions are independently evaluated. Do **not** claim `perceived_risk`, `duty_pressure`, or Noul causally determined `next_action`; only the shared state informed each judgment. For the MVP these auxiliary answers drive the **inspector and telemetry**; using them for downstream action policy requires an explicit, tested application rule.

## 4. Exact upstream response fields

Official response shape (TypeSafe docs):

```ts
type JevAnswer =
 | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
 | { type: 'score'; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number }
 | { type: 'noul'; noul: number };

type TypeSafeResponse = {
  model: string;
  answers: {
    next_action: Extract<JevAnswer, {type: 'choice'}>;
    perceived_risk: Extract<JevAnswer, {type: 'score'}>;
    duty_pressure: Extract<JevAnswer, {type: 'score'}>;
    would_interrupt_routine: Extract<JevAnswer, {type: 'noul'}>;
  };
  usage: { input_tokens: number; output_tokens: number };
};
```

- `next_action.choice`: top-probability key from the supplied Choice criteria; `probabilities` keyed by each eligible action, total approximately 1; `confidence` 0..1.
- Score `score`: **probability-weighted average of rubric indices 0..3**, not integer label and **not a 0..100 score**; its probabilities are keyed by the string rubric levels `"0"`..`"3"`, with a legend and confidence.
- `noul`: yes-probability 0..1; **no `confidence` field**.
- `usage`: upstream model's reported token counts; no official `cost_usd` field in the documented direct response. A token-based cost estimate is separate and labeled.

See `fixtures/jev-request.example.json` and `fixtures/jev-response.synthetic.json` for a completely expanded JSON exchange. **Never present fixture response as observed or measured.**

## 5. Application result envelope (internal; not TypeSafe fields)

```ts
type DecisionResultV1 = {
  id: string;
  contractVersion: 'jev-city-decision-v1';
  scenario: CitizenDecisionInputV1['scenario'];
  citizenId: string;
  simulatedAtMinute: number;
  engine: 'jev' | 'rules' | 'llm' | 'recording';
  provenance: 'live' | 'recorded' | 'fallback' | 'rules';
  requestedModel: string | null;
  resolvedModel: string | null;
  modelTopChoice: ActionId | null;
  enactedChoice: ActionId;
  samplingPolicy: 'argmax' | 'seeded-distribution' | 'deterministic-override';
  overrideReason?: string;
  answers?: TypeSafeResponse['answers'];
  metrics: {
    upstreamRoundTripMs: number | null; // actual server-observed time; null for replay/fallback
    browserRoundTripMs: number | null; // actual client-observed time, if collected
    inputTokens: number | null;
    outputTokens: number | null;
    estimatedApiCostUsd: number | null;
    status: 'success' | 'replayed' | 'fallback' | 'budget_exhausted' | 'error';
  };
};
```

**Replay:** store the original observed timings in recordings *as historical measurements* labeled with capture timestamp, not as newly measured live latency. A synthetic or handcrafted rehearsal recording cannot display live cost or timings.

## 6. Validation, execution and failure semantics

- Validate upstream answer keys/types and actual `next_action.choice` membership against the exact criteria submitted on that request. Check `Number.isFinite`, [0,1] probabilities, approximate sum 1 (allow serialization tolerance), rubric levels/legends, score within `[0,3]`, nonnegative integer usage, and fields required for each primitive. Reject inconsistent/malformed responses even though official endpoint is typed.
- `next_action` result and action execution are separate. Default to model argmax. Optionally seeded-sample from distribution for *simulation diversity*, with explicit `samplingPolicy`. Never claim sampled option was JEV's top choice.
- No safety-critical action is delegated to the model: path availability, noncombat rules, hazard damage, maximum actions and collisions are in code.
- On timeout/401/422/429/529/contract violation/budget refusal, render and label fallback behavior, log the error class, and **do not attach fabricated model probabilities**.
- Backoff for 429/529, honor retry-after if feasible and within budget; use a capped attempt count and abort controller. Count each upstream retry toward shared budget; fail closed on budget-store failure.
- A 200 response with invalid output is a failure, not a completed JEV decision. No silent remapping of unknown choices.

## 7. Public-proxy controls

Route `POST /api/decision` (Node.js runtime on Vercel). Only issue a billable call following: validated strict schema → secure session/CSRF checks → global+session/IP shared throttle → **atomic quota reservation** → fixed model/criteria construction → upstream call → validation → metrics/logging → response. Cap body bytes, number of decisions and server concurrency. No arbitrary user-provided URL, `model`, `questions`, or `instructions`. Provide `JEV_LIVE_ENABLED=false` kill switch; default public sessions to replay. Consider admin-only live in first release.

**Caution:** app-enforced quotas limit your application but do not constitute a true provider spend ceiling. Where available, use account limits/alerts and independently monitor provider billing. An attacker may rotate identities/IPs; a global cap is essential.

## 8. Source-of-truth links

- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/primitives
- https://docs.typesafe.ai/models
- https://docs.typesafe.ai/introduction/quickstart

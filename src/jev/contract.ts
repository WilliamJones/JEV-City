import { z } from 'zod';
import {
  ACTION_IDS,
  ALERT_SOURCES,
  CLINIC_STATUSES,
  CONGESTION_TIERS,
  GRID_STATUSES,
  CROWD_LEVELS,
  FESTIVAL_PHASES,
  HAZARD_KINDS,
  HAZARD_LEVELS,
  INJURIES,
  PLANS,
  ROLES,
  SCENARIOS,
  type ActionId,
  type CitizenDecisionInput,
  type JevAnswers,
} from '@/sim/types';

export const CONTRACT_VERSION = 'jev-city-decision-v3' as const;
export const PINNED_MODEL = 'jev-1.13.0';

const unit = z.number().finite().min(0).max(1);

export const CitizenDecisionInputSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    scenario: z.enum(SCENARIOS),
    seed: z.number().int().min(0).max(1_000_000),
    simulationMinute: z.number().int().min(0).max(1439),
    citizen: z
      .object({
        id: z.string().regex(/^citizen-\d{2,3}$/),
        role: z.enum(ROLES),
        locationId: z.string().regex(/^[a-z0-9-]{1,40}$/),
        currentPlan: z.enum(PLANS),
        traits: z.object({ caution: unit, altruism: unit, sociability: unit }).strict(),
        needs: z.object({ fatigue: unit, supplies: unit }).strict(),
        injury: z.enum(INJURIES),
      })
      .strict(),
    local: z
      .object({
        blackout: z.boolean(),
        hazard: z.enum(HAZARD_LEVELS),
        hazardKind: z.enum(HAZARD_KINDS),
        alertSource: z.enum(ALERT_SOURCES),
        nearbyPersonNeedsHelp: z.boolean(),
        unwarnedPeopleNearby: z.boolean(),
        clinicStatus: z.enum(CLINIC_STATUSES),
        reachableClinic: z.boolean(),
        reachableHome: z.boolean(),
        reachableShelter: z.boolean(),
        safeSpotReachable: z.boolean(),
        shopAvailable: z.boolean(),
        isOnDuty: z.boolean(),
        family: z
          .object({
            householdSize: z.number().int().min(0).max(8),
            unaccountedFor: z.number().int().min(0).max(8),
            minutesSinceContact: z.number().int().min(0).max(1440).nullable(),
            lastKnownPlace: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable(),
          })
          .strict(),
        festival: z.enum(FESTIVAL_PHASES),
        festivalCrowd: z.enum(CROWD_LEVELS),
        festivalReachable: z.boolean(),
        householdAtFestival: z.number().int().min(0).max(8),
        power: z
          .object({
            gridStatus: z.enum(GRID_STATUSES),
            workOrderOpen: z.boolean(),
            repairSiteReachable: z.boolean(),
            repairSiteSafe: z.boolean(),
            utilityCrewOnSite: z.number().int().min(0).max(4),
          })
          .strict(),
        traffic: z
          .object({
            darkSignalsNearby: z.boolean(),
            trafficControlNeeded: z.boolean(),
            congestionTier: z.enum(CONGESTION_TIERS),
          })
          .strict(),
      })
      .strict(),
    eligibleActionIds: z
      .array(z.enum(ACTION_IDS))
      .min(2)
      .max(ACTION_IDS.length)
      .refine((a) => new Set(a).size === a.length, 'duplicate action ids'),
  })
  .strict();

/** Server-owned action descriptions. Clients never supply criteria text. */
export const ACTION_CRITERIA: Record<ActionId, string> = {
  continue_routine: "Carry on with the citizen's current plan as normal.",
  go_home: "Return to the citizen's home using a reachable route.",
  seek_shelter: 'Travel to a reachable designated safe building.',
  help_neighbor: 'Help a nearby person explicitly flagged as needing assistance.',
  seek_supplies: 'Go to an open, reachable shop to get supplies.',
  report_for_duty: 'Travel to the assigned emergency or healthcare post when currently on duty.',
  wait: 'Stay at a safe location and re-evaluate later.',
  // Added in jev-city-actions-v2 (wording from the 2026-10-14 design review; changing it is a contract change).
  seek_medical_care: "Travel to an operational clinic to seek treatment for the citizen's own injury or health problem.",
  move_away_from_hazard: 'Leave a nearby hazardous area and move to the nearest reachable safe location without traveling all the way to a designated shelter.',
  check_on_family: 'Travel to the last known location of a household or family member to check on their wellbeing during a disruption.',
  warn_others: 'Travel to nearby people who have not received a credible hazard warning and communicate the known danger.',
  attend_festival: 'Visit an open public festival to participate in social activities, entertainment, or community gatherings.',
  // Added in jev-city-actions-v3 (2026-10-14 v7 review).
  restore_power: 'Travel to an assigned electrical repair site and help restore power by working on an active utility work order.',
  direct_traffic: 'Travel to a reachable intersection with inactive traffic signals and manually direct queued vehicles until relieved or normal signals resume.',
};

export const RISK_RUBRIC = [
  'No credible immediate threat to this citizen.',
  'Mild concern or a distant disruption, but personally safe now.',
  'Near or consequential threat; the citizen is worried and may need to act.',
  'Direct, immediate danger to this citizen at their present location.',
];

export const DUTY_RUBRIC = [
  'No immediate obligation or person relying on this citizen.',
  'Helping is optional; no one is specifically depending on the citizen.',
  'A nearby individual or existing responsibility creates meaningful pressure to assist.',
  'This citizen has explicit emergency-duty responsibilities and immediate people depending on them.',
];

export function buildJevRequest(input: CitizenDecisionInput, model = PINNED_MODEL) {
  const criteria: Record<string, string> = {};
  for (const id of input.eligibleActionIds) criteria[id] = ACTION_CRITERIA[id];
  return {
    model,
    state: input,
    questions: {
      next_action: {
        type: 'choice',
        instructions:
          'For this simulated citizen, which eligible next action best matches their current circumstances, needs, role and traits? Use only the supplied eligible actions; do not assume unstated paths or capabilities.',
        criteria,
      },
      perceived_risk: {
        type: 'score',
        instructions:
          'How much immediate personal danger would this citizen perceive from the local situation? Evaluate perceived danger, not objective map danger or action feasibility.',
        criteria: RISK_RUBRIC,
      },
      duty_pressure: {
        type: 'score',
        instructions:
          "How strongly do this citizen's current role and nearby dependents create an immediate responsibility to help others? Do not treat general fear as duty.",
        criteria: DUTY_RUBRIC,
      },
      would_interrupt_routine: {
        type: 'noul',
        instructions:
          "Given current local conditions and this citizen's traits, is this citizen likely to abandon their ordinary routine during the next decision interval?",
      },
    },
  };
}

const prob = z.number().finite().min(0).max(1);
const SUM_TOLERANCE = 0.02;
const sumsToOne = (p: Record<string, number>) =>
  Math.abs(Object.values(p).reduce((a, b) => a + b, 0) - 1) <= SUM_TOLERANCE;

const scoreSchema = z
  .object({
    type: z.literal('score'),
    score: z.number().finite().min(0).max(3),
    legend: z.record(z.string()),
    probabilities: z.record(prob),
    confidence: prob,
  })
  .refine(
    (s) =>
      ['0', '1', '2', '3'].every((k) => k in s.probabilities && k in s.legend) &&
      Object.keys(s.probabilities).length === 4 &&
      sumsToOne(s.probabilities),
    'score must have rubric levels 0..3 summing to 1',
  );

const responseSchema = z.object({
  model: z.string().min(1),
  answers: z.object({
    next_action: z.object({
      type: z.literal('choice'),
      choice: z.string(),
      probabilities: z.record(prob),
      confidence: prob,
    }),
    perceived_risk: scoreSchema,
    duty_pressure: scoreSchema,
    would_interrupt_routine: z.object({ type: z.literal('noul'), noul: prob }),
  }),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

export type ValidatedJevResponse = {
  model: string;
  answers: JevAnswers;
  usage: { input_tokens: number; output_tokens: number };
};

/** Validates a raw upstream body against the exact criteria submitted. A 200 with bad output is a failure. */
export function validateJevResponse(
  raw: unknown,
  eligible: ActionId[],
): { ok: true; value: ValidatedJevResponse } | { ok: false; error: string } {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: `schema: ${parsed.error.issues[0]?.message}` };
  const v = parsed.data;
  const na = v.answers.next_action;
  const keys = Object.keys(na.probabilities);
  if (!eligible.includes(na.choice as ActionId)) return { ok: false, error: `unknown choice ${na.choice}` };
  if (keys.length !== eligible.length || !keys.every((k) => eligible.includes(k as ActionId)))
    return { ok: false, error: 'choice probabilities do not match submitted criteria' };
  if (!sumsToOne(na.probabilities)) return { ok: false, error: 'choice probabilities do not sum to 1' };
  return { ok: true, value: v as ValidatedJevResponse };
}

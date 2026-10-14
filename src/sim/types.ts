export const ACTION_IDS = [
  'continue_routine',
  'go_home',
  'seek_shelter',
  'help_neighbor',
  'seek_supplies',
  'report_for_duty',
  'wait',
] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export const SCENARIOS = ['ordinary_morning', 'blackout', 'meteor'] as const;
export type ScenarioId = (typeof SCENARIOS)[number];

export const ROLES = ['resident', 'service', 'healthcare', 'responder'] as const;
export type Role = (typeof ROLES)[number];

export const PLANS = [
  'commute_to_work',
  'at_work',
  'go_shopping',
  'stroll',
  'at_home',
  'travel_to_clinic',
  'patrol',
] as const;
export type Plan = (typeof PLANS)[number];

export const HAZARD_LEVELS = ['none', 'distant', 'nearby', 'immediate'] as const;
export type HazardLevel = (typeof HAZARD_LEVELS)[number];

export type Traits = { caution: number; altruism: number; sociability: number };
export type Needs = { fatigue: number; supplies: number };

/** Strict DTO accepted by /api/decision (contract jev-city-decision-v1). */
export type CitizenDecisionInputV1 = {
  contractVersion: 'jev-city-decision-v1';
  scenario: ScenarioId;
  seed: number;
  simulationMinute: number;
  citizen: {
    id: string;
    role: Role;
    locationId: string;
    currentPlan: Plan;
    traits: Traits;
    needs: Needs;
  };
  local: {
    blackout: boolean;
    hazard: HazardLevel;
    nearbyPersonNeedsHelp: boolean;
    clinicOperational: boolean;
    reachableHome: boolean;
    reachableShelter: boolean;
    shopAvailable: boolean;
    isOnDuty: boolean;
  };
  eligibleActionIds: ActionId[];
};

export type ChoiceAnswer = {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};
export type ScoreAnswer = {
  type: 'score';
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};
export type NoulAnswer = { type: 'noul'; noul: number };

export type JevAnswers = {
  next_action: ChoiceAnswer;
  perceived_risk: ScoreAnswer;
  duty_pressure: ScoreAnswer;
  would_interrupt_routine: NoulAnswer;
};

export type Engine = 'jev' | 'rules' | 'llm' | 'recording';
export type Provenance = 'live' | 'recorded' | 'fallback' | 'rules';
export type SamplingPolicy = 'argmax' | 'seeded-distribution' | 'deterministic-override';
export type DecisionStatus = 'success' | 'replayed' | 'fallback' | 'budget_exhausted' | 'error';

export type DecisionResultV1 = {
  id: string;
  contractVersion: 'jev-city-decision-v1';
  scenario: ScenarioId;
  citizenId: string;
  simulatedAtMinute: number;
  engine: Engine;
  provenance: Provenance;
  requestedModel: string | null;
  resolvedModel: string | null;
  modelTopChoice: ActionId | null;
  enactedChoice: ActionId;
  samplingPolicy: SamplingPolicy;
  overrideReason?: string;
  answers?: JevAnswers;
  /** Rules-engine distribution (not model output); shown only for provenance 'rules'. */
  ruleWeights?: Record<string, number>;
  metrics: {
    upstreamRoundTripMs: number | null;
    browserRoundTripMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    estimatedApiCostUsd: number | null;
    status: DecisionStatus;
    /** ISO time the measurement was captured (replays show historical capture time). */
    capturedAt?: string;
    errorClass?: string;
  };
};

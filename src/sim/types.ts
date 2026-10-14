/** Action vocabulary jev-city-actions-v2 (7 original + 5 added in sim v6). */
export const ACTION_IDS = [
  'continue_routine',
  'go_home',
  'seek_shelter',
  'help_neighbor',
  'seek_supplies',
  'report_for_duty',
  'wait',
  'seek_medical_care',
  'move_away_from_hazard',
  'check_on_family',
  'warn_others',
  'attend_festival',
  'restore_power',
  'direct_traffic',
] as const;
export type ActionId = (typeof ACTION_IDS)[number];
export const ACTIONS_VERSION = 'jev-city-actions-v3';

export const SCENARIOS = ['ordinary_morning', 'blackout', 'meteor', 'building_fire', 'street_festival', 'flash_flood', 'meteor_blackout', 'big_city_blackout'] as const;
export type ScenarioId = (typeof SCENARIOS)[number];

export const ROLES = ['resident', 'service', 'healthcare', 'responder', 'utility'] as const;
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
export const HAZARD_KINDS = ['none', 'meteor', 'fire', 'flood'] as const;
export type HazardKind = (typeof HAZARD_KINDS)[number];
export const INJURIES = ['none', 'minor', 'major'] as const;
export type Injury = (typeof INJURIES)[number];
/** How the citizen knows about the current hazard (only what they could actually know). */
export const ALERT_SOURCES = ['none', 'observed', 'official', 'from_citizen'] as const;
export type AlertSource = (typeof ALERT_SOURCES)[number];
export const CLINIC_STATUSES = ['open', 'busy', 'closed'] as const;
export const FESTIVAL_PHASES = ['none', 'setup', 'open', 'closing', 'closed'] as const;
export type FestivalPhase = (typeof FESTIVAL_PHASES)[number];
export const CROWD_LEVELS = ['none', 'light', 'moderate', 'busy'] as const;
export const GRID_STATUSES = ['online', 'outage'] as const;
export const CONGESTION_TIERS = ['none', 'light', 'heavy'] as const;

export type Traits = { caution: number; altruism: number; sociability: number };
export type Needs = { fatigue: number; supplies: number };

/** Strict DTO accepted by /api/decision (contract jev-city-decision-v3). */
export type CitizenDecisionInput = {
  contractVersion: 'jev-city-decision-v3';
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
    injury: Injury;
  };
  local: {
    blackout: boolean;
    /** Perceived hazard: 'none' when the citizen has no way of knowing about it yet. */
    hazard: HazardLevel;
    hazardKind: HazardKind;
    alertSource: AlertSource;
    nearbyPersonNeedsHelp: boolean;
    unwarnedPeopleNearby: boolean;
    clinicStatus: (typeof CLINIC_STATUSES)[number];
    reachableClinic: boolean;
    reachableHome: boolean;
    reachableShelter: boolean;
    safeSpotReachable: boolean;
    shopAvailable: boolean;
    isOnDuty: boolean;
    family: {
      householdSize: number;
      unaccountedFor: number;
      /** Minutes since contact with the longest-unaccounted household member (null if none). */
      minutesSinceContact: number | null;
      lastKnownPlace: string | null;
    };
    festival: FestivalPhase;
    festivalCrowd: (typeof CROWD_LEVELS)[number];
    festivalReachable: boolean;
    /** Housemates currently at the festival (a real social circumstance, not an instruction). */
    householdAtFestival: number;
    power: {
      /** Whether the lights are out where this citizen is. */
      gridStatus: (typeof GRID_STATUSES)[number];
      /** Utility staff only: an open repair work order they could take. Others are told nothing about repairs. */
      workOrderOpen: boolean;
      repairSiteReachable: boolean;
      repairSiteSafe: boolean;
      utilityCrewOnSite: number;
    };
    traffic: {
      darkSignalsNearby: boolean;
      /** Responders only: a dark, backed-up intersection nobody is directing yet. */
      trafficControlNeeded: boolean;
      congestionTier: (typeof CONGESTION_TIERS)[number];
    };
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

export type Engine = 'jev' | 'rules' | 'llm' | 'recording' | 'simulation';
/** 'simulation' = only one safe option existed, so no model was asked (labeled in the UI). */
export type Provenance = 'live' | 'recorded' | 'fallback' | 'rules' | 'simulation';
export type SamplingPolicy = 'argmax' | 'seeded-distribution' | 'deterministic-override';
export type DecisionStatus = 'success' | 'replayed' | 'fallback' | 'budget_exhausted' | 'error';

export type DecisionResult = {
  id: string;
  contractVersion: 'jev-city-decision-v3';
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

import { createRng } from './rng';
import type { ActionId, CitizenDecisionInput } from './types';

export const RULES_VERSION = 'rules-v3';

/**
 * Hand-written rules baseline. Produces a normalized weight per eligible action from the same DTO JEV sees
 * (no extra world knowledge). These are developer heuristics, not model probabilities, and are labeled as such.
 */
export function ruleWeights(input: CitizenDecisionInput, seq: number): Record<string, number> {
  const { traits, needs, role, injury } = input.citizen;
  const l = input.local;
  const incident = l.blackout || l.hazard !== 'none';
  const danger = l.hazard === 'immediate' ? 1 : l.hazard === 'nearby' ? 0.6 : l.hazard === 'distant' ? 0.15 : 0;
  const rng = createRng(input.seed * 977 + Number(input.citizen.id.slice(-2)) * 131 + seq);
  const famWorry = l.family.unaccountedFor > 0 ? 0.3 + Math.min(1, (l.family.minutesSinceContact ?? 0) / 60) * 0.4 : 0;
  const raw: Record<ActionId, number> = {
    continue_routine: incident ? (1 - traits.caution) * 0.6 * (1 - danger) : 1.1,
    go_home: 0.25 + needs.fatigue * 0.8 + (incident ? traits.caution * 0.7 : 0),
    seek_shelter: incident ? 0.2 + danger * 1.5 * (0.5 + traits.caution) : 0,
    help_neighbor: l.nearbyPersonNeedsHelp ? traits.altruism * 1.6 + traits.sociability * 0.3 : 0,
    seek_supplies: needs.supplies * 1.1 + (l.blackout ? 0.25 : 0),
    report_for_duty: l.isOnDuty && (role === 'healthcare' || role === 'responder') ? 1.7 : 0,
    wait: 0.2 + traits.caution * 0.2,
    seek_medical_care: injury === 'minor' ? 1.2 + traits.caution * 0.5 - (l.clinicStatus === 'busy' ? 0.3 : 0) : 0,
    move_away_from_hazard: 0.2 + danger * 1.3 * (0.5 + traits.caution),
    check_on_family: famWorry * (0.6 + traits.altruism) * (1 - danger * 0.5),
    warn_others: l.unwarnedPeopleNearby ? 0.2 + traits.altruism * 0.9 + traits.sociability * 0.5 : 0,
    attend_festival: l.festival === 'open' ? 0.2 + traits.sociability * 1.4 - needs.fatigue * 0.6 + l.householdAtFestival * 0.3 : 0,
    restore_power: l.power.workOrderOpen && l.power.repairSiteSafe ? 1.5 + (l.power.utilityCrewOnSite === 0 ? 0.3 : 0) - danger * 0.6 : 0,
    direct_traffic: l.traffic.trafficControlNeeded ? 0.9 + (l.traffic.congestionTier === 'heavy' ? 0.5 : 0) + traits.altruism * 0.3 : 0,
  };
  const out: Record<string, number> = {};
  let total = 0;
  for (const id of input.eligibleActionIds) {
    const w = Math.max(0.01, raw[id] + rng.range(-0.08, 0.08));
    out[id] = w;
    total += w;
  }
  for (const id of input.eligibleActionIds) out[id] = Math.round((out[id] / total) * 1000) / 1000;
  return out;
}

export function argmax(p: Record<string, number>): string {
  let best = '', bestV = -Infinity;
  for (const [k, v] of Object.entries(p)) if (v > bestV) { best = k; bestV = v; }
  return best;
}

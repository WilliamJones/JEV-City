import { BLACKOUT_TICK, METEOR_CLEARED_TICK, METEOR_CREW_TICK, METEOR_IMPACT_TICK, METEOR_WARN_TICK, POWER_RESTORED_TICK, type Simulation } from '@/sim/world';

export type Phase = { label: string; detail: string; tone: 'calm' | 'alert' | 'recovery' };

/** Plain-language narration of where the current scenario is in its timeline. */
export function scenarioPhase(sim: Simulation): Phase {
  const t = sim.tick;
  const needy = sim.citizens.filter((c) => c.needsHelp).length;
  const helpNote = needy ? ` ${needy} ${needy === 1 ? 'person needs' : 'people need'} help (red ! markers).` : '';
  if (sim.scenario === 'ordinary_morning')
    return { label: 'An ordinary morning', detail: 'No emergency. Citizens commute, shop and run errands — watch how traits and needs shape everyday choices.', tone: 'calm' };
  if (sim.scenario === 'blackout') {
    if (t < BLACKOUT_TICK) return { label: 'Evening — power is on', detail: 'Windows and streetlights are lit. The substation (lightning-bolt roof) is about to fail.', tone: 'calm' };
    if (t < BLACKOUT_TICK + 60) return { label: 'Blackout spreading', detail: 'The outage ripples out from the substation. Signals go dark and intersections become all-way stops.' + helpNote, tone: 'alert' };
    if (t < POWER_RESTORED_TICK) return { label: 'City in the dark', detail: 'The clinic runs on its generator (glowing red cross); the corner store stays open by lantern. Every citizen is re-deciding what to do.' + helpNote, tone: 'alert' };
    return { label: 'Power restored', detail: 'Lights return outward from the substation and citizens drift back to their routines.', tone: 'recovery' };
  }
  if (t < METEOR_WARN_TICK) return { label: 'A calm afternoon', detail: 'Nothing has happened yet. Something is about to appear in the sky above the market.', tone: 'calm' };
  if (t < METEOR_IMPACT_TICK) return { label: 'Meteor incoming', detail: 'A fragment is streaking toward the market. Its shadow grows on the plaza.', tone: 'alert' };
  if (t < METEOR_CREW_TICK) return { label: 'Impact — roads closed', detail: 'The coral dashed ring and cones mark the closed area. Nobody can walk or drive through it.' + helpNote, tone: 'alert' };
  if (t < METEOR_CLEARED_TICK) return { label: 'Crews clearing the crater', detail: 'An excavator and hi-vis workers are filling the crater. The closure stays until they finish.' + helpNote, tone: 'recovery' };
  return { label: 'Roads reopened', detail: 'The crater is paved over, stalls are rebuilt and the emergency is over. Citizens return to normal life.', tone: 'recovery' };
}

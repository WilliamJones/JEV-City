import {
  BLACKOUT_TICK,
  FEST_CLOSED_TICK,
  FEST_CLOSING_TICK,
  FEST_OPEN_TICK,
  FEST_PEAK_TICK,
  FIRE_PEAK_TICK,
  FLOOD_ALERT_TICK,
  METEOR_CLEARED_TICK,
  METEOR_CREW_TICK,
  METEOR_IMPACT_TICK,
  METEOR_WARN_TICK,
  POWER_RESTORED_TICK,
  type Simulation,
} from '@/sim/world';

export type Phase = { label: string; detail: string; tone: 'calm' | 'alert' | 'recovery' };

/** Plain-language narration of where the current scenario is in its timeline. Every claim is gated on real sim state. */
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
  if (sim.scenario === 'meteor') {
    if (t < METEOR_WARN_TICK) return { label: 'A calm afternoon', detail: 'Nothing has happened yet. Something is about to appear in the sky above the market.', tone: 'calm' };
    if (t < METEOR_IMPACT_TICK) return { label: 'Meteor incoming', detail: 'A fragment is streaking toward the market. Its shadow grows on the plaza.', tone: 'alert' };
    if (t < METEOR_CREW_TICK) return { label: 'Impact — roads closed', detail: 'The coral dashed ring and cones mark the closed area. Nobody can walk or drive through it.' + helpNote, tone: 'alert' };
    if (t < METEOR_CLEARED_TICK) return { label: 'Crews clearing the crater', detail: 'An excavator and hi-vis workers are filling the crater. The closure stays until they finish.' + helpNote, tone: 'recovery' };
    return { label: 'Roads reopened', detail: 'The crater is paved over, stalls are rebuilt and the emergency is over. Citizens return to normal life.', tone: 'recovery' };
  }
  if (sim.scenario === 'building_fire') {
    const f = sim.fire;
    const unaware = sim.citizens.filter((c) => c.alert === 'none').length;
    const awareNote = unaware ? ` ${unaware} of 25 people haven’t heard yet.` : '';
    if (f.phase === 'none') return { label: 'A quiet afternoon', detail: 'Office workers are at their desks. Nothing is wrong — yet.', tone: 'calm' };
    if (f.phase === 'smoke') return { label: 'Smoke near the office', detail: 'Smoke is visible near the office. Only people close enough to see it know so far.' + awareNote, tone: 'alert' };
    if (f.phase === 'burning') {
      if (t < FIRE_PEAK_TICK) return { label: 'Building fire', detail: 'A building fire has started. Nearby streets are restricted (red-and-white tape). The fire engine is ' + (f.engine.dispatched ? 'on its way.' : 'being readied.') + awareNote + helpNote, tone: 'alert' };
      return { label: 'Heavy smoke', detail: 'Heavy smoke is affecting nearby blocks. The fire engine has not reached the office yet.' + awareNote + helpNote, tone: 'alert' };
    }
    if (f.phase === 'suppression') {
      const r = f.respondersOnSite;
      return { label: 'Firefighters at work', detail: `Fire crews are responding near the office. Suppression is ${Math.round(f.progress * 100)}% done${r ? ` — ${r} responder${r > 1 ? 's' : ''} who chose to report for duty ${r > 1 ? 'are' : 'is'} helping` : ' — no off-duty responders have joined yet'}.` + helpNote, tone: 'alert' };
    }
    if (f.phase === 'contained') return { label: 'Fire contained', detail: 'The fire is out. Crews are cooling the building; streets reopen after safety checks.', tone: 'recovery' };
    return { label: 'Streets reopened', detail: 'The cordon is gone and the office stands scorched but safe. Life returns to normal.', tone: 'recovery' };
  }
  if (sim.scenario === 'street_festival') {
    const n = sim.festivalCrowd();
    const crowd = `${n} of the 25 citizens ${n === 1 ? 'is' : 'are'} at the festival right now — only real decisions count; grey-toned visitors are scenery.`;
    if (t < FEST_OPEN_TICK) return { label: 'Festival setting up', detail: 'Festival preparations are underway near the market. The plaza road is closed to cars.', tone: 'calm' };
    if (t < FEST_PEAK_TICK) return { label: 'Festival open', detail: 'The street festival is open. Citizens can choose to attend. ' + crowd, tone: 'calm' };
    if (t < FEST_CLOSING_TICK) return { label: 'Festival in full swing', detail: 'Music and stalls on the plaza; traffic detours around the closed road. ' + crowd, tone: 'calm' };
    if (t < FEST_CLOSED_TICK) return { label: 'Festival winding down', detail: 'Closing announcement made — visitors are beginning to leave. ' + crowd, tone: 'recovery' };
    return { label: 'Festival over', detail: 'Stalls are packed away and the plaza road has reopened.', tone: 'recovery' };
  }
  // flash_flood
  const fl = sim.flood;
  const closed = fl.depth.filter((d) => d > 0).length; // any water closes a tile to cars
  if (fl.phase === 'none') return { label: 'An overcast afternoon', detail: 'Clouds are building. The streets are dry for now.', tone: 'calm' };
  if (fl.phase === 'warning') return { label: 'Heavy rain approaching', detail: 'Heavy rain is approaching. Low-lying streets may become difficult to access.', tone: 'alert' };
  if (fl.phase === 'rising') {
    if (t < FLOOD_ALERT_TICK) return { label: 'Water rising', detail: 'Rain is intensifying and water is collecting in the lower streets. No official warning yet — people only know if they see it or are told.' + helpNote, tone: 'alert' };
    return { label: 'Flooded streets', detail: `Floodwater has closed ${closed} tiles to traffic. An official warning is out; citizens are adjusting their routes.` + helpNote, tone: 'alert' };
  }
  if (fl.phase === 'receding') return { label: 'Water receding', detail: `Rain is easing and drainage is underway. ${closed} tiles are still closed to cars.` + helpNote, tone: 'recovery' };
  return { label: 'Streets dry again', detail: 'Every street has reopened. Citizens return to normal life.', tone: 'recovery' };
}

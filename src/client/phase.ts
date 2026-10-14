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
  if (sim.scenario === 'blackout' || sim.scenario === 'big_city_blackout') {
    if (t < BLACKOUT_TICK) return { label: 'Evening — power is on', detail: 'Windows and streetlights are lit. The substation (lightning-bolt roof) is about to fail.', tone: 'calm' };
    const p = powerPhase(sim);
    return { ...p, detail: p.detail + trafficNote(sim) + helpNote };
  }
  if (sim.scenario === 'meteor_blackout') {
    const m = sim.meteorCfg!;
    if (t < m.warnTick) return { label: 'An ordinary early evening', detail: 'Power and traffic signals are working normally.', tone: 'calm' };
    if (t < m.impactTick) return { label: 'Meteor warning', detail: 'Meteor warning — an impact is expected near the utility corridor.', tone: 'alert' };
    if (t < m.impactTick + 60) return { label: 'Impact', detail: 'A meteor has struck near the substation. Nearby roads are closed.' + helpNote, tone: 'alert' };
    const roadsOpen = sim.clearedTick !== null, powerOn = sim.power.status === 'restored';
    if (roadsOpen && powerOn) return { label: 'Fully recovered', detail: 'Power and road access have been restored.', tone: 'recovery' };
    if (powerOn) return { label: 'Power first', detail: 'Electricity has been restored, but the impact area remains closed.' + helpNote, tone: 'recovery' };
    if (roadsOpen) return { label: 'Roads first', detail: 'The affected road has reopened. Some neighbourhoods remain without power.' + trafficNote(sim), tone: 'recovery' };
    const repairing = sim.power.status === 'repairing';
    if (sim.crewOnSite && repairing) return { label: 'Two crews at work', detail: 'Road crews are clearing debris while utility workers repair the substation.' + trafficNote(sim), tone: 'recovery' };
    if (t < m.impactTick + 160 && !repairing) return { label: 'Outage spreading', detail: 'The impact has damaged the power grid. Outages are spreading through nearby blocks.' + trafficNote(sim) + helpNote, tone: 'alert' };
    const pp = powerPhase(sim);
    if (!sim.crewOnSite && !repairing && sim.power.order?.assigned.length === 0) return { label: 'Awaiting crews', detail: 'Road clearance and electrical repairs are awaiting crews.' + trafficNote(sim) + helpNote, tone: 'alert' };
    return { ...pp, detail: pp.detail + (sim.crewOnSite ? ' Road crews are clearing the crater.' : '') + trafficNote(sim) + helpNote };
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
    const awareNote = unaware ? ` ${unaware} of ${sim.citizens.length} people haven’t heard yet.` : '';
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
    const crowd = `${n} of the ${sim.citizens.length} citizens ${n === 1 ? 'is' : 'are'} at the festival right now — only real decisions count; grey-toned visitors are scenery.`;
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

/** Power-grid narration (sim v7) — each line only when its condition is actually true. */
function powerPhase(sim: Simulation): Phase {
  const p = sim.power, o = p.order;
  if (p.status === 'restored') return { label: 'Power restored', detail: 'Power has been restored. Traffic signals and building lights are returning.', tone: 'recovery' };
  if (!o) return { label: 'Power is on', detail: '', tone: 'calm' };
  const pct = Math.round((o.workCompleted / o.workRequired) * 100);
  const enRoute = sim.citizens.some((c) => c.utility && c.utility.stage !== 'working');
  if (p.status === 'outage') return { label: 'Power fault', detail: 'A power fault has been detected. Utility repairs are needed — the site is being made safe first.', tone: 'alert' };
  if (o.contractor.stage === 'working') return { label: 'Backup crew on site', detail: `A backup utility crew has arrived to assist with repairs. Repair ${pct}% done.`, tone: 'recovery' };
  if (p.status === 'repairing') return { label: 'Repairing the grid', detail: `Utility workers are repairing the electrical system. Repair ${pct}% done.`, tone: 'recovery' };
  if (enRoute) return { label: 'Utility crew on the way', detail: 'A utility worker is traveling to the substation.', tone: 'alert' };
  if (o.contractor.stage === 'driving' || o.contractor.stage === 'walking') return { label: 'Backup crew on the way', detail: 'A backup utility crew is driving to the substation.', tone: 'alert' };
  if (o.contractor.stage === 'blocked') return { label: 'Backup crew blocked', detail: 'The backup utility crew cannot reach the substation yet — their route is blocked.', tone: 'alert' };
  return { label: 'City in the dark', detail: 'The repair site is ready, but no utility workers have arrived. The clinic runs on its generator; the corner store stays open by lantern.', tone: 'alert' };
}

function trafficNote(sim: Simulation): string {
  if (!sim.blackout) return '';
  const tr = sim.traffic;
  const directed = tr.intersections.filter((i) => tr.control[i.id].mode === 'responder_directed').length;
  if (directed) return ' A responder is manually directing vehicles through a dark intersection.';
  if (sim.citizens.some((c) => c.trafficJob?.stage === 'en_route')) return ' A responder is traveling to help manage traffic.';
  if (tr.intersections.some((i) => tr.control[i.id].mode === 'all_way_stop' && tr.stats[i.id].queued >= 3)) return ' Traffic is backing up at an unpowered intersection.';
  return ' Traffic signals are dark. Drivers are treating intersections as all-way stops.';
}

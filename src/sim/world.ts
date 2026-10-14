import { BIG_CITY_MAP, createBigPopulation } from './bigcity';
import { createPopulation, spawnCitizen, type Citizen } from './citizens';
import { elevation, findPath, MAP_H, MAP_W, reachMap, STANDARD_MAP, type BuildingKind, type CityMap, type Tile } from './map';
import { createRng, round2, type Rng } from './rng';
import { TrafficSim, type Car } from './traffic';
import type {
  ActionId,
  CitizenDecisionInput,
  DecisionResult,
  FestivalPhase,
  HazardKind,
  HazardLevel,
  Plan,
  Provenance,
  ScenarioId,
} from './types';

/** Bump whenever simulation behavior changes; recordings must be re-captured to match. */
export const SIM_VERSION = 7;
export const TICK_MS = 100;
export const MINUTES_PER_TICK = 0.1;
/** Fixed logical "think time": a decision requested at tick t is applied at t + THINK_TICKS. */
export const THINK_TICKS = 4;
const SPEED = 0.11; // tiles per tick

export type SimEvent = {
  tick: number;
  minute: number;
  kind: 'incident' | 'action' | 'effect' | 'safety';
  text: string;
  citizenId?: string;
  /** Other citizens this event involved (for the inspector's "why did the world change?" trail). */
  relatedIds?: string[];
  /** What produced it: a decision's provenance, deterministic simulation logic, or a safety rule. */
  via?: Provenance | 'sim' | 'safety';
};

export type DecisionRequest = {
  key: string;
  citizenId: string;
  seq: number;
  requestTick: number;
  input: CitizenDecisionInput;
};

export type Hazard = { center: { x: number; y: number }; radius: number; impactTick: number };

export const SCENARIO_META: Record<ScenarioId, { title: string; short: string; startMinute: number; night: boolean; blurb: string }> = {
  ordinary_morning: { title: 'Ordinary Morning', short: 'Morning', startMinute: 7 * 60 + 40, night: false, blurb: 'Commutes, coffee and errands.' },
  blackout: { title: 'Citywide Blackout', short: 'Blackout', startMinute: 18 * 60 + 50, night: true, blurb: 'The grid fails at dusk.' },
  meteor: { title: 'Meteor Near the Market', short: 'Meteor', startMinute: 12 * 60 + 30, night: false, blurb: 'A fragment lands by the market.' },
  building_fire: { title: 'Office Fire', short: 'Fire', startMinute: 15 * 60 + 10, night: false, blurb: 'Smoke rises from the office tower.' },
  street_festival: { title: 'Street Festival', short: 'Festival', startMinute: 17 * 60, night: false, blurb: 'Saturday evening: music and stalls fill the market plaza.' },
  flash_flood: { title: 'Flash Flood', short: 'Flood', startMinute: 16 * 60, night: false, blurb: 'A cloudburst floods the low streets.' },
  meteor_blackout: { title: 'Meteor Strike + Power Failure', short: 'Meteor + Outage', startMinute: 17 * 60 + 40, night: false, blurb: 'A meteor hits the utility corridor and knocks out the power.' },
  big_city_blackout: { title: 'Big City Blackout', short: 'Big City', startMinute: 18 * 60 + 40, night: true, blurb: '100 citizens across a larger city lose power at dusk.' },
};

export const BLACKOUT_TICK = 60;
export const BLACKOUT_TRIP_TICK = 260;

/**
 * Power grid (sim v7): an outage opens a utility work order. The lights only come back when 240 units of repair
 * work are done on site — 1 unit/tick per utility worker who chose restore_power and arrived (max 2), plus a backup
 * contractor that is dispatched 900 ticks after the outage and must physically drive there. No fixed restore time.
 */
export const ISOLATION_TICKS = 60;
export const REPAIR_WORK = 240;
export const CONTRACTOR_DELAY = 900;
export const MAX_UTILITY_CREW = 2;
export const MAX_TRAFFIC_CONTROLLERS = 2;
export type PowerStatus = 'online' | 'outage' | 'isolated' | 'repairing' | 'restored';
export type WorkOrder = {
  id: string;
  site: Tile;
  createdTick: number;
  isolatedTick: number;
  workRequired: number;
  workCompleted: number;
  assigned: string[];
  contractorDueTick: number;
  contractor: { stage: 'waiting' | 'driving' | 'walking' | 'working' | 'blocked' | 'done'; vanId: number | null; onSiteTick: number | null };
  /** Who actually did work (citizen ids, plus 'contractor'). */
  repairedBy: string[];
};

/** Meteor timelines: the classic market strike, and the cascading strike on the utility corridor. */
export type MeteorConfig = { center: Tile; radius: number; warnTick: number; impactTick: number; crewTick: number; clearTick: number; cutsPower: boolean };
export const METEOR_BLACKOUT: MeteorConfig = { center: { x: 11, y: 18 }, radius: 2.0, warnTick: 180, impactTick: 300, crewTick: 700, clearTick: 1400, cutsPower: true };
const MB_ISOLATION_TICKS = 120;
export const METEOR_WARN_TICK = 50;
export const METEOR_IMPACT_TICK = 90;
export const METEOR_CENTER = { x: 9, y: 11 };
/** Cleanup arc: crews arrive, then the closure is lifted and the emergency ends. */
export const METEOR_CREW_TICK = 700;
export const METEOR_CLEARED_TICK = 1500;
const METEOR_RADIUS = 2.3;
export const METEOR_MARKET: MeteorConfig = { center: METEOR_CENTER, radius: METEOR_RADIUS, warnTick: METEOR_WARN_TICK, impactTick: METEOR_IMPACT_TICK, crewTick: METEOR_CREW_TICK, clearTick: METEOR_CLEARED_TICK, cutsPower: false };

/** Office fire: smoke → flames + cordon → engine dispatched → suppression (faster with responders on site) → cooling → reopen. */
export const FIRE_SMOKE_TICK = 60;
export const FIRE_IGNITE_TICK = 200;
export const FIRE_DISPATCH_TICK = 260;
export const FIRE_PEAK_TICK = 400;
export const FIRE_COOL_TICKS = 250;
export const FIRE_CENTER = { x: 14, y: 8 };
export const FIRE_CORDON = { x0: 12, x1: 16, y0: 5, y1: 11 };
/** Fire engine route from the station along the roads to its staging point beside the cordon. */
export const ENGINE_ROUTE: Tile[] = [{ x: 20, y: 16 }, { x: 20, y: 17 }, { x: 17, y: 17 }, { x: 17, y: 9 }];
const ENGINE_SPEED = 0.07;
export const FIRE_POST: Tile = { x: 18, y: 9 };
const SUPPRESS_BASE = 0.0011;
const SUPPRESS_PER_RESPONDER = 0.0009;

/** Street festival on the market plaza. */
export const FEST_OPEN_TICK = 200;
export const FEST_PEAK_TICK = 400;
export const FEST_CLOSING_TICK = 1000;
export const FEST_CLOSED_TICK = 1300;
export const FEST_CAPACITY = 12;
export const FEST_SLOTS: Tile[] = (() => {
  const out: Tile[] = [];
  for (let y = 9; y <= 11; y++) for (let x = 6; x <= 10; x++) out.push({ x, y });
  return out.sort((a, b) => Math.hypot(a.x - 8, a.y - 10) - Math.hypot(b.x - 8, b.y - 10) || a.y - b.y || a.x - b.x).slice(0, FEST_CAPACITY);
})();
export const FEST_ROAD = { y: 11, x0: 6, x1: 10 };

/** Flash flood: rain → water rises over low tiles → official alert → recedes. */
export const FLOOD_WARN_TICK = 60;
export const FLOOD_RISE_TICK = 150;
export const FLOOD_FULL_TICK = 600;
export const FLOOD_ALERT_TICK = 520;
export const FLOOD_RECEDE_TICK = 950;
export const FLOOD_DRY_TICK = 1350;
const FLOOD_MAX = 0.42;
const FLOOD_START = 0.1;
const FLOOD_SLIP_TICK = 340;
const FLOOD_STRAND_TICK = 450;
/** Water deeper than this closes a tile to people; any water closes it to cars. */
export const DEEP = 0.07;

const CLINIC_BASE_CAPACITY = 2;
const TREAT_TICKS = 160;

export type FirePhase = 'none' | 'smoke' | 'burning' | 'suppression' | 'contained' | 'reopened';
export type FloodPhase = 'none' | 'warning' | 'rising' | 'receding' | 'cleared';

const first = (c: { name: string }) => c.name.split(' ')[0];
const listNames = (cs: { name: string }[]) => (cs.length <= 2 ? cs.map(first).join(' and ') : `${cs.slice(0, -1).map(first).join(', ')} and ${first(cs[cs.length - 1])}`);

export class Simulation {
  readonly scenario: ScenarioId;
  readonly seed: number;
  tick = 0;
  citizens: Citizen[];
  events: SimEvent[] = [];
  blackout = false;
  hazard: Hazard | null = null;
  meteorIncoming = false;
  /** Cleanup crews are working the impact site. */
  crewOnSite = false;
  /** Tick the impact site was cleared and roads reopened (the repaired patch stays visible). */
  clearedTick: number | null = null;
  fire = { phase: 'none' as FirePhase, intensity: 0, progress: 0, containedTick: null as number | null, respondersOnSite: 0, engine: { x: ENGINE_ROUTE[0].x, y: ENGINE_ROUTE[0].y, seg: 0, dispatched: false, arrived: false } };
  flood!: { phase: FloodPhase; rain: number; level: number; depth: Float32Array; wetDist: Float32Array; version: number };
  readonly map: CityMap;
  festival = { phase: 'none' as FestivalPhase, slots: Array<string | null>(FEST_CAPACITY).fill(null) };
  /** Meteor timeline for this scenario (null when there is no meteor). */
  readonly meteorCfg: MeteorConfig | null;
  power: { status: PowerStatus; outageTick: number | null; restoredTick: number | null; order: WorkOrder | null } = { status: 'online', outageTick: null, restoredTick: null, order: null };
  traffic!: TrafficSim;
  walkable: boolean[][];
  /** Tiles cars may use (walkable minus the festival road closure, any water and the parked engine). */
  drivable: boolean[][];
  /** Requests emitted and waiting for a provider. */
  outbox: DecisionRequest[] = [];
  private pending = new Map<string, DecisionRequest>();
  private provided = new Map<string, DecisionResult>();
  private rng: Rng;
  stalled = false;
  /** Decision keys in the exact order they were applied to the world. */
  appliedKeys: string[] = [];
  private byId = new Map<string, Citizen>();

  constructor(scenario: ScenarioId, seed: number) {
    this.scenario = scenario;
    this.seed = seed;
    this.map = scenario === 'big_city_blackout' ? BIG_CITY_MAP : STANDARD_MAP;
    this.meteorCfg = scenario === 'meteor' ? METEOR_MARKET : scenario === 'meteor_blackout' ? METEOR_BLACKOUT : null;
    this.flood = { phase: 'none', rain: 0, level: -1, depth: new Float32Array(this.W * this.H), wetDist: new Float32Array(this.W * this.H).fill(99), version: 0 };
    this.rng = createRng(seed);
    this.walkable = this.map.baseWalkable();
    this.drivable = this.walkable.map((r) => [...r]);
    const pop = scenario === 'big_city_blackout' ? createBigPopulation(seed, this.map) : createPopulation(seed, this.map);
    this.citizens = pop.map((s, i) => {
      const start = this.startTile(s.homeId, i);
      let plan: Plan = s.workId ? (s.role === 'healthcare' ? 'travel_to_clinic' : s.role === 'responder' ? 'patrol' : 'commute_to_work') : 'stroll';
      // The festival is on a Saturday evening: residents are off work; service, clinic and fire crews keep their shifts.
      if (scenario === 'street_festival' && s.role === 'resident') plan = i % 2 ? 'at_home' : 'stroll';
      const c = spawnCitizen(s, start, plan, {
        fatigue: round2(this.rng.range(0.1, 0.5)),
        supplies: round2(this.rng.range(0.1, 0.7)),
      });
      c.cooldown = 3 + i * 5;
      return c;
    });
    for (const c of this.citizens) this.byId.set(c.id, c);
    // Households: people who share a home. Each starts out believing housemates are where they planned to be.
    for (const c of this.citizens)
      for (const m of this.citizens)
        if (m !== c && m.householdId === c.householdId) {
          const where = this.routineTarget(m) ?? this.homeDoor(m);
          c.family[m.id] = { lastContactTick: 0, lastKnown: where, place: this.map.locationIdFor(where) };
        }
    this.traffic = new TrafficSim(this.map, seed, this.map.w > 30 ? 46 : 22);
    if (scenario === 'street_festival') { this.festival.phase = 'setup'; this.updateClosures(); }
    this.log('incident', `${SCENARIO_META[scenario].title} begins.`);
  }

  get minute() {
    return Math.floor(SCENARIO_META[this.scenario].startMinute + this.tick * MINUTES_PER_TICK) % 1440;
  }
  get fireActive() {
    return this.fire.phase !== 'none' && this.fire.phase !== 'reopened';
  }
  get floodActive() {
    return this.flood.phase === 'rising' || this.flood.phase === 'receding';
  }
  /** Any emergency in progress (a world fact; individual citizens may not know about it yet). */
  get incidentActive() {
    return this.blackout || this.hazard !== null || this.fireActive || this.floodActive;
  }
  /** Housemates not seen since this tick count as "unaccounted for". */
  private get incidentStartTick() {
    return { blackout: BLACKOUT_TICK, meteor: METEOR_IMPACT_TICK, building_fire: FIRE_IGNITE_TICK, flash_flood: FLOOD_RISE_TICK, ordinary_morning: Infinity, street_festival: Infinity, meteor_blackout: METEOR_BLACKOUT.impactTick, big_city_blackout: BLACKOUT_TICK }[this.scenario];
  }

  citizen(id: string) {
    return this.byId.get(id)!;
  }
  get W() {
    return this.map.w;
  }
  get H() {
    return this.map.h;
  }
  /** Nearest building of a kind to where this citizen is. */
  near(kind: BuildingKind, c: Citizen) {
    return this.map.nearest(kind, c.inside ? this.map.building(c.inside).door : c.tile);
  }
  homeDoor(c: { homeId: string }) {
    return this.map.building(c.homeId).door;
  }
  workDoor(c: { workId: string | null }) {
    return c.workId ? this.map.building(c.workId).door : null;
  }

  /** What this citizen knows: everyone sees a blackout or a meteor; fires and floods must be observed or reported. */
  incidentKnown(c: Citizen) {
    if (this.blackout || this.hazard) return true;
    return (this.fireActive || this.floodActive) && c.alert !== 'none';
  }

  private startTile(homeId: string, i: number): Tile {
    const d = this.map.building(homeId).door;
    if (this.scenario === 'ordinary_morning') return d;
    // Afternoon/evening: spread people around the district.
    for (let attempt = 0; attempt < 50; attempt++) {
      const t = { x: this.rng.int(0, this.W), y: this.rng.int(0, this.H) };
      if (this.walkable[t.y][t.x]) return t;
    }
    return { x: (i * 3) % this.W, y: 5 };
  }

  private log(kind: SimEvent['kind'], text: string, citizenId?: string, extra: Pick<SimEvent, 'relatedIds' | 'via'> = {}) {
    this.events.push({ tick: this.tick, minute: this.minute, kind, text, citizenId, ...extra });
    const cap = this.citizens?.length > 50 ? 6000 : 1500;
    if (this.events.length > cap) this.events.splice(0, this.events.length - cap);
  }

  /**
   * Providers call this with a finished decision for a request key. Unknown, already-applied
   * (late) and duplicate responses are ignored, so they can never mutate a different tick.
   */
  provide(key: string, result: DecisionResult): boolean {
    if (!this.pending.has(key) || this.provided.has(key) || result.id !== key) return false;
    this.provided.set(key, result);
    return true;
  }

  /** FNV-1a hash of all behavior-relevant world state, for replay verification. */
  stateHash(): string {
    let h = 0x811c9dc5;
    const mixIn = (s: string) => {
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    };
    const f = this.fire;
    mixIn(`${this.tick}|${this.blackout}|${this.hazard ? 1 : 0}|${f.phase}:${f.progress.toFixed(5)}:${f.engine.x.toFixed(3)},${f.engine.y.toFixed(3)}|${this.flood.phase}:${this.flood.level.toFixed(4)}|${this.festival.phase}:${this.festival.slots.join(',')}|`);
    for (const c of this.citizens) {
      mixIn(`${c.id}:${c.pos.x.toFixed(4)},${c.pos.y.toFixed(4)}:${c.action}:${c.plan}:${c.needsHelp}:${c.inside}:${c.helpingId}:${c.cooldown}:${c.decisionSeq}:${c.needs.fatigue.toFixed(4)}:${c.needs.supplies.toFixed(4)}:`);
      mixIn(`${c.injury}:${c.care}:${c.alert}:${c.alertFromId}:${c.taskTargetId}:${c.festivalUntil}:${c.exposure}:`);
      for (const [id, fam] of Object.entries(c.family)) mixIn(`${id}=${fam.lastContactTick}@${fam.lastKnown ? `${fam.lastKnown.x},${fam.lastKnown.y}` : '-'};`);
      mixIn('|');
    }
    for (const c of this.citizens) mixIn(`${c.id}~${c.utility ? `${c.utility.stage}${c.utility.vanId}` : '-'}~${c.trafficJob ? `${c.trafficJob.intersectionId}${c.trafficJob.stage}` : '-'}~${c.inVehicle}|`);
    const o = this.power.order;
    mixIn(`P${this.power.status}:${this.power.restoredTick}:${o ? `${o.workCompleted}:${o.assigned.join('+')}:${o.contractor.stage}` : '-'}|`);
    mixIn(this.traffic.fingerprint());
    for (const row of this.walkable) mixIn(row.map((w) => (w ? 1 : 0)).join(''));
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  /** Advance one logical tick. Returns false (stalls) if a due decision has not arrived yet. */
  step(): boolean {
    for (const req of this.pending.values()) {
      if (req.requestTick + THINK_TICKS <= this.tick && !this.provided.has(req.key)) {
        this.stalled = true;
        return false;
      }
    }
    this.stalled = false;
    this.applyScenarioEvents();
    // Apply due decisions in request order (deterministic).
    for (const req of [...this.pending.values()]) {
      if (req.requestTick + THINK_TICKS <= this.tick) {
        const res = this.provided.get(req.key)!;
        this.pending.delete(req.key);
        this.provided.delete(req.key);
        this.applyDecision(req, res);
      }
    }
    for (const c of this.citizens) this.updateCitizen(c);
    this.updateContacts();
    this.updateWarnings();
    this.updateClinic();
    this.updatePower();
    this.stepTraffic();
    if (this.tick % 5 === 0) this.updateObservation();
    this.tick++;
    return true;
  }

  // ------------------------------------------------------------------ scenario timelines

  private applyScenarioEvents() {
    const t = this.tick;
    if (this.scenario === 'blackout' || this.scenario === 'big_city_blackout') {
      if (t === BLACKOUT_TICK) {
        this.startOutage('Substation failure — the district goes dark.', ISOLATION_TICKS);
        this.log('effect', 'Market hall and office tower close. Corner store stays open by lantern. Clinic switches to generator.', undefined, { via: 'sim' });
        for (const c of this.citizens) this.alertCitizen(c, 'observed', null, false);
        const stuck = this.scenario === 'big_city_blackout'
          ? this.outdoorCandidates().filter((c) => c.role === 'resident').sort((x, y) => y.age - x.age || x.id.localeCompare(y.id)).slice(0, 6).map((c) => c.id)
          : ['citizen-06', 'citizen-11', 'citizen-22'];
        this.strand(stuck, 'needs help in the dark', 'none');
        this.interruptAll();
      }
      if (t === BLACKOUT_TRIP_TICK) this.injureFirst(this.outdoorCandidates().sort((a, b) => b.age - a.age || a.id.localeCompare(b.id)), this.citizens.length > 50 ? 3 : 1, 'tripped in the dark');
    }
    if (this.meteorCfg) this.meteorEvents(t, this.meteorCfg);
    if (this.scenario === 'building_fire') this.fireEvents(t);
    if (this.scenario === 'flash_flood') this.floodEvents(t);
    if (this.scenario === 'street_festival') this.festivalEvents(t);
  }

  private meteorEvents(t: number, m: MeteorConfig) {
    const where = m.cutsPower ? 'the utility corridor by the substation' : 'the market';
    if (t === m.warnTick) {
      this.meteorIncoming = true;
      this.log('incident', m.cutsPower ? 'Meteor warning — something bright is falling toward the utility corridor…' : 'A bright streak crosses the sky above the market…');
    }
    if (t === m.impactTick) {
      this.meteorIncoming = false;
      this.hazard = { center: m.center, radius: m.radius, impactTick: t };
      this.log('incident', `Impact! A meteor fragment strikes ${where}.`);
      this.log('effect', 'Nearby roads are closed. Dust drifts east.', undefined, { via: 'sim' });
      const byDist = [...this.citizens]
        .filter((c) => !c.inside)
        .sort((a, b) => this.distTo(a.tile, m.center) - this.distTo(b.tile, m.center) || a.id.localeCompare(b.id));
      this.updateClosures();
      for (const c of this.citizens) this.alertCitizen(c, 'observed', null, false);
      this.strand(byDist.slice(0, 3).map((c) => c.id), 'is hurt and stranded near the crater', 'major');
      this.injureFirst(byDist.slice(3), 2, 'was hit by flying debris');
      if (m.cutsPower) this.startOutage('The impact damaged the substation feeder — power is failing across the district.', MB_ISOLATION_TICKS);
      this.interruptAll();
    }
    if (t === m.crewTick) {
      this.crewOnSite = true;
      this.log('effect', 'Road crews and an excavator arrive at the crater.', undefined, { via: 'sim' });
    }
    if (t === m.clearTick && this.hazard) {
      this.crewOnSite = false;
      this.hazard = null;
      this.clearedTick = t;
      this.updateClosures();
      this.crewRescue('Crews help');
      this.log('incident', this.blackout ? 'Debris cleared — the road has reopened, but some neighbourhoods are still without power.' : 'Debris cleared — roads around the impact reopen.');
      this.interruptAll();
    }
  }

  private fireEvents(t: number) {
    const f = this.fire;
    if (t === FIRE_SMOKE_TICK) {
      f.phase = 'smoke';
      f.intensity = 0.15;
      this.log('incident', 'Smoke is curling from the office tower roof.');
      for (const c of this.citizens) if (c.inside === 'office') this.alertCitizen(c, 'observed', null, true);
    }
    if (t === FIRE_IGNITE_TICK) {
      f.phase = 'burning';
      f.intensity = 0.4;
      this.log('incident', 'Fire! Flames break out of the office tower and the alarm sounds.');
      const occupants = this.citizens.filter((c) => c.inside === 'office').sort((a, b) => a.id.localeCompare(b.id));
      this.updateClosures();
      for (const c of occupants) {
        c.inside = null;
        this.evacuate(c, 'was evacuated from the burning office');
        this.alertCitizen(c, 'observed', null, true);
      }
      this.log('effect', 'Streets around the office are cordoned off.', undefined, { via: 'sim' });
      const near = this.outdoorCandidates().sort((a, b) => this.distTo(a.tile, FIRE_CENTER) - this.distTo(b.tile, FIRE_CENTER) || a.id.localeCompare(b.id));
      const victims = [...occupants, ...near.filter((c) => !occupants.includes(c))];
      const stranded = victims.find((c) => c.role !== 'responder' && !c.needsHelp);
      if (stranded) { this.strand([stranded.id], 'was overcome by smoke and needs help', 'major'); this.alertCitizen(stranded, 'observed', null, false); }
      this.injureFirst(victims.filter((c) => c !== stranded), 2, 'breathed in smoke');
    }
    if (t === FIRE_DISPATCH_TICK) {
      f.engine.dispatched = true;
      this.log('effect', 'The fire engine leaves the station.', undefined, { via: 'sim' });
      for (const c of this.citizens) if (c.role === 'responder' || c.role === 'healthcare') this.alertCitizen(c, 'official', null, true);
    }
    if (f.phase === 'burning' && t > FIRE_IGNITE_TICK) f.intensity = Math.min(1, 0.4 + ((t - FIRE_IGNITE_TICK) / (FIRE_PEAK_TICK - FIRE_IGNITE_TICK)) * 0.6);
    // Engine travel: deterministic, along the road route.
    const e = f.engine;
    if (e.dispatched && !e.arrived) {
      let budget = ENGINE_SPEED;
      while (budget > 0 && e.seg < ENGINE_ROUTE.length - 1) {
        const to = ENGINE_ROUTE[e.seg + 1];
        const d = Math.hypot(to.x - e.x, to.y - e.y);
        if (d <= budget) { e.x = to.x; e.y = to.y; e.seg++; budget -= d; }
        else { e.x += ((to.x - e.x) / d) * budget; e.y += ((to.y - e.y) / d) * budget; budget = 0; }
      }
      if (e.seg === ENGINE_ROUTE.length - 1) {
        e.arrived = true;
        f.phase = 'suppression';
        this.updateClosures();
        this.log('effect', 'The fire engine arrives — the crew starts fighting the fire.', undefined, { via: 'sim' });
      }
    }
    if (f.phase === 'suppression') {
      const onSite = this.citizens.filter((c) => c.role === 'responder' && c.action === 'report_for_duty' && !c.helpingId && !c.path.length && !c.inside && this.distTo(c.tile, FIRE_POST) <= 2.5);
      f.respondersOnSite = onSite.length;
      f.progress = Math.min(1, f.progress + SUPPRESS_BASE + SUPPRESS_PER_RESPONDER * onSite.length);
      const peak = Math.min(1, 0.4 + ((Math.min(t, FIRE_PEAK_TICK) - FIRE_IGNITE_TICK) / (FIRE_PEAK_TICK - FIRE_IGNITE_TICK)) * 0.6);
      f.intensity = Math.max(0.05, peak * (1 - f.progress));
      if (f.progress >= 1) {
        f.phase = 'contained';
        f.containedTick = t;
        f.intensity = 0;
        f.respondersOnSite = 0;
        this.crewRescue('Firefighters help');
        this.log('incident', 'The fire is out. Crews are cooling the building.');
      }
    }
    if (f.phase === 'contained' && f.containedTick !== null && t === f.containedTick + FIRE_COOL_TICKS) {
      f.phase = 'reopened';
      this.updateClosures();
      this.log('incident', 'Safety checks done — streets around the office reopen.');
      this.interruptAll();
    }
  }

  private floodEvents(t: number) {
    const fl = this.flood;
    if (t === FLOOD_WARN_TICK) {
      fl.phase = 'warning';
      this.log('incident', 'Dark clouds roll in — heavy rain is starting.');
    }
    if (t >= FLOOD_WARN_TICK)
      fl.rain = t < FLOOD_RISE_TICK ? 0.3 + ((t - FLOOD_WARN_TICK) / (FLOOD_RISE_TICK - FLOOD_WARN_TICK)) * 0.5 : t < FLOOD_RECEDE_TICK ? 0.85 : Math.max(0, 0.85 * (1 - (t - FLOOD_RECEDE_TICK) / 250));
    if (t === FLOOD_RISE_TICK) {
      fl.phase = 'rising';
      this.log('incident', 'A cloudburst! Water starts pooling in the low streets around home 7.');
    }
    if (t >= FLOOD_RISE_TICK && t % 10 === 0 && fl.phase !== 'cleared') {
      const level = t < FLOOD_FULL_TICK ? FLOOD_START + ((t - FLOOD_RISE_TICK) / (FLOOD_FULL_TICK - FLOOD_RISE_TICK)) * (FLOOD_MAX - FLOOD_START)
        : t < FLOOD_RECEDE_TICK ? FLOOD_MAX
        : FLOOD_MAX * (1 - (t - FLOOD_RECEDE_TICK) / (FLOOD_DRY_TICK - FLOOD_RECEDE_TICK));
      this.setWaterLevel(level);
      if (t >= FLOOD_RECEDE_TICK && fl.phase === 'rising') {
        fl.phase = 'receding';
        this.log('incident', 'The rain eases. Water is starting to drain away.');
      }
      if (fl.phase === 'receding' && !fl.depth.some((d) => d > 0)) {
        fl.phase = 'cleared';
        fl.level = -1;
        this.updateClosures();
        this.crewRescue('Neighbours reach');
        this.log('incident', 'The water is gone — every street has reopened.');
        this.interruptAll();
      }
    }
    if (t === FLOOD_ALERT_TICK) {
      this.log('incident', 'Official flash-flood warning issued for the low-lying streets.');
      this.citizens.forEach((c) => this.alertCitizen(c, 'official', null, true));
    }
    const wd = (c: Citizen) => fl.wetDist[c.tile.y * this.W + c.tile.x];
    if (t === FLOOD_SLIP_TICK) this.injureFirst(this.outdoorCandidates().filter((c) => wd(c) <= 2.5).sort((a, b) => wd(a) - wd(b) || a.id.localeCompare(b.id)), 1, 'slipped in the floodwater');
    if (t === FLOOD_STRAND_TICK) {
      const cands = this.outdoorCandidates().filter((c) => c.role === 'resident' && this.waterAt(c.tile) <= 0).sort((a, b) => wd(a) - wd(b) || a.id.localeCompare(b.id));
      if (cands[0]) { this.strand([cands[0].id], 'is cut off by rising water and needs help', 'none'); this.alertCitizen(cands[0], 'observed', null, false); }
    }
  }

  private festivalEvents(t: number) {
    const fe = this.festival;
    if (t === FEST_OPEN_TICK) {
      fe.phase = 'open';
      this.log('incident', 'The street festival opens on the market plaza — music, food stalls and lights.');
      this.interruptAll();
    }
    if (t === FEST_CLOSING_TICK) {
      fe.phase = 'closing';
      this.log('incident', 'Closing announcement: the festival is winding down.');
      let k = 0;
      for (const c of this.citizens) if (c.festivalUntil !== null) c.festivalUntil = Math.min(c.festivalUntil, t + 25 + 9 * k++);
    }
    if (t === FEST_CLOSED_TICK) {
      fe.phase = 'closed';
      this.updateClosures();
      this.log('incident', 'Stalls are packed away and the plaza road reopens.');
    }
  }

  // ------------------------------------------------------------------ world-state helpers

  private outdoorCandidates() {
    return this.citizens.filter((c) => !c.inside && !c.needsHelp && c.injury === 'none');
  }

  private distTo(t: { x: number; y: number }, p: { x: number; y: number }) {
    return Math.hypot(t.x - p.x, t.y - p.y);
  }

  waterAt(t: Tile) {
    return this.flood.depth[t.y * this.W + t.x];
  }

  /** Raise or lower the flood. Closures apply in the same tick, before anyone can step onto a newly deep tile. */
  private setWaterLevel(level: number) {
    const fl = this.flood;
    fl.level = level;
    let changed = false;
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) {
        const k = y * this.W + x;
        const d = Math.max(0, Math.round((level - elevation(x, y)) * 1000) / 1000);
        if (d !== fl.depth[k]) { fl.depth[k] = d; changed = true; }
      }
    if (!changed) return;
    fl.version++;
    const wet: Tile[] = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) if (fl.depth[y * this.W + x] > 0) wet.push({ x, y });
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) {
        let best = 99;
        for (const w of wet) { const d = Math.hypot(w.x - x, w.y - y); if (d < best) best = d; }
        fl.wetDist[y * this.W + x] = best;
      }
    this.updateClosures();
  }

  private inFireCordon(x: number, y: number) {
    const c = FIRE_CORDON;
    return x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1;
  }

  get fireCordonUp() {
    return this.fire.phase === 'burning' || this.fire.phase === 'suppression' || this.fire.phase === 'contained';
  }

  get festivalRoadClosed() {
    return this.festival.phase === 'setup' || this.festival.phase === 'open' || this.festival.phase === 'closing';
  }

  /** Rebuild walkable/drivable grids from every active closure, then keep people out of newly closed tiles. */
  private updateClosures() {
    const w = this.map.baseWalkable();
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) {
        if (this.hazard && Math.hypot(x - this.hazard.center.x, y - this.hazard.center.y) <= this.hazard.radius) w[y][x] = false;
        if (this.fireCordonUp && this.inFireCordon(x, y)) w[y][x] = false;
        if (this.flood.depth[y * this.W + x] > DEEP) w[y][x] = false;
      }
    if (this.floodActive) {
      // Dry pockets cut off by water count as closed (nobody can reach them; anyone there is moved by the safety rule).
      const reach = reachMap(w, this.map.building('shelter').door);
      for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) if (w[y][x] && reach[y * this.W + x] < 0) w[y][x] = false;
    }
    this.walkable = w;
    const d = w.map((r) => [...r]);
    if (this.festivalRoadClosed) for (let x = FEST_ROAD.x0; x <= FEST_ROAD.x1; x++) d[FEST_ROAD.y][x] = false;
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) if (this.flood.depth[y * this.W + x] > 0) d[y][x] = false;
    if (this.fire.engine.arrived && this.fireActive) { const e = ENGINE_ROUTE[ENGINE_ROUTE.length - 1]; d[e.y][e.x] = false; d[e.y + 1][e.x] = false; }
    this.drivable = d;
    // Safety rule: nobody stays on (or keeps a route through) a tile that has just closed.
    for (const c of this.citizens) {
      if (c.inside) continue;
      if (!w[c.tile.y][c.tile.x]) this.evacuate(c, 'was moved clear of a closed area');
      else if (c.path.some((p) => !w[p.y][p.x])) {
        const dest = c.path[c.path.length - 1];
        c.pos = { x: c.tile.x, y: c.tile.y }; // step back to the tile centre before re-planning
        c.path = findPath(w, c.tile, dest) ?? [];
      }
    }
  }

  /** Deterministic safety rule: move a citizen to the nearest open tile outside immediate danger. Always labeled. */
  private evacuate(c: Citizen, why: string) {
    const from = c.inside ? this.map.building(c.inside).door : c.tile;
    let best: Tile | null = null, bestD = Infinity;
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) {
        if (!this.walkable[y][x] || this.trueHazardAt({ x, y }) === 'immediate') continue;
        const d = Math.hypot(x - from.x, y - from.y);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    if (!best) return;
    c.tile = best;
    c.pos = { ...best };
    c.path = [];
    c.safetyTick = this.tick;
    this.log('safety', `${first(c)} ${why}.`, c.id, { via: 'safety' });
  }

  private strand(ids: string[], why: string, injury: 'none' | 'major') {
    for (const id of ids) {
      const c = this.citizen(id);
      if (c.inside) { c.tile = this.map.building(c.inside).door; c.pos = { ...c.tile }; c.inside = null; }
      c.needsHelp = true;
      c.injury = injury;
      c.path = [];
      c.action = null;
      c.taskTargetId = null;
      c.festivalUntil = null;
      c.actionLabel = 'Needs help';
      this.log('effect', `${c.name} ${why}.`, c.id, { via: 'sim' });
    }
  }

  private injureFirst(cands: Citizen[], n: number, why: string) {
    for (const c of cands.filter((x) => x.injury === 'none' && !x.needsHelp).slice(0, n)) {
      c.injury = 'minor';
      this.log('effect', `${first(c)} ${why} (minor injury).`, c.id, { via: 'sim' });
      if (!c.pending && c.care === 'none') c.cooldown = Math.min(c.cooldown, 10);
    }
  }

  /** End-of-incident rescue: crews reach anyone still stranded. */
  private crewRescue(who: string) {
    for (const c of this.citizens) {
      if (!c.needsHelp) continue;
      c.needsHelp = false;
      if (c.injury === 'major') c.injury = 'minor';
      this.sendAfterHelp(c);
      this.log('effect', `${who} ${first(c)} — ${c.actionLabel.toLowerCase()}.`, c.id, { via: 'sim' });
    }
  }

  /** After being helped: injured people go to the clinic, others go home (or to the shelter if home is cut off). */
  private sendAfterHelp(n: Citizen) {
    n.cooldown = 160;
    const reach = reachMap(this.walkable, n.tile);
    const can = (t: Tile) => reach[t.y * this.W + t.x] >= 0;
    const clinic = this.near('clinic', n).door, shelter = this.near('shelter', n).door;
    let to: Tile = this.homeDoor(n);
    n.actionLabel = 'Heading home';
    if (n.injury !== 'none' && can(clinic)) { to = clinic; n.actionLabel = 'Walking to the clinic'; }
    else if (!can(this.homeDoor(n)) || this.trueHazardAt(this.homeDoor(n)) === 'immediate') { to = shelter; n.actionLabel = 'Heading to the shelter'; }
    n.path = findPath(this.walkable, n.tile, to) ?? [];
  }

  /** Interrupt everyone so they re-decide soon, staggered so decisions don't all land on one tick. */
  private interruptAll() {
    this.citizens.forEach((c, i) => {
      if (!c.needsHelp && !c.pending && c.care === 'none' && c.festivalUntil === null) c.cooldown = Math.min(c.cooldown, 2 + (i % 8) * 2);
    });
  }

  private alertCitizen(c: Citizen, source: Citizen['alert'], fromId: string | null, interrupt: boolean) {
    if (c.alert !== 'none') return false;
    c.alert = source;
    c.alertFromId = fromId;
    c.alertTick = this.tick;
    if (interrupt && !c.needsHelp && !c.pending && c.care === 'none' && c.festivalUntil === null) c.cooldown = Math.min(c.cooldown, 6 + (Number(c.id.slice(-2)) % 5) * 2);
    return true;
  }

  /** Fires and floods are local: people notice them only when close enough (or inside the burning building). */
  private updateObservation() {
    const f = this.fire;
    if (this.fireActive && f.phase !== 'contained') {
      const r = f.phase === 'smoke' ? 4.5 : 7;
      for (const c of this.citizens) {
        if (c.alert !== 'none') continue;
        if (c.inside === 'office' || (!c.inside && this.distTo(c.tile, FIRE_CENTER) <= r)) {
          this.alertCitizen(c, 'observed', null, true);
          this.log('effect', `${first(c)} noticed the ${f.phase === 'smoke' ? 'smoke' : 'fire'}.`, c.id, { via: 'sim' });
        }
      }
    }
    if (this.floodActive) {
      for (const c of this.citizens) {
        if (c.alert !== 'none' || c.inside) continue;
        if (this.flood.wetDist[c.tile.y * this.W + c.tile.x] <= 3.5) {
          this.alertCitizen(c, 'observed', null, true);
          this.log('effect', `${first(c)} noticed water rising in the street.`, c.id, { via: 'sim' });
        }
      }
    }
    // Anyone idle in immediate danger re-decides promptly (their options then exclude waiting there).
    for (const c of this.citizens) {
      if (c.inside || c.pending || c.needsHelp || c.helpingId || c.path.length || c.care !== 'none' || c.festivalUntil !== null) continue;
      if (this.trueHazardAt(c.tile) === 'immediate' && c.cooldown > 4) c.cooldown = 4;
    }
  }

  /** Objective hazard level at a tile (what the map says, regardless of what anyone knows). */
  trueHazardAt(t: Tile): HazardLevel {
    if (this.hazard) {
      const d = this.distTo(t, this.hazard.center);
      return d <= 3.6 ? 'immediate' : d <= 7 ? 'nearby' : 'distant';
    }
    const f = this.fire;
    if (this.fireActive) {
      const d = this.distTo(t, FIRE_CENTER);
      if (f.phase === 'smoke') return d <= 4.5 ? 'nearby' : 'distant';
      if (f.phase === 'contained') return d <= 4 ? 'nearby' : 'distant';
      return d <= 3.6 ? 'immediate' : d <= 7 ? 'nearby' : 'distant';
    }
    if (this.floodActive) {
      if (this.waterAt(t) > 0) return 'immediate';
      return this.flood.wetDist[t.y * this.W + t.x] <= 2 ? 'nearby' : 'distant';
    }
    return 'none';
  }

  hazardKind(): HazardKind {
    if (this.hazard) return 'meteor';
    if (this.fireActive) return 'fire';
    if (this.floodActive) return 'flood';
    return 'none';
  }

  /** Objective level (used by the UI). */
  hazardLevelAt(t: Tile): HazardLevel {
    return this.trueHazardAt(t);
  }

  /** What this citizen perceives (only what they could know). */
  perceivedHazard(c: Citizen): { level: HazardLevel; kind: HazardKind } {
    const kind = this.hazardKind();
    if (kind === 'none' || ((kind === 'fire' || kind === 'flood') && c.alert === 'none')) return { level: 'none', kind: 'none' };
    return { level: this.trueHazardAt(c.inside ? this.map.building(c.inside).door : c.tile), kind };
  }

  // ------------------------------------------------------------------ power grid & utility work (sim v7)

  get substation() {
    return this.map.ofKind('substation')[0];
  }
  /** Where the outage wave starts: the substation's centre. */
  get gridSource() {
    const b = this.substation;
    return { x: b.x + b.w / 2 - 0.5, y: b.y + b.h / 2 - 0.5 };
  }

  /** 0 or 1: is this point powered? The outage spreads outward from the substation; restoration spreads back. */
  powerAt(x: number, y: number) {
    const p = this.power;
    if (p.outageTick === null) return 1;
    const d = Math.hypot(x - this.gridSource.x, y - this.gridSource.y);
    if (p.restoredTick !== null) return (this.tick - p.restoredTick) * 0.35 >= d ? 1 : 0;
    return (this.tick - p.outageTick) * 0.28 >= d ? 0 : 1;
  }

  private startOutage(text: string, isolationTicks: number) {
    const t = this.tick;
    this.blackout = true;
    this.power.status = 'outage';
    this.power.outageTick = t;
    this.power.restoredTick = null;
    this.power.order = {
      id: `wo-${t}`, site: this.substation.door, createdTick: t, isolatedTick: t + isolationTicks, workRequired: REPAIR_WORK, workCompleted: 0,
      assigned: [], contractorDueTick: t + CONTRACTOR_DELAY, contractor: { stage: 'waiting', vanId: null, onSiteTick: null }, repairedBy: [],
    };
    this.log('incident', text);
  }

  /** The repair site is open for work: isolated, and not in immediate danger. */
  get repairSiteSafe() {
    const o = this.power.order;
    return !!o && this.tick >= o.isolatedTick && this.trueHazardAt(o.site) !== 'immediate';
  }

  private workersOnSite() {
    return this.citizens.filter((c) => c.utility?.stage === 'working');
  }

  private van(id: number | null): Car | undefined {
    return id === null ? undefined : this.traffic.cars.find((c) => c.id === id);
  }

  /** Entry point for the backup crew: the map-edge road tile closest to the repair site. */
  private contractorEntrance(park: Tile): Tile | null {
    let best: Tile | null = null, bestD = Infinity;
    const site = this.substation.door;
    for (const r of this.map.roads)
      for (const t of [{ x: 0, y: r }, { x: this.W - 1, y: r }, { x: r, y: 0 }, { x: r, y: this.H - 1 }]) {
        if (!this.drivable[t.y][t.x] || Math.hypot(t.x - park.x, t.y - park.y) < 6) continue; // the crew comes from out of town
        const d = Math.hypot(t.x - site.x, t.y - site.y);
        if (d < bestD) { bestD = d; best = t; }
      }
    return best;
  }

  private updatePower() {
    const p = this.power, o = p.order;
    if (!o || p.status === 'restored') return;
    const t = this.tick;
    if (p.status === 'outage' && this.repairSiteSafe) {
      p.status = 'isolated';
      this.log('effect', 'The grid is isolated — the substation is safe to work on. Utility repairs are needed.', undefined, { via: 'sim' });
      for (const c of this.citizens) if (c.role === 'utility' && !c.pending && !c.needsHelp && c.care === 'none') c.cooldown = Math.min(c.cooldown, 6);
    }
    // Backup contractor: dispatched on schedule, drives there through real traffic, then walks in.
    const k = o.contractor;
    if ((k.stage === 'waiting' && t >= o.contractorDueTick) || (k.stage === 'blocked' && t % 50 === 0)) {
      const park = this.traffic.nearestRoadTile(o.site, this.drivable);
      const entry = park ? this.contractorEntrance(park) : null;
      const van = entry && park ? this.traffic.spawnVan('contractor', entry, park, this.drivable) : null;
      if (van) {
        k.stage = 'driving';
        k.vanId = van.id;
        this.log('effect', 'Repairs are not finished — a backup utility crew has been dispatched.', undefined, { via: 'sim' });
      } else if (k.stage === 'waiting') {
        k.stage = 'blocked';
        this.log('effect', 'The backup utility crew cannot reach the substation yet — their route is blocked.', undefined, { via: 'sim' });
      }
    }
    if (k.stage === 'driving' && this.van(k.vanId)?.parked) { k.stage = 'walking'; k.onSiteTick = t + 25; }
    if (k.stage === 'walking' && k.onSiteTick !== null && t >= k.onSiteTick) {
      k.stage = 'working';
      this.log('effect', 'The backup utility crew has arrived and is helping with repairs.', undefined, { via: 'sim' });
    }
    // Repair progress: only people (and the contractor) physically on site, only once it is safe.
    if (!this.repairSiteSafe) return;
    const crew = this.workersOnSite().slice(0, MAX_UTILITY_CREW);
    const rate = crew.length + (k.stage === 'working' ? 1 : 0);
    if (!rate) return;
    p.status = 'repairing';
    o.workCompleted = Math.min(o.workRequired, o.workCompleted + rate);
    for (const c of crew) if (!o.repairedBy.includes(c.id)) o.repairedBy.push(c.id);
    if (k.stage === 'working' && !o.repairedBy.includes('contractor')) o.repairedBy.push('contractor');
    if (o.workCompleted >= o.workRequired) this.restorePower();
  }

  private restorePower() {
    const p = this.power, o = p.order!;
    p.status = 'restored';
    p.restoredTick = this.tick;
    this.blackout = false;
    const names = o.repairedBy.filter((id) => id !== 'contractor').map((id) => this.citizen(id));
    const who = [...names.map(first), ...(o.repairedBy.includes('contractor') ? ['the backup crew'] : [])];
    const credit = who.length <= 1 ? who[0] ?? 'the utility crew' : `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}`;
    this.log('incident', `Power restored — repaired by ${credit}. Lights and signals are coming back.`, undefined, { relatedIds: names.map((c) => c.id) });
    for (const c of this.citizens) {
      if (c.utility) {
        const van = this.van(c.utility.vanId);
        if (c.inVehicle !== null && van) { c.inVehicle = null; this.placeAt(c, van.parked ?? this.traffic.world(van)); }
        c.utility = null;
        c.action = null;
        c.actionLabel = 'Power restored';
        c.path = [];
        c.cooldown = 6;
      }
    }
    for (const car of [...this.traffic.cars]) if (car.kind !== 'car') this.traffic.remove(car);
    o.contractor.stage = 'done';
    this.interruptAll();
  }

  /** Put a citizen on the nearest walkable tile to a point. */
  private placeAt(c: Citizen, at: { x: number; y: number }) {
    let best = c.tile, bestD = Infinity;
    for (let y = Math.max(0, Math.floor(at.y) - 2); y <= Math.min(this.H - 1, Math.ceil(at.y) + 2); y++)
      for (let x = Math.max(0, Math.floor(at.x) - 2); x <= Math.min(this.W - 1, Math.ceil(at.x) + 2); x++) {
        if (!this.walkable[y][x]) continue;
        const d = Math.hypot(x - at.x, y - at.y);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    c.tile = { ...best };
    c.pos = { ...best };
  }

  /** restore_power job: walk to a road, drive the service van to the substation, walk to the site, work. */
  private updateUtilityJob(c: Citizen) {
    const job = c.utility!, o = this.power.order;
    if (!o || this.power.status === 'restored') { c.utility = null; return; }
    if (job.stage === 'to_van' && !c.path.length) {
      const park = this.traffic.nearestRoadTile(o.site, this.drivable);
      const van = park ? this.traffic.spawnVan('utility', c.tile, park, this.drivable) : null;
      if (van) {
        job.stage = 'driving';
        job.vanId = van.id;
        c.inVehicle = van.id;
        c.actionLabel = 'Driving the utility van to the substation';
        this.log('effect', `${first(c)} is driving the utility van to the substation.`, c.id, { via: 'sim' });
      } else {
        job.stage = 'to_site';
        this.go(c, o.site);
        c.actionLabel = 'Walking to the substation';
      }
    }
    if (job.stage === 'driving') {
      const van = this.van(job.vanId);
      if (!van) { job.stage = 'to_site'; c.inVehicle = null; this.go(c, o.site); return; }
      const w = van.parked ?? this.traffic.world(van);
      c.pos = { x: w.x, y: w.y };
      if (van.parked) {
        c.inVehicle = null;
        this.placeAt(c, van.parked);
        job.stage = 'to_site';
        this.go(c, o.site);
        c.actionLabel = 'Walking to the repair site';
      }
    }
    if (job.stage === 'to_site' && !c.path.length && Math.hypot(c.tile.x - o.site.x, c.tile.y - o.site.y) <= 1.5) {
      job.stage = 'working';
      c.actionLabel = 'Repairing the substation';
      this.log('effect', `${first(c)} reached the substation and started repairs.`, c.id, { via: 'sim' });
    } else if (job.stage === 'to_site' && !c.path.length) {
      this.go(c, o.site); // re-plan (a closure may have changed the route)
      if (!c.path.length) { c.utility = null; c.cooldown = 5; o.assigned = o.assigned.filter((id) => id !== c.id); }
    }
  }

  // ------------------------------------------------------------------ traffic (sim v7)

  private stepTraffic() {
    // Intersection modes: dark signals become all-way stops unless a responder is directing.
    for (const i of this.traffic.intersections) {
      const ctl = this.traffic.control[i.id];
      if (ctl.mode === 'responder_directed') continue;
      ctl.mode = this.powerAt(i.x, i.y) < 0.5 ? 'all_way_stop' : 'signals';
    }
    const walkers = this.citizens.filter((c) => !c.inside && c.inVehicle === null && c.trafficJob?.stage !== 'directing').map((c) => c.pos);
    this.traffic.step({ drivable: this.drivable, power: (x, y) => this.powerAt(x, y), walkers });
  }

  private staffedIntersections() {
    return this.citizens.filter((c) => c.trafficJob).map((c) => c.trafficJob!.intersectionId);
  }

  /** Dark, backed-up intersection nobody is directing: the simulation picks by congestion, then id. */
  private trafficTarget(c: Citizen, reach: Int16Array) {
    if (!this.blackout) return null;
    const staffed = this.staffedIntersections();
    if (staffed.length >= MAX_TRAFFIC_CONTROLLERS) return null;
    let best: { id: string; x: number; y: number } | null = null, bestQ = -1, bestW = -1;
    for (const i of this.traffic.intersections) {
      if (staffed.includes(i.id) || this.traffic.control[i.id].mode !== 'all_way_stop') continue;
      const st = this.traffic.stats[i.id];
      if (st.queued < 3 && st.avgWaitTicks <= 80) continue;
      if (reach[i.y * this.W + i.x] < 0) continue;
      if (st.queued > bestQ || (st.queued === bestQ && st.avgWaitTicks > bestW) || (st.queued === bestQ && st.avgWaitTicks === bestW && best && i.id < best.id)) {
        best = i; bestQ = st.queued; bestW = st.avgWaitTicks;
      }
    }
    return best;
  }

  private updateTrafficJob(c: Citizen) {
    const job = c.trafficJob!;
    const i = this.traffic.intersections.find((x) => x.id === job.intersectionId)!;
    const ctl = this.traffic.control[i.id];
    if (job.stage === 'en_route') {
      if (!this.blackout || this.powerAt(i.x, i.y) >= 0.5) { c.trafficJob = null; c.cooldown = 5; return; }
      if (!c.path.length && c.tile.x === i.x && c.tile.y === i.y) {
        job.stage = 'directing';
        job.since = this.tick;
        ctl.mode = 'responder_directed';
        ctl.controllerId = c.id;
        ctl.since = this.traffic.clock;
        c.pos = { x: i.x + 0.42, y: i.y + 0.42 }; // stand on the corner, out of the lanes
        c.actionLabel = 'Directing traffic';
        this.log('effect', `${first(c)} is directing traffic at a dark intersection.`, c.id, { via: 'sim' });
      } else if (!c.path.length) {
        this.go(c, i);
        if (!c.path.length) { c.trafficJob = null; c.cooldown = 5; }
      }
      return;
    }
    // directing: hand back to the lights once they are on again, or after a long shift
    if (this.powerAt(i.x, i.y) >= 0.5 || this.tick - job.since > 700) {
      ctl.mode = this.powerAt(i.x, i.y) >= 0.5 ? 'signals' : 'all_way_stop';
      ctl.controllerId = null;
      c.trafficJob = null;
      c.pos = { ...c.tile };
      c.action = null;
      c.actionLabel = this.powerAt(i.x, i.y) >= 0.5 ? 'Signals back on — handed over' : 'Finished a traffic shift';
      c.cooldown = 5;
      this.log('effect', `${first(c)} ${this.powerAt(i.x, i.y) >= 0.5 ? 'handed the intersection back to the traffic signals' : 'finished a shift directing traffic'}.`, c.id, { via: 'sim' });
    }
  }

  // ------------------------------------------------------------------ decision support queries

  private nearestNeedy(c: Citizen, reach: Int16Array, maxDist = 7.5): Citizen | null {
    let best: Citizen | null = null, bestD = maxDist;
    for (const o of this.citizens) {
      if (o === c || !o.needsHelp) continue;
      if (this.citizens.some((h) => h !== c && h.helpingId === o.id)) continue;
      const d = Math.hypot(o.tile.x - c.tile.x, o.tile.y - c.tile.y);
      if (d < bestD && reach[o.tile.y * this.W + o.tile.x] >= 0) { bestD = d; best = o; }
    }
    return best;
  }

  private shopOpen() {
    return true; // corner store stays open (lantern-lit during blackout)
  }

  /** Load of one clinic (defaults to the first clinic; the standard district has exactly one). */
  clinicLoad(clinicId = this.map.ofKind('clinic')[0].id) {
    const staff = this.citizens.filter((c) => c.role === 'healthcare' && c.inside === clinicId && c.care === 'none').length;
    const capacity = CLINIC_BASE_CAPACITY + Math.min(3, staff);
    const treating = this.citizens.filter((c) => c.care === 'treating' && c.inside === clinicId).length;
    const queued = this.citizens.filter((c) => c.care === 'queued' && c.inside === clinicId).length;
    return { capacity, treating, queued, staff };
  }

  private clinicStatus(c: Citizen): 'open' | 'busy' | 'closed' {
    const l = this.clinicLoad(this.near('clinic', c).id);
    return l.queued > 0 || l.treating >= l.capacity ? 'busy' : 'open';
  }

  private routineTarget(c: Citizen): Tile | null {
    switch (c.plan) {
      case 'commute_to_work':
      case 'at_work':
      case 'travel_to_clinic':
      case 'patrol': {
        const w = this.workDoor(c);
        if (!w) return this.homeDoor(c);
        if (this.blackout && (c.workId === 'office' || c.workId === 'market')) return null;
        if (this.fireActive && c.workId === 'office') return null;
        return w;
      }
      case 'go_shopping':
        return this.blackout ? this.near('shop', c).door : this.near('market', c).door;
      case 'stroll': {
        const spots: Tile[] = [{ x: 9, y: 10 }, { x: 3, y: 5 }, { x: 15, y: 11 }, { x: 10, y: 17 }, { x: 18, y: 5 }, { x: 4, y: 12 }];
        const s = spots[(Number(c.id.slice(-2)) + c.decisionSeq) % spots.length];
        return this.walkable[s.y][s.x] ? s : this.homeDoor(c);
      }
      case 'at_home':
        return this.homeDoor(c);
    }
  }

  /** Nearest reachable tile (by walking distance) that is outside the danger. */
  private safeSpot(reach: Int16Array): Tile | null {
    let best: Tile | null = null, bestD = Infinity;
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) {
        const d = reach[y * this.W + x];
        if (d < 0 || d >= bestD) continue;
        const lv = this.trueHazardAt({ x, y });
        if (lv !== 'distant' && lv !== 'none') continue;
        bestD = d;
        best = { x, y };
      }
    return best;
  }

  /** Housemates not seen since the incident began whose last known place can be visited safely; oldest contact first. */
  private familyToCheck(c: Citizen, reach: Int16Array): Citizen[] {
    if (!this.incidentKnown(c)) return [];
    const since = this.incidentStartTick;
    return Object.entries(c.family)
      .filter(([, f]) => f.lastContactTick < since && f.lastKnown && reach[f.lastKnown.y * this.W + f.lastKnown.x] >= 0 && this.trueHazardAt(f.lastKnown) !== 'immediate')
      .sort((a, b) => a[1].lastContactTick - b[1].lastContactTick || a[0].localeCompare(b[0]))
      .map(([id]) => this.citizen(id));
  }

  unaccountedFor(c: Citizen) {
    if (!this.incidentKnown(c)) return 0;
    return Object.values(c.family).filter((f) => f.lastContactTick < this.incidentStartTick).length;
  }

  /** Where someone can be found: their tile, or the door of the building they are in. */
  private spotOf(o: Citizen): Tile {
    return o.inside ? this.map.building(o.inside).door : o.tile;
  }

  /** Closest (by walking distance) person who hasn't heard about the hazard, within a short walk. */
  private warnTarget(c: Citizen, reach: Int16Array): Citizen | null {
    if (!(this.fireActive || this.floodActive) || c.alert === 'none') return null;
    let best: Citizen | null = null, bestD = 13;
    for (const o of this.citizens) {
      if (o === c || o.alert !== 'none') continue;
      const s = this.spotOf(o);
      const d = reach[s.y * this.W + s.x];
      if (d < 0 || d > bestD || (d === bestD && best && o.id > best.id)) continue;
      bestD = d;
      best = o;
    }
    return best;
  }

  private festivalSlotFree() {
    return this.festival.slots.findIndex((s) => s === null);
  }

  /** Deterministic engine gate (PRD F02). JEV only ever chooses among these. */
  getEligibleActions(c: Citizen): ActionId[] {
    const reach = reachMap(this.walkable, c.tile);
    const can = (t: Tile) => reach[t.y * this.W + t.x] >= 0;
    const out: ActionId[] = [];
    const hz = this.trueHazardAt(c.tile);
    const known = this.incidentKnown(c);
    const rt = this.routineTarget(c);
    if (rt && hz !== 'immediate' && can(rt)) out.push('continue_routine');
    if (can(this.homeDoor(c)) && this.trueHazardAt(this.homeDoor(c)) !== 'immediate') out.push('go_home');
    if (known && can(this.near('shelter', c).door)) out.push('seek_shelter');
    if (this.nearestNeedy(c, reach)) out.push('help_neighbor');
    if (this.shopOpen() && hz !== 'immediate' && c.needs.supplies >= 0.55 && can(this.near('shop', c).door)) out.push('seek_supplies');
    if (known && (c.role === 'healthcare' || c.role === 'responder')) out.push('report_for_duty');
    if (hz !== 'immediate') out.push('wait');
    if (c.injury === 'minor' && c.care === 'none' && this.clinicStatus(c) !== 'closed' && can(this.near('clinic', c).door)) out.push('seek_medical_care');
    if (known && (hz === 'nearby' || hz === 'immediate') && this.safeSpot(reach)) out.push('move_away_from_hazard');
    if (hz !== 'immediate' && this.familyToCheck(c, reach).length) out.push('check_on_family');
    if (hz !== 'immediate' && this.tick >= c.warnCooldownUntil && this.warnTarget(c, reach)) out.push('warn_others');
    const o = this.power.order;
    if (c.role === 'utility' && o && this.power.status !== 'restored' && this.repairSiteSafe && o.assigned.length < MAX_UTILITY_CREW && !o.assigned.includes(c.id) && can(o.site)) out.push('restore_power');
    if (c.role === 'responder' && known && !c.helpingId && this.trafficTarget(c, reach)) out.push('direct_traffic');
    if (this.festival.phase === 'open' && !this.incidentActive && c.festivalUntil === null && c.action !== 'attend_festival' && this.festivalSlotFree() >= 0 && FEST_SLOTS.some((s) => can(s))) out.push('attend_festival');
    return out;
  }

  buildInput(c: Citizen, eligible: ActionId[]): CitizenDecisionInput {
    const reach = reachMap(this.walkable, c.tile);
    const can = (t: Tile) => reach[t.y * this.W + t.x] >= 0;
    const ph = this.perceivedHazard(c);
    const fam = this.familyToCheck(c, reach)[0] ?? null;
    const famRec = fam ? c.family[fam.id] : null;
    const crowd = this.festival.slots.filter(Boolean).length;
    return {
      contractVersion: 'jev-city-decision-v3',
      scenario: this.scenario,
      seed: this.seed,
      simulationMinute: this.minute,
      citizen: {
        id: c.id,
        role: c.role,
        locationId: c.inside ? `${c.inside}-area` : this.map.locationIdFor(c.tile),
        currentPlan: c.plan,
        traits: c.traits,
        needs: { fatigue: round2(c.needs.fatigue), supplies: round2(c.needs.supplies) },
        injury: c.injury,
      },
      local: {
        blackout: this.blackout,
        hazard: ph.level,
        hazardKind: ph.kind,
        alertSource: this.incidentActive ? c.alert : 'none',
        nearbyPersonNeedsHelp: this.nearestNeedy(c, reach) !== null,
        unwarnedPeopleNearby: this.warnTarget(c, reach) !== null,
        clinicStatus: this.clinicStatus(c),
        reachableClinic: can(this.near('clinic', c).door),
        reachableHome: can(this.homeDoor(c)),
        reachableShelter: can(this.near('shelter', c).door),
        safeSpotReachable: ph.level === 'nearby' || ph.level === 'immediate' ? this.safeSpot(reach) !== null : false,
        shopAvailable: this.shopOpen(),
        isOnDuty: (c.role === 'healthcare' || c.role === 'responder') && (this.incidentKnown(c) || c.plan === 'at_work'),
        family: {
          householdSize: Object.keys(c.family).length,
          unaccountedFor: this.unaccountedFor(c),
          minutesSinceContact: famRec ? Math.min(1440, Math.round((this.tick - famRec.lastContactTick) * MINUTES_PER_TICK)) : null,
          lastKnownPlace: famRec?.place ?? null,
        },
        festival: this.festival.phase,
        festivalCrowd: this.festival.phase === 'none' || crowd === 0 ? 'none' : crowd <= 4 ? 'light' : crowd <= 8 ? 'moderate' : 'busy',
        festivalReachable: this.festival.phase === 'open' && FEST_SLOTS.some((s) => can(s)),
        householdAtFestival: Object.keys(c.family).filter((id) => this.citizen(id).festivalUntil !== null).length,
        power: (() => {
          const o = this.power.order;
          const utility = c.role === 'utility' && !!o && this.power.status !== 'restored';
          return {
            gridStatus: this.powerAt(c.tile.x, c.tile.y) < 0.5 ? 'outage' : 'online',
            workOrderOpen: utility,
            repairSiteReachable: utility && can(o!.site),
            repairSiteSafe: utility && this.repairSiteSafe,
            utilityCrewOnSite: utility ? this.workersOnSite().length + (o!.contractor.stage === 'working' ? 1 : 0) : 0,
          } as const;
        })(),
        traffic: (() => {
          const near = this.traffic.intersections.filter((i) => Math.hypot(i.x - c.tile.x, i.y - c.tile.y) <= 6);
          const dark = near.some((i) => this.traffic.control[i.id].mode !== 'signals');
          const q = Math.max(0, ...near.filter((i) => this.traffic.control[i.id].mode !== 'signals').map((i) => this.traffic.stats[i.id].queued));
          return {
            darkSignalsNearby: dark,
            trafficControlNeeded: c.role === 'responder' && this.incidentKnown(c) && this.trafficTarget(c, reach) !== null,
            congestionTier: q >= 3 ? 'heavy' : q >= 1 ? 'light' : 'none',
          } as const;
        })(),
      },
      eligibleActionIds: eligible,
    };
  }

  private requestDecision(c: Citizen) {
    if (c.inside) {
      const door = this.map.building(c.inside).door;
      if (!this.walkable[door.y][door.x]) {
        // Front door under water: stay in (upstairs) until the street drains.
        c.cooldown = 30;
        if (c.actionLabel !== 'Sheltering indoors — street flooded') {
          c.actionLabel = 'Sheltering indoors — street flooded';
          this.log('safety', `${first(c)} stays indoors — the street outside is flooded.`, c.id, { via: 'safety' });
        }
        return;
      }
      c.tile = door;
      c.pos = { ...c.tile };
    }
    const eligible = this.getEligibleActions(c);
    c.decisionSeq++;
    const key = `${c.id}#${c.decisionSeq}`;
    if (eligible.length < 2) {
      // Only one safe option (or none): no model is asked; the simulation acts and says so.
      const only: ActionId = eligible[0] ?? 'wait';
      c.lastDecision = {
        id: key, contractVersion: 'jev-city-decision-v3', scenario: this.scenario, citizenId: c.id, simulatedAtMinute: this.minute,
        engine: 'simulation', provenance: 'simulation', requestedModel: null, resolvedModel: null, modelTopChoice: null,
        enactedChoice: only, samplingPolicy: 'deterministic-override',
        overrideReason: eligible.length ? 'only one safe option was available, so no model was asked' : 'no safe route was available, so the citizen stays put',
        metrics: { upstreamRoundTripMs: null, browserRoundTripMs: null, inputTokens: null, outputTokens: null, estimatedApiCostUsd: null, status: 'success' },
      };
      c.action = only;
      c.inside = null;
      c.safetyTick = this.tick;
      this.execute(c, only, 'safety');
      return;
    }
    const req: DecisionRequest = { key, citizenId: c.id, seq: c.decisionSeq, requestTick: this.tick, input: this.buildInput(c, eligible) };
    c.pending = true;
    this.pending.set(req.key, req);
    this.outbox.push(req);
  }

  private applyDecision(req: DecisionRequest, res: DecisionResult) {
    const c = this.citizen(req.citizenId);
    c.pending = false;
    this.appliedKeys.push(req.key);
    if (c.needsHelp) {
      c.lastDecision = { ...res, enactedChoice: 'wait', samplingPolicy: 'deterministic-override', overrideReason: 'citizen is stranded and waiting for help' };
      return;
    }
    // Guardrail: the world may have changed during think time.
    let action = res.enactedChoice;
    const stillEligible = this.getEligibleActions(c);
    if (!stillEligible.includes(action)) {
      const fallback: ActionId = stillEligible.includes('wait') ? 'wait' : stillEligible.includes('move_away_from_hazard') ? 'move_away_from_hazard' : stillEligible[0] ?? 'wait';
      res = { ...res, enactedChoice: fallback, samplingPolicy: 'deterministic-override', overrideReason: `${action.replaceAll('_', ' ')} was no longer feasible` };
      action = fallback;
    }
    c.lastDecision = res;
    c.action = action;
    if (c.inside) c.inside = null;
    this.execute(c, action, res.provenance);
  }

  private go(c: Citizen, to: Tile | null) {
    if (!to) { c.path = []; return; }
    c.path = findPath(this.walkable, c.tile, to) ?? [];
  }

  private execute(c: Citizen, a: ActionId, via: Provenance | 'safety') {
    const emergency = this.incidentActive;
    c.cooldown = emergency ? 80 + (c.decisionSeq % 5) * 8 : 130 + ((Number(c.id.slice(-2)) * 17 + c.decisionSeq * 31) % 70);
    c.helpingId = null;
    c.taskTargetId = null;
    const reach = reachMap(this.walkable, c.tile);
    let related: string[] | undefined;
    switch (a) {
      case 'continue_routine': {
        this.go(c, this.routineTarget(c));
        c.actionLabel = { commute_to_work: 'Heading to work', at_work: 'Working', go_shopping: 'Going shopping', stroll: 'Out for a stroll', at_home: 'Relaxing at home', travel_to_clinic: 'Heading to the clinic shift', patrol: 'On patrol' }[c.plan];
        break;
      }
      case 'go_home':
        this.go(c, this.homeDoor(c));
        c.actionLabel = 'Going home';
        c.plan = 'at_home';
        break;
      case 'seek_shelter':
        this.go(c, this.near('shelter', c).door);
        c.actionLabel = 'Seeking shelter';
        break;
      case 'help_neighbor': {
        const n = this.nearestNeedy(c, reach);
        if (n) { c.helpingId = n.id; this.go(c, n.tile); c.actionLabel = `Helping ${first(n)}`; related = [n.id]; }
        break;
      }
      case 'seek_supplies':
        this.go(c, this.near('shop', c).door);
        c.actionLabel = 'Getting supplies';
        break;
      case 'report_for_duty': {
        const needy = c.role === 'responder' ? this.nearestNeedy(c, reach, Infinity) : null;
        const fire = c.role === 'responder' && (this.fire.phase === 'burning' || this.fire.phase === 'suppression');
        const post = c.role === 'healthcare' ? this.workDoor(c) ?? this.near('clinic', c).door : needy?.tile ?? (fire ? FIRE_POST : this.workDoor(c) ?? this.near('firestation', c).door);
        if (needy) { c.helpingId = needy.id; related = [needy.id]; }
        this.go(c, post);
        c.actionLabel = c.role === 'healthcare' ? 'Reporting to the clinic' : needy ? `Responding to ${first(needy)}` : fire ? 'Joining the fire crew' : 'Reporting to the station';
        break;
      }
      case 'wait':
        c.path = [];
        c.cooldown = emergency ? 55 : 90;
        c.actionLabel = via === 'safety' ? 'Staying put — no safe route' : 'Waiting it out';
        break;
      case 'seek_medical_care':
        this.go(c, this.near('clinic', c).door);
        c.actionLabel = 'Going to the clinic for treatment';
        c.cooldown = 200;
        break;
      case 'move_away_from_hazard': {
        this.go(c, this.safeSpot(reach));
        c.actionLabel = { meteor: 'Moving away from the crater', fire: 'Moving away from the smoke', flood: 'Moving away from the water', none: 'Moving to a safer spot' }[this.hazardKind()];
        c.cooldown = 60;
        break;
      }
      case 'check_on_family': {
        const m = this.familyToCheck(c, reach)[0];
        if (m) {
          c.taskTargetId = m.id;
          related = [m.id];
          this.go(c, c.family[m.id].lastKnown);
          c.actionLabel = `Checking on ${first(m)}`;
          c.cooldown = 220;
        }
        break;
      }
      case 'warn_others': {
        const o = this.warnTarget(c, reach);
        if (o) {
          c.taskTargetId = o.id;
          related = [o.id];
          this.go(c, this.spotOf(o));
          c.actionLabel = o.inside ? `Warning people at the ${this.map.building(o.inside).label.toLowerCase()}` : `Warning ${first(o)}`;
          c.cooldown = 220;
        }
        break;
      }
      case 'restore_power': {
        const o = this.power.order!;
        o.assigned.push(c.id);
        c.utility = { orderId: o.id, stage: 'to_van', vanId: null };
        const road = this.traffic.nearestRoadTile(c.tile, this.drivable);
        const far = Math.hypot(o.site.x - c.tile.x, o.site.y - c.tile.y) > 6;
        if (road && far) { this.go(c, road); c.actionLabel = 'Heading to the utility van'; }
        else { c.utility.stage = 'to_site'; this.go(c, o.site); c.actionLabel = 'Walking to the substation'; }
        c.cooldown = 9999;
        break;
      }
      case 'direct_traffic': {
        const i = this.trafficTarget(c, reach);
        if (i) {
          c.trafficJob = { intersectionId: i.id, stage: 'en_route', since: this.tick };
          this.go(c, i);
          c.actionLabel = 'Going to direct traffic';
          c.cooldown = 9999;
        }
        break;
      }
      case 'attend_festival': {
        const i = this.festivalSlotFree();
        if (i >= 0) {
          this.festival.slots[i] = c.id;
          this.go(c, FEST_SLOTS[i]);
          c.actionLabel = 'Going to the festival';
          c.cooldown = 400;
        }
        break;
      }
    }
    const verb = c.actionLabel.charAt(0).toLowerCase() + c.actionLabel.slice(1);
    this.log('action', `${first(c)} — ${verb}.`, c.id, { via, relatedIds: related });
    // Arrived instantly (already standing at the destination).
    if (!c.path.length && ['attend_festival', 'check_on_family', 'seek_medical_care'].includes(a)) this.arrive(c);
  }

  private updateCitizen(c: Citizen) {
    c.needs.fatigue = Math.min(1, c.needs.fatigue + 0.00025);
    c.needs.supplies = Math.min(1, c.needs.supplies + 0.0002);

    // Smoke exposure while outdoors close to the flames.
    if (!c.inside && (this.fire.phase === 'burning' || this.fire.phase === 'suppression') && this.trueHazardAt(c.tile) === 'immediate') {
      c.exposure++;
      if (c.exposure === 90) this.injureFirst([c], 1, 'is coughing from the smoke');
    }

    if (c.needsHelp || c.care !== 'none') return;
    if (c.inVehicle !== null) { this.updateUtilityJob(c); return; }
    // Free a festival spot if the citizen has gone off to do something else.
    const slot = this.festival.slots.indexOf(c.id);
    if (slot >= 0 && c.action !== 'attend_festival') this.festival.slots[slot] = null;

    // Movement along path.
    if (c.path.length) {
      const next = c.path[0];
      const dx = next.x - c.pos.x, dy = next.y - c.pos.y;
      const d = Math.hypot(dx, dy);
      if (d !== 0) c.facing = dx - dy >= 0 ? 1 : -1;
      const speed = SPEED * (c.injury === 'minor' ? 0.7 : 1) * (this.waterAt(c.tile) > 0 ? 0.55 : 1);
      if (d <= speed) {
        c.pos = { x: next.x, y: next.y };
        c.tile = { ...next };
        c.path.shift();
        if (!c.path.length) this.arrive(c);
      } else {
        c.pos = { x: c.pos.x + (dx / d) * speed, y: c.pos.y + (dy / d) * speed };
      }
    } else if (c.helpingId) {
      this.tendHelp(c);
    }

    if (c.utility) { this.updateUtilityJob(c); return; }
    if (c.trafficJob) { this.updateTrafficJob(c); return; }
    if (c.festivalUntil !== null) {
      if (this.tick >= c.festivalUntil) {
        c.festivalUntil = null;
        const i = this.festival.slots.indexOf(c.id);
        if (i >= 0) this.festival.slots[i] = null;
        c.action = null;
        c.actionLabel = 'Leaving the festival';
        c.cooldown = 2;
      }
      return;
    }
    if (!c.pending && !c.helpingId && c.care === 'none') {
      c.cooldown--;
      if (c.cooldown <= 0) this.requestDecision(c);
    }
  }

  private tendHelp(c: Citizen) {
    const n = this.citizens.find((x) => x.id === c.helpingId);
    if (!n || !n.needsHelp) { c.helpingId = null; return; }
    if (Math.hypot(n.tile.x - c.tile.x, n.tile.y - c.tile.y) > 1.5) { this.go(c, n.tile); return; }
    c.helpProgress++;
    if (c.helpProgress >= 45) {
      c.helpProgress = 0;
      c.helpingId = null;
      n.needsHelp = false;
      if (n.injury === 'major') n.injury = 'minor';
      this.sendAfterHelp(n);
      const dest = n.path[n.path.length - 1];
      this.log('effect', `${first(c)} helped ${first(n)} — ${n.actionLabel.toLowerCase()}.`, c.id, { via: 'sim', relatedIds: [n.id] });
      if (dest) this.go(c, dest);
      c.actionLabel = `Escorting ${first(n)}`;
    }
  }

  private arrive(c: Citizen) {
    if (c.helpingId || c.utility || c.trafficJob) return;
    const at = this.map.buildings.find((b) => b.door.x === c.tile.x && b.door.y === c.tile.y);
    if (c.action === 'check_on_family' && c.taskTargetId) this.searchArrived(c, at?.id ?? null);
    if (c.action === 'attend_festival' && this.festival.slots.includes(c.id) && c.festivalUntil === null) {
      c.festivalUntil = this.tick + 220 + (c.decisionSeq % 4) * 25;
      c.actionLabel = 'Enjoying the festival';
      c.needs.supplies = Math.max(0, c.needs.supplies - 0.15);
      this.log('effect', `${first(c)} joined the festival crowd.`, c.id, { via: 'sim' });
      return;
    }
    if (!at) {
      if (c.plan === 'stroll') c.plan = 'go_shopping';
      return;
    }
    if (at.kind === 'shop' && c.action === 'seek_supplies') {
      c.needs.supplies = 0.05;
      this.log('effect', `${first(c)} picked up supplies at the corner store.`, c.id, { via: 'sim' });
    }
    if (at.kind === 'house' && at.id === c.homeId) c.needs.fatigue = Math.max(0, c.needs.fatigue - 0.3);
    // Advance routine plans on arrival.
    if (c.action === 'continue_routine') {
      const nextPlan: Partial<Record<Plan, Plan>> = { commute_to_work: 'at_work', go_shopping: c.workId ? 'commute_to_work' : 'at_home', at_home: 'stroll', at_work: 'go_shopping', travel_to_clinic: 'at_work', patrol: 'at_work' };
      c.plan = nextPlan[c.plan] ?? c.plan;
    }
    c.inside = at.id;
    if (at.kind === 'clinic' && c.injury !== 'none' && c.care === 'none') {
      c.care = 'queued';
      c.careUntil = this.tick; // queue order
      c.actionLabel = 'Waiting for treatment';
    }
  }

  /** A family search reached its destination: found them, or they weren't there (the searcher only knew an old location). */
  private searchArrived(c: Citizen, buildingId: string | null) {
    const m = this.citizen(c.taskTargetId!);
    const here = (buildingId && m.inside === buildingId) || (!m.inside && Math.hypot(m.pos.x - c.pos.x, m.pos.y - c.pos.y) <= 1.6);
    if (here) { this.reunite(c, m); return; }
    const place = this.map.placeLabel(c.family[m.id].place);
    c.family[m.id].lastKnown = null;
    c.taskTargetId = null;
    c.cooldown = Math.min(c.cooldown, 12);
    this.log('effect', `${first(c)} looked for ${first(m)} at ${place} — they weren't there.`, c.id, { via: 'sim', relatedIds: [m.id] });
  }

  private reunite(c: Citizen, m: Citizen) {
    this.touch(c, m);
    c.reunionTick = m.reunionTick = this.tick;
    c.taskTargetId = null;
    c.path = [];
    c.cooldown = Math.min(c.cooldown, 25);
    this.log('effect', `${first(c)} found ${first(m)}${m.needsHelp ? ` — ${first(m)} needs help` : ' — both are safe'}.`, c.id, { via: 'sim', relatedIds: [m.id] });
  }

  /** Record that two housemates have just seen each other (and heard where the other is heading). */
  private touch(a: Citizen, b: Citizen) {
    const where = (o: Citizen) => (o.path.length ? o.path[o.path.length - 1] : o.inside ? this.map.building(o.inside).door : o.tile);
    a.family[b.id] = { lastContactTick: this.tick, lastKnown: where(b), place: this.map.locationIdFor(where(b)) };
    b.family[a.id] = { lastContactTick: this.tick, lastKnown: where(a), place: this.map.locationIdFor(where(a)) };
  }

  private updateContacts() {
    for (const c of this.citizens)
      for (const id of Object.keys(c.family)) {
        if (id < c.id) continue; // each pair once
        const m = this.citizen(id);
        const together = (c.inside && c.inside === m.inside) || (!c.inside && !m.inside && Math.hypot(c.pos.x - m.pos.x, c.pos.y - m.pos.y) <= 1.6);
        if (!together) continue;
        const searching = (s: Citizen, o: Citizen) => s.action === 'check_on_family' && s.taskTargetId === o.id;
        if (searching(c, m)) this.reunite(c, m);
        else if (searching(m, c)) this.reunite(m, c);
        else this.touch(c, m);
      }
  }

  /** Warnings are delivered in person: people close to a warner (or inside the building whose door they reach) learn of the hazard. */
  private updateWarnings() {
    for (const c of this.citizens) {
      if (c.action !== 'warn_others' || !c.taskTargetId || c.inside || c.needsHelp) continue;
      const door = this.map.buildings.find((b) => Math.hypot(b.door.x - c.pos.x, b.door.y - c.pos.y) < 0.6);
      const told = this.citizens.filter((o) => o !== c && o.alert === 'none' && ((!o.inside && Math.hypot(o.pos.x - c.pos.x, o.pos.y - c.pos.y) <= 2) || (door && o.inside === door.id)));
      if (told.length) {
        const kind = this.hazardKind() === 'flood' ? 'the flooding' : 'the fire';
        for (const o of told) { this.alertCitizen(o, 'from_citizen', c.id, true); o.warnedTick = this.tick; }
        c.warnGaveTick = this.tick;
        c.taskTargetId = null;
        c.path = [];
        c.warnCooldownUntil = this.tick + 250;
        c.cooldown = Math.min(c.cooldown, 15);
        this.log('effect', `${first(c)} warned ${listNames(told)} about ${kind}.`, c.id, { via: 'sim', relatedIds: told.map((o) => o.id) });
        continue;
      }
      if (this.tick % 10 !== 0) continue;
      // The target moved, or heard from someone else: re-target, or give up if nobody nearby is left.
      const t = this.citizen(c.taskTargetId);
      const next = t.alert === 'none' ? t : this.warnTarget(c, reachMap(this.walkable, c.tile));
      if (!next) {
        c.taskTargetId = null;
        c.path = [];
        c.cooldown = Math.min(c.cooldown, 10);
        this.log('effect', `${first(c)} found everyone nearby had already heard.`, c.id, { via: 'sim' });
        continue;
      }
      const spot = this.spotOf(next);
      const dest = c.path[c.path.length - 1];
      if (next !== t || !dest || dest.x !== spot.x || dest.y !== spot.y) { c.taskTargetId = next.id; this.go(c, spot); }
    }
  }

  /** Clinic: a fixed number of beds plus one per on-duty healthcare worker inside; first come, first treated. */
  private updateClinic() {
    for (const c of this.citizens) {
      if (c.care === 'treating' && this.tick >= c.careUntil) {
        c.care = 'none';
        c.injury = 'none';
        c.actionLabel = 'Treated — feeling better';
        c.cooldown = 8;
        this.log('effect', `${first(c)} was treated at the clinic and is fine.`, c.id, { via: 'sim' });
      }
    }
    for (const clinic of this.map.ofKind('clinic')) {
      const load = this.clinicLoad(clinic.id);
      let free = load.capacity - load.treating;
      if (free <= 0) continue;
      const queue = this.citizens.filter((c) => c.care === 'queued' && c.inside === clinic.id).sort((a, b) => a.careUntil - b.careUntil || a.id.localeCompare(b.id));
      for (const c of queue) {
        if (free-- <= 0) break;
        c.care = 'treating';
        c.careUntil = this.tick + TREAT_TICKS;
        c.actionLabel = 'Being treated';
      }
    }
  }

  occupancy(buildingId: string) {
    return this.citizens.filter((c) => c.inside === buildingId).length;
  }

  festivalCrowd() {
    return this.citizens.filter((c) => c.festivalUntil !== null).length;
  }
}

export { MAP_W, MAP_H };

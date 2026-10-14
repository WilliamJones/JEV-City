import { createPopulation, homeDoor, spawnCitizen, workDoor, type Citizen } from './citizens';
import { BUILDINGS, buildBaseWalkable, buildingById, findPath, locationIdFor, MAP_H, MAP_W, type Tile } from './map';
import { createRng, round2, type Rng } from './rng';
import type {
  ActionId,
  CitizenDecisionInputV1,
  DecisionResultV1,
  HazardLevel,
  Plan,
  ScenarioId,
} from './types';

export const TICK_MS = 100;
export const MINUTES_PER_TICK = 0.1;
/** Fixed logical "think time": a decision requested at tick t is applied at t + THINK_TICKS. */
export const THINK_TICKS = 4;
const SPEED = 0.11; // tiles per tick

export type SimEvent = {
  tick: number;
  minute: number;
  kind: 'incident' | 'action' | 'effect';
  text: string;
  citizenId?: string;
};

export type DecisionRequest = {
  key: string;
  citizenId: string;
  seq: number;
  requestTick: number;
  input: CitizenDecisionInputV1;
};

export type Hazard = { center: { x: number; y: number }; radius: number; impactTick: number };

export const SCENARIO_META: Record<ScenarioId, { title: string; startMinute: number; night: boolean; blurb: string }> = {
  ordinary_morning: { title: 'Ordinary Morning', startMinute: 7 * 60 + 40, night: false, blurb: 'Commutes, coffee and errands.' },
  blackout: { title: 'Citywide Blackout', startMinute: 18 * 60 + 50, night: true, blurb: 'The grid fails at dusk.' },
  meteor: { title: 'Meteor Near the Market', startMinute: 12 * 60 + 30, night: false, blurb: 'A fragment lands by the market.' },
};

const BLACKOUT_TICK = 60;
const POWER_RESTORED_TICK = 1700;
const METEOR_WARN_TICK = 50;
const METEOR_IMPACT_TICK = 90;
const METEOR_CENTER = { x: 9, y: 11 };
const METEOR_RADIUS = 2.3;

export class Simulation {
  readonly scenario: ScenarioId;
  readonly seed: number;
  tick = 0;
  citizens: Citizen[];
  events: SimEvent[] = [];
  blackout = false;
  hazard: Hazard | null = null;
  meteorIncoming = false;
  walkable: boolean[][];
  /** Requests emitted and waiting for a provider. */
  outbox: DecisionRequest[] = [];
  private pending = new Map<string, DecisionRequest>();
  private provided = new Map<string, DecisionResultV1>();
  private rng: Rng;
  stalled = false;

  constructor(scenario: ScenarioId, seed: number) {
    this.scenario = scenario;
    this.seed = seed;
    this.rng = createRng(seed);
    this.walkable = buildBaseWalkable();
    const pop = createPopulation(seed);
    this.citizens = pop.map((s, i) => {
      const start = this.startTile(s.homeId, i);
      const plan: Plan = s.workId ? (s.role === 'healthcare' ? 'travel_to_clinic' : s.role === 'responder' ? 'patrol' : 'commute_to_work') : 'stroll';
      const c = spawnCitizen(s, start, plan, {
        fatigue: round2(this.rng.range(0.1, 0.5)),
        supplies: round2(this.rng.range(0.1, 0.7)),
      });
      c.cooldown = 3 + i * 5;
      return c;
    });
    this.log('incident', `${SCENARIO_META[scenario].title} begins.`);
  }

  get minute() {
    return Math.floor(SCENARIO_META[this.scenario].startMinute + this.tick * MINUTES_PER_TICK) % 1440;
  }
  get incidentActive() {
    return this.blackout || this.hazard !== null;
  }

  private startTile(homeId: string, i: number): Tile {
    const d = buildingById(homeId).door;
    if (this.scenario === 'ordinary_morning') return d;
    // Afternoon/evening: spread people around the district.
    for (let attempt = 0; attempt < 50; attempt++) {
      const t = { x: this.rng.int(0, MAP_W), y: this.rng.int(0, MAP_H) };
      if (this.walkable[t.y][t.x]) return t;
    }
    return { x: (i * 3) % MAP_W, y: 5 };
  }

  private log(kind: SimEvent['kind'], text: string, citizenId?: string) {
    this.events.push({ tick: this.tick, minute: this.minute, kind, text, citizenId });
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  /** Providers call this with a finished decision for a request key. */
  provide(key: string, result: DecisionResultV1) {
    if (this.pending.has(key)) this.provided.set(key, result);
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
    this.tick++;
    return true;
  }

  private applyScenarioEvents() {
    const t = this.tick;
    if (this.scenario === 'blackout') {
      if (t === BLACKOUT_TICK) {
        this.blackout = true;
        this.log('incident', 'Substation failure — the district goes dark.');
        this.log('effect', 'Market hall and office tower close. Corner store stays open by lantern. Clinic switches to generator.');
        this.strand(['citizen-06', 'citizen-11', 'citizen-22'], 'needs help in the dark');
        this.interruptAll();
      }
      if (t === POWER_RESTORED_TICK) {
        this.blackout = false;
        this.log('incident', 'Power restored across the district.');
        this.interruptAll();
      }
    }
    if (this.scenario === 'meteor') {
      if (t === METEOR_WARN_TICK) {
        this.meteorIncoming = true;
        this.log('incident', 'A bright streak crosses the sky above the market…');
      }
      if (t === METEOR_IMPACT_TICK) {
        this.meteorIncoming = false;
        this.hazard = { center: METEOR_CENTER, radius: METEOR_RADIUS, impactTick: t };
        for (let y = 0; y < MAP_H; y++)
          for (let x = 0; x < MAP_W; x++)
            if (Math.hypot(x - METEOR_CENTER.x, y - METEOR_CENTER.y) <= METEOR_RADIUS) this.walkable[y][x] = false;
        this.log('incident', 'Impact! A meteor fragment strikes beside the market hall.');
        this.log('effect', 'Roads around the market are closed. Dust drifts east.');
        const byDist = [...this.citizens]
          .filter((c) => !c.inside)
          .sort((a, b) => this.distToHazard(a.tile) - this.distToHazard(b.tile) || a.id.localeCompare(b.id));
        for (const c of this.citizens) if (!this.walkable[c.tile.y][c.tile.x]) this.evacuateTile(c);
        this.strand(byDist.slice(0, 3).map((c) => c.id), 'is shaken and stranded near the crater');
        this.interruptAll();
      }
    }
  }

  private distToHazard(t: Tile) {
    return this.hazard ? Math.hypot(t.x - this.hazard.center.x, t.y - this.hazard.center.y) : Infinity;
  }

  private evacuateTile(c: Citizen) {
    let best: Tile | null = null, bestD = Infinity;
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (!this.walkable[y][x]) continue;
        const d = Math.hypot(x - c.tile.x, y - c.tile.y);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    if (best) { c.tile = best; c.pos = { ...best }; c.path = []; }
  }

  private strand(ids: string[], why: string) {
    for (const id of ids) {
      const c = this.citizens.find((x) => x.id === id)!;
      if (c.inside) { c.tile = buildingById(c.inside).door; c.pos = { ...c.tile }; c.inside = null; }
      c.needsHelp = true;
      c.path = [];
      c.action = null;
      c.actionLabel = 'Needs help';
      this.log('effect', `${c.name} ${why}.`, c.id);
    }
  }

  private interruptAll() {
    this.citizens.forEach((c, i) => {
      if (!c.needsHelp && !c.pending) c.cooldown = Math.min(c.cooldown, 2 + (i % 8) * 2);
    });
  }

  hazardLevelAt(t: Tile): HazardLevel {
    if (!this.hazard) return 'none';
    const d = this.distToHazard(t);
    return d <= 3.6 ? 'immediate' : d <= 7 ? 'nearby' : 'distant';
  }

  private reachable(c: Citizen, to: Tile) {
    return findPath(this.walkable, c.tile, to) !== null;
  }

  private nearestNeedy(c: Citizen, maxDist = 7.5): Citizen | null {
    let best: Citizen | null = null, bestD = maxDist;
    for (const o of this.citizens) {
      if (o === c || !o.needsHelp) continue;
      if (this.citizens.some((h) => h !== c && h.helpingId === o.id)) continue;
      const d = Math.hypot(o.tile.x - c.tile.x, o.tile.y - c.tile.y);
      if (d < bestD && this.reachable(c, o.tile)) { bestD = d; best = o; }
    }
    return best;
  }

  private shopOpen() {
    return true; // corner store stays open (lantern-lit during blackout)
  }

  private routineTarget(c: Citizen): Tile | null {
    switch (c.plan) {
      case 'commute_to_work':
      case 'at_work':
      case 'travel_to_clinic':
      case 'patrol': {
        const w = workDoor(c);
        if (!w) return homeDoor(c);
        if (this.blackout && (c.workId === 'office' || c.workId === 'market')) return null;
        return w;
      }
      case 'go_shopping':
        return this.blackout ? buildingById('shop').door : buildingById('market').door;
      case 'stroll': {
        const spots: Tile[] = [{ x: 9, y: 10 }, { x: 3, y: 5 }, { x: 15, y: 11 }, { x: 10, y: 17 }, { x: 18, y: 5 }, { x: 4, y: 12 }];
        const s = spots[(Number(c.id.slice(-2)) + c.decisionSeq) % spots.length];
        return this.walkable[s.y][s.x] ? s : homeDoor(c);
      }
      case 'at_home':
        return homeDoor(c);
    }
  }

  /** Deterministic engine gate (PRD F02). JEV only ever chooses among these. */
  getEligibleActions(c: Citizen): ActionId[] {
    const out: ActionId[] = [];
    const hz = this.hazardLevelAt(c.tile);
    const rt = this.routineTarget(c);
    if (rt && hz !== 'immediate' && this.reachable(c, rt)) out.push('continue_routine');
    if (this.reachable(c, homeDoor(c)) && this.hazardLevelAt(homeDoor(c)) !== 'immediate') out.push('go_home');
    if (this.incidentActive && this.reachable(c, buildingById('shelter').door)) out.push('seek_shelter');
    if (this.nearestNeedy(c)) out.push('help_neighbor');
    if (this.shopOpen() && hz !== 'immediate' && c.needs.supplies >= 0.55 && this.reachable(c, buildingById('shop').door)) out.push('seek_supplies');
    if (this.incidentActive && (c.role === 'healthcare' || c.role === 'responder')) out.push('report_for_duty');
    out.push('wait');
    return out;
  }

  buildInput(c: Citizen, eligible: ActionId[]): CitizenDecisionInputV1 {
    return {
      contractVersion: 'jev-city-decision-v1',
      scenario: this.scenario,
      seed: this.seed,
      simulationMinute: this.minute,
      citizen: {
        id: c.id,
        role: c.role,
        locationId: c.inside ? `${c.inside}-area` : locationIdFor(c.tile),
        currentPlan: c.plan,
        traits: c.traits,
        needs: { fatigue: round2(c.needs.fatigue), supplies: round2(c.needs.supplies) },
      },
      local: {
        blackout: this.blackout,
        hazard: this.hazardLevelAt(c.tile),
        nearbyPersonNeedsHelp: this.nearestNeedy(c) !== null,
        clinicOperational: true,
        reachableHome: this.reachable(c, homeDoor(c)),
        reachableShelter: this.reachable(c, buildingById('shelter').door),
        shopAvailable: this.shopOpen(),
        isOnDuty: (c.role === 'healthcare' || c.role === 'responder') && (this.incidentActive || c.plan === 'at_work'),
      },
      eligibleActionIds: eligible,
    };
  }

  private requestDecision(c: Citizen) {
    if (c.inside) {
      c.tile = buildingById(c.inside).door;
      c.pos = { ...c.tile };
    }
    const eligible = this.getEligibleActions(c);
    c.decisionSeq++;
    const req: DecisionRequest = {
      key: `${c.id}#${c.decisionSeq}`,
      citizenId: c.id,
      seq: c.decisionSeq,
      requestTick: this.tick,
      input: this.buildInput(c, eligible),
    };
    c.pending = true;
    this.pending.set(req.key, req);
    this.outbox.push(req);
  }

  private applyDecision(req: DecisionRequest, res: DecisionResultV1) {
    const c = this.citizens.find((x) => x.id === req.citizenId)!;
    c.pending = false;
    if (c.needsHelp) {
      c.lastDecision = { ...res, enactedChoice: 'wait', samplingPolicy: 'deterministic-override', overrideReason: 'citizen is stranded and waiting for help' };
      return;
    }
    // Guardrail: the world may have changed during think time.
    let action = res.enactedChoice;
    const stillEligible = this.getEligibleActions(c);
    if (!stillEligible.includes(action)) {
      res = { ...res, enactedChoice: 'wait', samplingPolicy: 'deterministic-override', overrideReason: `${action} no longer feasible` };
      action = 'wait';
    }
    c.lastDecision = res;
    c.action = action;
    if (c.inside) c.inside = null;
    this.execute(c, action);
  }

  private go(c: Citizen, to: Tile | null) {
    if (!to) { c.path = []; return; }
    c.path = findPath(this.walkable, c.tile, to) ?? [];
  }

  private execute(c: Citizen, a: ActionId) {
    const emergency = this.incidentActive;
    c.cooldown = emergency ? 80 + (c.decisionSeq % 5) * 8 : 130 + ((Number(c.id.slice(-2)) * 17 + c.decisionSeq * 31) % 70);
    c.helpingId = null;
    switch (a) {
      case 'continue_routine': {
        this.go(c, this.routineTarget(c));
        c.actionLabel = { commute_to_work: 'Heading to work', at_work: 'Working', go_shopping: 'Going shopping', stroll: 'Out for a stroll', at_home: 'Relaxing at home', travel_to_clinic: 'Heading to the clinic shift', patrol: 'On patrol' }[c.plan];
        break;
      }
      case 'go_home':
        this.go(c, homeDoor(c));
        c.actionLabel = 'Going home';
        c.plan = 'at_home';
        break;
      case 'seek_shelter':
        this.go(c, buildingById('shelter').door);
        c.actionLabel = 'Seeking shelter';
        break;
      case 'help_neighbor': {
        const n = this.nearestNeedy(c);
        if (n) { c.helpingId = n.id; this.go(c, n.tile); c.actionLabel = `Helping ${n.name.split(' ')[0]}`; }
        break;
      }
      case 'seek_supplies':
        this.go(c, buildingById('shop').door);
        c.actionLabel = 'Getting supplies';
        break;
      case 'report_for_duty': {
        const needy = c.role === 'responder' ? this.nearestNeedy(c, Infinity) : null;
        const post = c.role === 'healthcare' ? buildingById('clinic').door : needy?.tile ?? buildingById('firestation').door;
        if (needy) c.helpingId = needy.id;
        this.go(c, post);
        c.actionLabel = c.role === 'healthcare' ? 'Reporting to the clinic' : needy ? `Responding to ${needy.name.split(' ')[0]}` : 'Reporting to the station';
        break;
      }
      case 'wait':
        c.path = [];
        c.cooldown = emergency ? 55 : 90;
        c.actionLabel = 'Waiting it out';
        break;
    }
    const verb = c.actionLabel.charAt(0).toLowerCase() + c.actionLabel.slice(1);
    this.log('action', `${c.name.split(' ')[0]} — ${verb}.`, c.id);
  }

  private updateCitizen(c: Citizen) {
    c.needs.fatigue = Math.min(1, c.needs.fatigue + 0.00025);
    c.needs.supplies = Math.min(1, c.needs.supplies + 0.0002);

    if (c.needsHelp) return;

    // Movement along path.
    if (c.path.length) {
      const next = c.path[0];
      const dx = next.x - c.pos.x, dy = next.y - c.pos.y;
      const d = Math.hypot(dx, dy);
      if (d !== 0) c.facing = dx - dy >= 0 ? 1 : -1;
      if (d <= SPEED) {
        c.pos = { x: next.x, y: next.y };
        c.tile = { ...next };
        c.path.shift();
        if (!c.path.length) this.arrive(c);
      } else {
        c.pos = { x: c.pos.x + (dx / d) * SPEED, y: c.pos.y + (dy / d) * SPEED };
      }
    } else if (c.helpingId) {
      this.tendHelp(c);
    }

    if (!c.pending && !c.helpingId) {
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
      n.actionLabel = 'Walking to the clinic';
      n.cooldown = 120;
      n.path = findPath(this.walkable, n.tile, buildingById('clinic').door) ?? [];
      this.log('effect', `${c.name.split(' ')[0]} helped ${n.name.split(' ')[0]} — they head to the clinic together.`, c.id);
      this.go(c, buildingById('clinic').door);
      c.actionLabel = `Escorting ${n.name.split(' ')[0]}`;
    }
  }

  private arrive(c: Citizen) {
    if (c.helpingId) return;
    const at = BUILDINGS.find((b) => b.door.x === c.tile.x && b.door.y === c.tile.y);
    if (!at) {
      if (c.plan === 'stroll') c.plan = 'go_shopping';
      return;
    }
    if (at.kind === 'shop' && c.action === 'seek_supplies') {
      c.needs.supplies = 0.05;
      this.log('effect', `${c.name.split(' ')[0]} picked up supplies at the corner store.`, c.id);
    }
    if (at.kind === 'house' && at.id === c.homeId) c.needs.fatigue = Math.max(0, c.needs.fatigue - 0.3);
    // Advance routine plans on arrival.
    if (c.action === 'continue_routine') {
      const nextPlan: Partial<Record<Plan, Plan>> = { commute_to_work: 'at_work', go_shopping: c.workId ? 'commute_to_work' : 'at_home', at_home: 'stroll', at_work: 'go_shopping', travel_to_clinic: 'at_work', patrol: 'at_work' };
      c.plan = nextPlan[c.plan] ?? c.plan;
    }
    c.inside = at.id;
  }

  occupancy(buildingId: string) {
    return this.citizens.filter((c) => c.inside === buildingId).length;
  }
}

export { MAP_W, MAP_H };

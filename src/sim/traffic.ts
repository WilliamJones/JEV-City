import type { CityMap, Tile } from './map';
import { createRng, type Rng } from './rng';

/**
 * Deterministic traffic (sim v7). Runs inside the simulation at a fixed sub-step so replays reproduce every car
 * exactly. Two-way roads, turns, signals (dark during an outage → all-way stop, or responder-directed when a citizen
 * chose to direct traffic), car-following, pedestrian yielding, closures, and routed service vans.
 *
 * Units: tiles; one sub-step = one 1/60 s frame at 1× speed; SUBSTEPS sub-steps per simulation tick.
 */
export const SUBSTEPS = 6;
export const LANE = 0.22;
const CRUISE = 0.045;
export const STOP_LINE = 0.66;
const CYCLE = 9; // signal cycle, seconds
const DIRECTED_CYCLE = 6; // responder hand signals: x 0–2.5, all-red, y 3–5.5, all-red
export const CAR_COLORS = [0xe8eef2, 0xd84d56, 0x3f7cac, 0xf2cc8f, 0x2d8f91, 0x5c6b73, 0xe07a5f, 0x9b72aa, 0x81b29a, 0x2f3a45];

export type Axis = 'x' | 'y';
export type Signal = 'green' | 'yellow' | 'red' | 'dark';
export type VehicleKind = 'car' | 'utility' | 'contractor';
export type ControlMode = 'signals' | 'all_way_stop' | 'responder_directed';

export type Car = {
  id: number;
  kind: VehicleKind;
  color: number;
  axis: Axis;
  sign: 1 | -1;
  road: number;
  s: number;
  v: number;
  stopT: number;
  blockedT: number;
  stuckT: number;
  /** Seconds this car has been held at the current intersection approach. */
  waitT: number;
  /** World position at the start of the current tick (renderer interpolates from here). */
  prev: { x: number; y: number };
  /** Service vans follow a road-tile route to a destination, then park at the curb. */
  route: Tile[] | null;
  routeIdx: number;
  dest: Tile | null;
  parked: { x: number; y: number } | null;
  /** Respawned (teleported) this tick: renderer must not interpolate across the jump. */
  jumped: boolean;
};

export type Intersection = { id: string; x: number; y: number };
export type Control = { mode: ControlMode; controllerId: string | null; since: number };
export type IntersectionStats = { queued: number; avgWaitTicks: number; throughput: number };

export type TrafficContext = {
  drivable: boolean[][];
  power: (x: number, y: number) => number;
  walkers: { x: number; y: number }[];
};

export class TrafficSim {
  cars: Car[] = [];
  intersections: Intersection[] = [];
  control: Record<string, Control> = {};
  stats: Record<string, IntersectionStats> = {};
  /** Simulated seconds of traffic time. */
  clock = 0;
  private rng: Rng;
  private nextId = 0;

  constructor(private map: CityMap, seed: number, count: number) {
    this.rng = createRng(seed ^ 0x7a11c);
    for (const x of map.roads)
      for (const y of map.roads) {
        const id = `i-${x}-${y}`;
        this.intersections.push({ id, x, y });
        this.control[id] = { mode: 'signals', controllerId: null, since: 0 };
        this.stats[id] = { queued: 0, avgWaitTicks: 0, throughput: 0 };
      }
    for (let i = 0; i < count; i++) {
      const car = this.blankCar('car', CAR_COLORS[i % CAR_COLORS.length]);
      this.spawn(car, true);
      this.cars.push(car);
    }
  }

  private blankCar(kind: VehicleKind, color: number): Car {
    return { id: this.nextId++, kind, color, axis: 'x', sign: 1, road: this.map.roads[0], s: 0, v: 0, stopT: 0, blockedT: 0, stuckT: 0, waitT: 0, prev: { x: 0, y: 0 }, route: null, routeIdx: 0, dest: null, parked: null, jumped: false };
  }

  /** Place a car on a random road, entering from an edge (or anywhere at start-up). */
  private spawn(car: Car, anywhere = false) {
    const W = this.map.w;
    for (let attempt = 0; attempt < 30; attempt++) {
      car.axis = this.rng.next() < 0.5 ? 'x' : 'y';
      car.sign = this.rng.next() < 0.5 ? 1 : -1;
      car.road = this.map.roads[Math.floor(this.rng.next() * this.map.roads.length)];
      car.s = anywhere ? this.rng.range(0, W - 1) : car.sign > 0 ? -1.3 : W + 0.3;
      if (anywhere && this.map.roads.some((c) => Math.abs(car.s - c) < 0.8)) continue;
      if (this.cars.some((o) => o !== car && o.axis === car.axis && o.road === car.road && o.sign === car.sign && Math.abs(o.s - car.s) < 1.2)) continue;
      break;
    }
    car.v = CRUISE * 0.6;
    car.stopT = 0;
    car.blockedT = 0;
    car.stuckT = 0;
    car.waitT = 0;
    car.jumped = true;
    car.prev = this.world(car);
  }

  world(car: Car, s = car.s) {
    if (car.parked) return car.parked;
    const lat = car.sign * LANE * (car.axis === 'x' ? 1 : -1);
    return car.axis === 'x' ? { x: s, y: car.road + lat } : { x: car.road + lat, y: s };
  }

  signal(x: number, y: number, axis: Axis, power: (x: number, y: number) => number): Signal {
    const ctl = this.control[`i-${x}-${y}`];
    if (ctl?.mode === 'responder_directed') {
      const t = (this.clock - ctl.since) % DIRECTED_CYCLE;
      const xs: Signal = t < 2.5 ? 'green' : 'red';
      const ys: Signal = t >= 3 && t < 5.5 ? 'green' : 'red';
      return axis === 'x' ? xs : ys;
    }
    if (power(x, y) < 0.5) return 'dark';
    const offset = (x * 3 + y * 7) % CYCLE;
    const t = (this.clock + offset) % CYCLE;
    const xState: Signal = t < 3.8 ? 'green' : t < 4.5 ? 'yellow' : 'red';
    const yState: Signal = t >= 4.5 && t < 8.3 ? 'green' : t >= 8.3 ? 'yellow' : 'red';
    return axis === 'x' ? xState : yState;
  }

  private boxOf(car: Car): string | null {
    for (const c of this.map.roads) if (Math.abs(car.s - c) < 0.6) return car.axis === 'x' ? `${c},${car.road}` : `${car.road},${c}`;
    return null;
  }

  /** One simulation tick = SUBSTEPS fixed sub-steps. */
  step(ctx: TrafficContext) {
    for (const car of this.cars) { car.prev = this.world(car); car.jumped = false; }
    for (const st of Object.values(this.stats)) st.throughput = 0;
    for (let k = 0; k < SUBSTEPS; k++) this.substep(ctx);
    this.measure(ctx);
  }

  private tileFree(drivable: boolean[][], x: number, y: number) {
    const tx = Math.round(x), ty = Math.round(y);
    return tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h || drivable[ty][tx];
  }

  private substep(ctx: TrafficContext) {
    const dt = 1;
    this.clock += 1 / 60;
    const roads = this.map.roads;
    const W = this.map.w;
    const moving = this.cars.filter((c) => !c.parked);
    const boxes = new Map<string, Set<Axis>>();
    const occupy = (car: Car) => { const b = this.boxOf(car); if (b) { if (!boxes.has(b)) boxes.set(b, new Set()); boxes.get(b)!.add(car.axis); } };
    for (const car of moving) occupy(car);
    const laneClear = (probe: Car, self: Car) => {
      const p = this.world(probe);
      return !moving.some((o) => { if (o === self) return false; const w = this.world(o); return Math.hypot(w.x - p.x, w.y - p.y) < 0.8; });
    };

    for (const car of moving) {
      const here = this.world(car);
      if (!this.tileFree(ctx.drivable, here.x, here.y)) {
        if (car.kind === 'car') { this.spawn(car); continue; }
        // a closure appeared under a service van: re-plan from where it is
        this.replan(car, ctx.drivable);
      }
      let limit = Infinity;
      const ahead = (d: number) => this.world(car, car.s + car.sign * d);

      // 1. car-following
      for (const o of moving) {
        if (o === car) continue;
        const ow = this.world(o), me = this.world(car);
        const dx = ow.x - me.x, dy = ow.y - me.y;
        const along = car.axis === 'x' ? dx * car.sign : dy * car.sign;
        const lateral = car.axis === 'x' ? Math.abs(dy) : Math.abs(dx);
        if (along > 0 && along < 1.4 && lateral < 0.3) limit = Math.min(limit, along - 0.72);
      }
      // 2. pedestrians in front
      for (const w of ctx.walkers) {
        const me = this.world(car);
        const along = car.axis === 'x' ? (w.x - me.x) * car.sign : (w.y - me.y) * car.sign;
        const lateral = car.axis === 'x' ? Math.abs(w.y - me.y) : Math.abs(w.x - me.x);
        if (along > 0 && along < 1 && lateral < 0.32) limit = Math.min(limit, along - 0.45);
      }
      // 3. closure ahead → stop; cars U-turn after a while, vans re-plan
      const a = ahead(0.75);
      if (!this.tileFree(ctx.drivable, a.x, a.y)) {
        limit = Math.min(limit, 0);
        car.blockedT += dt / 60;
        if (car.blockedT > 2.5) {
          if (car.kind === 'car') { car.sign = car.sign > 0 ? -1 : 1; car.v = 0; }
          else this.replan(car, ctx.drivable);
          car.blockedT = 0;
        }
      } else car.blockedT = 0;
      // 4. next intersection: signal / all-way stop / directed / cross traffic in the box
      let held = false;
      const next = roads.filter((c) => (c - car.s) * car.sign > 0.55).sort((p, q) => (p - q) * car.sign)[0];
      if (next !== undefined) {
        const toLine = (next - car.s) * car.sign - STOP_LINE;
        if (toLine >= -0.05 && toLine < 2) {
          const ix = car.axis === 'x' ? next : car.road, iy = car.axis === 'x' ? car.road : next;
          const sig = this.signal(ix, iy, car.axis, ctx.power);
          const occupied = boxes.get(`${ix},${iy}`);
          const crossBusy = !!occupied && [...occupied].some((ax) => ax !== car.axis);
          let go = sig === 'green' || (sig === 'yellow' && toLine < 0.25);
          if (sig === 'dark') {
            if (toLine < 0.06 && car.v < 0.002) car.stopT += dt / 60;
            go = car.stopT > 0.6;
          }
          if (!go || crossBusy) { limit = Math.min(limit, Math.max(0, toLine)); held = true; }
        }
      }

      // speed control
      const target = limit === Infinity ? CRUISE : Math.min(CRUISE, Math.max(0, limit) * 0.12);
      car.v += (target - car.v) * (target < car.v ? 0.35 : 0.06);
      if (car.v < 0.0005 && target === 0) car.v = 0;
      const step = Math.min(car.v * dt, Math.max(0, limit === Infinity ? Infinity : limit));
      const before = car.s;
      car.s += car.sign * step;
      if (step > 0.001) { car.stopT = 0; car.stuckT = 0; } else car.stuckT += dt / 60;
      if (held && step <= 0.001) car.waitT += dt / 60; else if (!held) car.waitT = 0;
      if (car.stuckT > 8 && car.kind === 'car') { this.spawn(car); continue; } // gridlock breaker (vans wait)

      // 5. intersection centre: straight on, or turn (vans follow their route)
      for (const c of roads) {
        if ((before - c) * car.sign < 0 && (car.s - c) * car.sign >= 0) {
          const ix = car.axis === 'x' ? c : car.road, iy = car.axis === 'x' ? car.road : c;
          const st = this.stats[`i-${ix}-${iy}`];
          if (st) st.throughput++;
          car.waitT = 0;
          if (car.route) { this.followRoute(car, ix, iy, c); break; }
          const options: { axis: Axis; sign: 1 | -1; road: number; s: number; w: number }[] = [{ axis: car.axis, sign: car.sign, road: car.road, s: car.s, w: 0.55 }];
          for (const sign of [1, -1] as const) options.push({ axis: car.axis === 'x' ? 'y' : 'x', sign, road: c, s: car.road, w: 0.225 });
          const valid = options.filter((o) => {
            const probe = { ...car, ...o, s: o.s + o.sign * 1.2 } as Car;
            const p = this.world(probe);
            const entry = { ...car, ...o } as Car;
            return this.tileFree(ctx.drivable, p.x, p.y) && (o.axis === car.axis || laneClear(entry, car));
          });
          let r = this.rng.next() * valid.reduce((acc, o) => acc + o.w, 0);
          const pick = valid.find((o) => (r -= o.w) <= 0) ?? valid[0];
          if (pick) Object.assign(car, { axis: pick.axis, sign: pick.sign, road: pick.road, s: pick.s });
          break;
        }
      }
      if (car.route && !car.parked) this.checkArrival(car, before);
      if (car.kind === 'car' && (car.s > W + 0.4 || car.s < -1.4)) this.spawn(car);
      occupy(car);
    }
  }

  /** Queue length and average wait at every intersection (cars held at the stop line or behind it). */
  private measure(ctx: TrafficContext) {
    for (const i of this.intersections) {
      let n = 0, wait = 0;
      for (const car of this.cars) {
        if (car.parked || car.v > 0.004) continue;
        const along = car.axis === 'x' ? (car.road === i.y ? (i.x - car.s) * car.sign : -1) : (car.road === i.x ? (i.y - car.s) * car.sign : -1);
        if (along > STOP_LINE - 0.1 && along < STOP_LINE + 2.4) { n++; wait += car.waitT; }
      }
      const st = this.stats[i.id];
      st.queued = n;
      st.avgWaitTicks = n ? Math.round((wait / n) * 10) : 0;
    }
    void ctx;
  }

  // ---------------------------------------------------------------- service vans

  /** Nearest road tile to a point (straight line), preferring drivable non-intersection tiles. */
  nearestRoadTile(from: Tile, drivable: boolean[][]): Tile | null {
    let best: Tile | null = null, bestD = Infinity;
    for (let y = 0; y < this.map.h; y++)
      for (let x = 0; x < this.map.w; x++) {
        if (!this.map.isRoad(x, y) || !drivable[y][x]) continue;
        const cross = this.map.roads.includes(x) && this.map.roads.includes(y);
        const d = Math.hypot(x - from.x, y - from.y) + (cross ? 0.5 : 0);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    return best;
  }

  /** BFS over drivable road tiles. */
  private roadPath(from: Tile, to: Tile, drivable: boolean[][]): Tile[] | null {
    const W = this.map.w, H = this.map.h;
    const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && this.map.isRoad(x, y) && drivable[y][x];
    if (!ok(from.x, from.y) || !ok(to.x, to.y)) return null;
    const prev = new Int32Array(W * H).fill(-1);
    const seen = new Uint8Array(W * H);
    const start = from.y * W + from.x, goal = to.y * W + to.x;
    const q = [start];
    seen[start] = 1;
    for (let i = 0; i < q.length; i++) {
      const k = q[i];
      if (k === goal) break;
      const x = k % W, y = (k / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!ok(nx, ny)) continue;
        const nk = ny * W + nx;
        if (seen[nk]) continue;
        seen[nk] = 1;
        prev[nk] = k;
        q.push(nk);
      }
    }
    if (!seen[goal]) return null;
    const path: Tile[] = [];
    for (let k = goal; k !== -1; k = prev[k]) { path.push({ x: k % W, y: (k / W) | 0 }); if (k === start) break; }
    return path.reverse();
  }

  /** Put a routed service van on the road at `from`, heading for `to`. Returns null if no road route exists. */
  spawnVan(kind: 'utility' | 'contractor', from: Tile, to: Tile, drivable: boolean[][]): Car | null {
    const path = this.roadPath(from, to, drivable);
    if (!path || path.length < 2) return null;
    const car = this.blankCar(kind, kind === 'utility' ? 0xf2b632 : 0xf28c28);
    const a = path[0], b = path[1];
    car.axis = b.x !== a.x ? 'x' : 'y';
    car.sign = (car.axis === 'x' ? b.x - a.x : b.y - a.y) > 0 ? 1 : -1;
    car.road = car.axis === 'x' ? a.y : a.x;
    car.s = car.axis === 'x' ? a.x : a.y;
    car.route = path;
    car.routeIdx = 0;
    car.dest = to;
    car.v = 0;
    car.jumped = true;
    car.prev = this.world(car);
    this.cars.push(car);
    return car;
  }

  private followRoute(car: Car, ix: number, iy: number, c: number) {
    const path = car.route!;
    let idx = -1;
    for (let i = car.routeIdx; i < path.length; i++) if (path[i].x === ix && path[i].y === iy) { idx = i; break; }
    if (idx < 0) return;
    car.routeIdx = idx;
    const n = path[idx + 1];
    if (!n) return;
    const axis: Axis = n.x !== ix ? 'x' : 'y';
    const sign: 1 | -1 = (axis === 'x' ? n.x - ix : n.y - iy) > 0 ? 1 : -1;
    if (axis !== car.axis) Object.assign(car, { axis, sign, road: c, s: car.road });
    else car.sign = sign;
  }

  private checkArrival(car: Car, before: number) {
    const d = car.dest!;
    const onRoad = car.axis === 'x' ? car.road === d.y : car.road === d.x;
    const coord = car.axis === 'x' ? d.x : d.y;
    if (onRoad && ((before - coord) * car.sign <= 0 && (car.s - coord) * car.sign >= 0)) {
      // pull over to the curb beside the destination
      const off = 0.42;
      car.parked = car.axis === 'x' ? { x: d.x, y: d.y + (car.sign > 0 ? off : -off) } : { x: d.x + (car.sign > 0 ? -off : off), y: d.y };
      car.v = 0;
    }
  }

  private replan(car: Car, drivable: boolean[][]) {
    if (!car.dest) return;
    const here = this.world(car);
    const from = { x: Math.round(car.axis === 'x' ? here.x : car.road), y: Math.round(car.axis === 'x' ? car.road : here.y) };
    const start = this.map.isRoad(from.x, from.y) && drivable[from.y]?.[from.x] ? from : this.nearestRoadTile(from, drivable);
    const path = start ? this.roadPath(start, car.dest, drivable) : null;
    if (!path || path.length < 2) return; // wait; maybe the closure lifts
    const a = path[0], b = path[1];
    car.axis = b.x !== a.x ? 'x' : 'y';
    car.sign = (car.axis === 'x' ? b.x - a.x : b.y - a.y) > 0 ? 1 : -1;
    car.road = car.axis === 'x' ? a.y : a.x;
    car.s = car.axis === 'x' ? a.x : a.y;
    car.route = path;
    car.routeIdx = 0;
    car.jumped = true;
  }

  remove(car: Car) {
    this.cars = this.cars.filter((c) => c !== car);
  }

  /** Compact fingerprint for replay hashing. */
  fingerprint() {
    return this.cars.map((c) => `${c.id}${c.axis}${c.sign}${c.road}:${c.s.toFixed(3)}${c.parked ? 'P' : ''}`).join(',') + '|' + Object.entries(this.control).filter(([, v]) => v.mode !== 'signals').map(([k, v]) => `${k}=${v.mode}:${v.controllerId}`).join(',');
  }
}

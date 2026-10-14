import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { MAP_W } from '@/sim/map';
import { iso, pts, up } from './iso';
import { mix } from './palette';

/**
 * Ambient traffic. Purely decorative — it never influences the simulation or JEV decisions.
 * Two-way roads, turns at intersections, traffic signals (dark during a blackout → all-way stop),
 * car-following, yielding to pedestrians and queueing at closures.
 */
const ROADS = [5, 11, 17];
const LANE = 0.22;
const CRUISE = 0.045; // tiles per frame at 1×
const STOP_LINE = 0.66;
const CYCLE = 9; // seconds
const CAR_COLORS = [0xe8eef2, 0xd84d56, 0x3f7cac, 0xf2cc8f, 0x2d8f91, 0x5c6b73, 0xe07a5f, 0x9b72aa, 0x81b29a, 0x2f3a45];

type Axis = 'x' | 'y';
type Signal = 'green' | 'yellow' | 'red' | 'dark';
type Car = {
  axis: Axis; sign: 1 | -1; road: number; s: number; v: number;
  stopT: number; blockedT: number; stuckT: number; root: Container; views: Graphics[]; head: Sprite[]; tail: Sprite;
};
type Light = { x: number; y: number; offset: number; head: Graphics; glowX: Sprite; glowY: Sprite };
export type Walker = { x: number; y: number };

const viewIndex = (axis: Axis, sign: number) => (axis === 'x' ? 0 : 2) + (sign > 0 ? 0 : 1);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Traffic {
  cars: Car[] = [];
  lights: Light[] = [];
  private clock = 0;

  constructor(objects: Container, private lightsLayer: Container, glow: Texture, private tintables: Graphics[], groundLayer: Container) {
    // stop lines on every approach
    const lines = new Graphics();
    for (const r of ROADS)
      for (const c of ROADS)
        for (const sign of [1, -1] as const) {
          // x-axis approach on row r toward x = c
          const sx = c - sign * STOP_LINE, ly = r + sign * LANE;
          const a = iso(sx, ly - 0.2), b = iso(sx, ly + 0.2);
          lines.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2.5, color: 0xf4f1e6, alpha: 0.85 });
          // y-axis approach on column r toward y = c
          const sy = c - sign * STOP_LINE, lx = r - sign * LANE;
          const p = iso(lx - 0.2, sy), q = iso(lx + 0.2, sy);
          lines.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 2.5, color: 0xf4f1e6, alpha: 0.85 });
        }
    this.tintables.push(lines);
    groundLayer.addChildAt(lines, 0);

    // signals: one pole per intersection with a head for each direction of travel
    for (const x of ROADS)
      for (const y of ROADS) {
        const p = iso(x + 0.62, y - 0.62);
        const pole = new Graphics();
        pole.ellipse(0, 1, 3.5, 1.8).fill({ color: 0, alpha: 0.2 });
        pole.rect(-1, -30, 2, 30).fill(0x3d4651);
        pole.position.set(p.x, p.y);
        pole.zIndex = x + y - 0.01;
        this.tintables.push(pole);
        objects.addChild(pole);
        const head = new Graphics();
        head.position.set(p.x, p.y);
        head.zIndex = x + y;
        objects.addChild(head);
        const mk = () => {
          const s = new Sprite(glow);
          s.anchor.set(0.5);
          s.scale.set(0.16);
          this.lightsLayer.addChild(s);
          return s;
        };
        const glowX = mk(), glowY = mk();
        this.lights.push({ x, y, offset: (x * 3 + y * 7) % CYCLE, head, glowX, glowY });
      }

    for (let i = 0; i < 22; i++) {
      const root = new Container();
      const color = CAR_COLORS[i % CAR_COLORS.length];
      const views = [0, 1, 2, 3].map((k) => {
        const g = new Graphics();
        this.drawCar(g, k < 2 ? 'x' : 'y', k % 2 === 0 ? 1 : -1, color);
        g.visible = false;
        root.addChild(g);
        this.tintables.push(g);
        return g;
      });
      objects.addChild(root);
      const mk = (tint: number, sc: number) => {
        const s = new Sprite(glow);
        s.anchor.set(0.5);
        s.tint = tint;
        s.scale.set(sc);
        this.lightsLayer.addChild(s);
        return s;
      };
      const car: Car = { axis: 'x', sign: 1, road: 5, s: 0, v: 0, stopT: 0, blockedT: 0, stuckT: 0, root, views, head: [mk(0xfff0c8, 0.15), mk(0xfff0c8, 0.15)], tail: mk(0xff4a4a, 0.08) };
      this.spawn(car, true);
      this.cars.push(car);
    }
  }

  private drawCar(g: Graphics, axis: Axis, sign: 1 | -1, color: number) {
    const L = 0.31, W = 0.15;
    const c = (dl: number, dw: number) => (axis === 'x' ? iso(dl * sign, dw) : iso(dw, dl * sign));
    const A = c(-L, W), B = c(L, W), C = c(L, -W), D = c(-L, -W);
    g.ellipse(0, 3, 21, 8.5).fill({ color: 0x000000, alpha: 0.18 });
    const h = 8;
    const quad = (p: { x: number; y: number }[], col: number) => g.poly(pts(...p)).fill(col);
    // draw all four sides back-to-front by screen y so whichever faces the camera ends on top
    const sides: [{ x: number; y: number }, { x: number; y: number }][] = [[A, B], [B, C], [C, D], [D, A]];
    sides.sort((a, b) => a[0].y + a[1].y - (b[0].y + b[1].y));
    for (const [p, q] of sides) quad([p, q, up(q, h), up(p, h)], mix(color, 0x000000, p.x + q.x > 0 ? 0.25 : 0.08));
    quad([up(A, h), up(B, h), up(C, h), up(D, h)], color);
    // cabin toward the rear, windshield facing forward
    const cab = [c(-L * 0.55, W * 0.82), c(L * 0.3, W * 0.82), c(L * 0.3, -W * 0.82), c(-L * 0.55, -W * 0.82)];
    quad(cab.map((p) => up(p, h)), 0x2a3644);
    quad(cab.map((p) => up(p, h + 5)), mix(color, 0xffffff, 0.15));
    const fw = [c(L * 0.3, W * 0.82), c(L * 0.3, -W * 0.82)];
    quad([up(fw[0], h), up(fw[1], h), up(fw[1], h + 5), up(fw[0], h + 5)], 0x9cc3d8);
  }

  /** Place a car on a random road, entering from an edge (or anywhere at start-up). */
  private spawn(car: Car, anywhere = false) {
    for (let attempt = 0; attempt < 30; attempt++) {
      car.axis = Math.random() < 0.5 ? 'x' : 'y';
      car.sign = Math.random() < 0.5 ? 1 : -1;
      car.road = ROADS[Math.floor(Math.random() * 3)];
      car.s = anywhere ? rnd(0, MAP_W - 1) : car.sign > 0 ? -1.3 : MAP_W + 0.3;
      if (anywhere && ROADS.some((c) => Math.abs(car.s - c) < 0.8)) continue;
      if (this.cars.some((o) => o !== car && o.axis === car.axis && o.road === car.road && o.sign === car.sign && Math.abs(o.s - car.s) < 1.2)) continue;
      break;
    }
    car.v = CRUISE * 0.6;
    car.stopT = 0;
    car.blockedT = 0;
    car.stuckT = 0;
  }

  private world(car: Car, s = car.s) {
    const lat = car.sign * LANE * (car.axis === 'x' ? 1 : -1);
    return car.axis === 'x' ? { x: s, y: car.road + lat } : { x: car.road + lat, y: s };
  }

  signal(x: number, y: number, axis: Axis, power: (x: number, y: number) => number): Signal {
    if (power(x, y) < 0.5) return 'dark';
    const l = this.lights.find((q) => q.x === x && q.y === y)!;
    const t = (this.clock + l.offset) % CYCLE;
    const xState: Signal = t < 3.8 ? 'green' : t < 4.5 ? 'yellow' : 'red';
    const yState: Signal = t >= 4.5 && t < 8.3 ? 'green' : t >= 8.3 ? 'yellow' : 'red';
    return axis === 'x' ? xState : yState;
  }

  private boxOf(car: Car): string | null {
    for (const c of ROADS) if (Math.abs(car.s - c) < 0.6) return car.axis === 'x' ? `${c},${car.road}` : `${car.road},${c}`;
    return null;
  }

  update(dt: number, walkable: boolean[][], night: number, power: (x: number, y: number) => number, walkers: Walker[]) {
    this.clock += (dt / 60) * (dt > 0 ? 1 : 0);
    // intersection occupancy: which axes are currently inside each box (updated as cars move)
    const boxes = new Map<string, Set<Axis>>();
    const occupy = (car: Car) => { const b = this.boxOf(car); if (b) { if (!boxes.has(b)) boxes.set(b, new Set()); boxes.get(b)!.add(car.axis); } };
    for (const car of this.cars) occupy(car);
    const laneClear = (probe: Car, self: Car) => {
      const p = this.world(probe);
      return !this.cars.some((o) => { if (o === self) return false; const w = this.world(o); return Math.hypot(w.x - p.x, w.y - p.y) < 0.8; });
    };
    const tileFree = (x: number, y: number) => {
      const tx = Math.round(x), ty = Math.round(y);
      return tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_W || walkable[ty][tx];
    };

    for (const car of this.cars) {
      if (dt === 0) break;
      // respawn if a closure appears under the car
      const here = this.world(car);
      if (!tileFree(here.x, here.y)) { this.spawn(car); continue; }

      let limit = Infinity; // distance we may still travel this frame before a hard stop
      const ahead = (d: number) => this.world(car, car.s + car.sign * d);

      // 1. car-following (any car on the same lane line ahead of us)
      for (const o of this.cars) {
        if (o === car) continue;
        const ow = this.world(o), me = this.world(car);
        const dx = ow.x - me.x, dy = ow.y - me.y;
        const along = car.axis === 'x' ? dx * car.sign : dy * car.sign;
        const lateral = car.axis === 'x' ? Math.abs(dy) : Math.abs(dx);
        if (along > 0 && along < 1.4 && lateral < 0.3) limit = Math.min(limit, along - 0.72);
      }
      // 2. pedestrians in front of the car
      for (const w of walkers) {
        const me = this.world(car);
        const along = car.axis === 'x' ? (w.x - me.x) * car.sign : (w.y - me.y) * car.sign;
        const lateral = car.axis === 'x' ? Math.abs(w.y - me.y) : Math.abs(w.x - me.x);
        if (along > 0 && along < 1 && lateral < 0.32) limit = Math.min(limit, along - 0.45);
      }
      // 3. closure ahead → stop, then U-turn after a while
      if (!tileFree(ahead(0.75).x, ahead(0.75).y)) {
        limit = Math.min(limit, 0);
        car.blockedT += dt / 60;
        if (car.blockedT > 2.5) { car.sign = car.sign > 0 ? -1 : 1; car.blockedT = 0; car.v = 0; }
      } else car.blockedT = 0;
      // 4. next intersection: signal / all-way stop / cross traffic in the box
      const next = ROADS.filter((c) => (c - car.s) * car.sign > 0.55).sort((a, b) => (a - b) * car.sign)[0];
      if (next !== undefined) {
        const toLine = (next - car.s) * car.sign - STOP_LINE;
        if (toLine >= -0.05 && toLine < 2) {
          const ix = car.axis === 'x' ? next : car.road, iy = car.axis === 'x' ? car.road : next;
          const sig = this.signal(ix, iy, car.axis, power);
          const occupied = boxes.get(`${ix},${iy}`);
          const crossBusy = !!occupied && [...occupied].some((a) => a !== car.axis);
          let go = sig === 'green' || (sig === 'yellow' && toLine < 0.25);
          if (sig === 'dark') {
            if (toLine < 0.06 && car.v < 0.002) car.stopT += dt / 60;
            go = car.stopT > 0.6;
          }
          if (!go || crossBusy) limit = Math.min(limit, Math.max(0, toLine));
        }
      }

      // speed control: ease toward cruise, brake to never overshoot the limit
      const target = limit === Infinity ? CRUISE : Math.min(CRUISE, Math.max(0, limit) * 0.12);
      car.v += (target - car.v) * (target < car.v ? 0.35 : 0.06);
      if (car.v < 0.0005 && target === 0) car.v = 0;
      const step = Math.min(car.v * dt, Math.max(0, limit === Infinity ? Infinity : limit));
      const before = car.s;
      car.s += car.sign * step;
      if (step > 0.001) { car.stopT = 0; car.stuckT = 0; } else car.stuckT += dt / 60;
      if (car.stuckT > 8 && car.root.alpha > 0) { this.spawn(car); continue; } // gridlock breaker

      // 5. at an intersection centre: straight on, or turn
      for (const c of ROADS) {
        if ((before - c) * car.sign < 0 && (car.s - c) * car.sign >= 0) {
          const options: { axis: Axis; sign: 1 | -1; road: number; s: number; w: number }[] = [{ axis: car.axis, sign: car.sign, road: car.road, s: car.s, w: 0.55 }];
          for (const sign of [1, -1] as const) options.push({ axis: car.axis === 'x' ? 'y' : 'x', sign, road: c, s: car.road, w: 0.225 });
          const valid = options.filter((o) => {
            const probe = { ...car, ...o, s: o.s + o.sign * 1.2 } as Car;
            const p = this.world(probe);
            const entry = { ...car, ...o } as Car;
            return tileFree(p.x, p.y) && (o.axis === car.axis || laneClear(entry, car));
          });
          let r = Math.random() * valid.reduce((a, o) => a + o.w, 0);
          const pick = valid.find((o) => (r -= o.w) <= 0) ?? valid[0];
          if (pick) Object.assign(car, { axis: pick.axis, sign: pick.sign, road: pick.road, s: pick.s });
          break;
        }
      }
      if (car.s > MAP_W + 0.4 || car.s < -1.4) this.spawn(car);
      occupy(car); // reserve the box immediately so later cars this frame see it
    }

    // render cars
    for (const car of this.cars) {
      const w = this.world(car);
      const p = iso(w.x, w.y);
      car.root.position.set(p.x, p.y);
      car.root.zIndex = w.x + w.y;
      const vi = viewIndex(car.axis, car.sign);
      car.views.forEach((g, i) => (g.visible = i === vi));
      const edge = Math.min(car.s + 1.4, MAP_W + 0.4 - car.s);
      const fade = Math.max(0, Math.min(1, edge / 1.1));
      car.root.alpha = fade;
      const f = (d: number, lat: number) => {
        const q = this.world(car, car.s + car.sign * d);
        const off = car.axis === 'x' ? { x: 0, y: lat } : { x: lat, y: 0 };
        return iso(q.x + off.x, q.y + off.y);
      };
      const on = Math.max(night, 1 - power(w.x, w.y)) * fade;
      const h1 = f(0.33, 0.09), h2 = f(0.33, -0.09), tl = f(-0.32, 0);
      car.head[0].position.set(h1.x, h1.y - 5);
      car.head[1].position.set(h2.x, h2.y - 5);
      for (const h of car.head) h.alpha = on * 0.9;
      car.tail.position.set(tl.x, tl.y - 5);
      car.tail.alpha = Math.max(on * 0.7, car.v < CRUISE * 0.3 ? 0.65 * fade : 0); // brake lights
    }

    // render signals
    const LAMP: Record<Signal, number> = { red: 0xff4a4a, yellow: 0xffc542, green: 0x4ee08a, dark: 0x2a2f36 };
    for (const l of this.lights) {
      const g = l.head;
      g.clear();
      const sx = this.signal(l.x, l.y, 'x', power), sy = this.signal(l.x, l.y, 'y', power);
      for (const [dx, st] of [[-4.5, sx], [4.5, sy]] as const) {
        g.roundRect(dx - 2.6, -38, 5.2, 13, 1.5).fill(0x22272e);
        (['red', 'yellow', 'green'] as const).forEach((c, k) => {
          const lit = st === c;
          g.circle(dx, -35 + k * 4, 1.4).fill(lit ? LAMP[c] : 0x3a4048);
        });
      }
      const pole = iso(l.x + 0.62, l.y - 0.62);
      const place = (s: Sprite, dx: number, st: Signal) => {
        const k = st === 'red' ? 0 : st === 'yellow' ? 1 : 2;
        s.position.set(pole.x + dx, pole.y - 35 + k * 4);
        s.tint = LAMP[st];
        s.alpha = st === 'dark' ? 0 : 0.25 + night * 0.6;
      };
      place(l.glowX, -4.5, sx);
      place(l.glowY, 4.5, sy);
    }
  }
}

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { CityMap } from '@/sim/map';
import { LANE, STOP_LINE, type Axis, type Car, type Signal } from '@/sim/traffic';
import type { Simulation } from '@/sim/world';
import { iso, pts, up } from './iso';
import { mix } from './palette';

type CarView = { root: Container; views: Graphics[]; head: Sprite[]; tail: Sprite; beacon: Sprite[] };
type Light = { x: number; y: number; head: Graphics; glowX: Sprite; glowY: Sprite; pole: Graphics };

const viewIndex = (axis: Axis, sign: number) => (axis === 'x' ? 0 : 2) + (sign > 0 ? 0 : 1);

/**
 * Draws the simulation's deterministic traffic (src/sim/traffic.ts): cars, service vans, signals and stop lines.
 * Positions are interpolated between simulation ticks for smooth motion; nothing here affects the simulation.
 */
export class TrafficView {
  private cars = new Map<number, CarView>();
  private lights: Light[] = [];
  private lines = new Graphics();
  private map: CityMap | null = null;

  constructor(private objects: Container, private lightsLayer: Container, private glow: Texture, private tintables: Graphics[], private groundLayer: Container) {}

  /** (Re)build static pieces for a map: stop lines and one signal pole per intersection. */
  setMap(map: CityMap) {
    if (this.map === map) return;
    this.map = map;
    this.lines.clear();
    for (const l of this.lights) { l.head.destroy(); l.pole.destroy(); l.glowX.destroy(); l.glowY.destroy(); }
    this.lights = [];
    for (const v of this.cars.values()) this.destroyCar(v);
    this.cars.clear();
    const R = map.roads;
    for (const r of R)
      for (const c of R)
        for (const sign of [1, -1] as const) {
          const sx = c - sign * STOP_LINE, ly = r + sign * LANE;
          const a = iso(sx, ly - 0.2), b = iso(sx, ly + 0.2);
          this.lines.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2.5, color: 0xf4f1e6, alpha: 0.85 });
          const sy = c - sign * STOP_LINE, lx = r - sign * LANE;
          const p = iso(lx - 0.2, sy), q = iso(lx + 0.2, sy);
          this.lines.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 2.5, color: 0xf4f1e6, alpha: 0.85 });
        }
    if (!this.tintables.includes(this.lines)) this.tintables.push(this.lines);
    if (!this.lines.parent) this.groundLayer.addChildAt(this.lines, 0);
    for (const x of R)
      for (const y of R) {
        const p = iso(x + 0.62, y - 0.62);
        const pole = new Graphics();
        pole.ellipse(0, 1, 3.5, 1.8).fill({ color: 0, alpha: 0.2 });
        pole.rect(-1, -30, 2, 30).fill(0x3d4651);
        pole.position.set(p.x, p.y);
        pole.zIndex = x + y - 0.01;
        this.tintables.push(pole);
        this.objects.addChild(pole);
        const head = new Graphics();
        head.position.set(p.x, p.y);
        head.zIndex = x + y;
        this.objects.addChild(head);
        const mk = () => { const s = new Sprite(this.glow); s.anchor.set(0.5); s.scale.set(0.16); this.lightsLayer.addChild(s); return s; };
        this.lights.push({ x, y, head, glowX: mk(), glowY: mk(), pole });
      }
  }

  private drawVehicle(g: Graphics, axis: Axis, sign: 1 | -1, color: number, kind: Car['kind']) {
    const big = kind !== 'car';
    const L = big ? 0.38 : 0.31, W = big ? 0.17 : 0.15;
    const c = (dl: number, dw: number) => (axis === 'x' ? iso(dl * sign, dw) : iso(dw, dl * sign));
    const A = c(-L, W), B = c(L, W), C = c(L, -W), D = c(-L, -W);
    g.ellipse(0, 3, big ? 25 : 21, big ? 10 : 8.5).fill({ color: 0x000000, alpha: 0.18 });
    const h = big ? 12 : 8;
    const quad = (p: { x: number; y: number }[], col: number) => g.poly(pts(...p)).fill(col);
    const sides: [{ x: number; y: number }, { x: number; y: number }][] = [[A, B], [B, C], [C, D], [D, A]];
    sides.sort((a, b) => a[0].y + a[1].y - (b[0].y + b[1].y));
    for (const [p, q] of sides) {
      quad([p, q, up(q, h), up(p, h)], mix(color, 0x000000, p.x + q.x > 0 ? 0.25 : 0.08));
      if (big) quad([up(p, 4), up(q, 4), up(q, 6), up(p, 6)], kind === 'utility' ? 0x2a3644 : 0xffffff); // livery stripe
    }
    quad([up(A, h), up(B, h), up(C, h), up(D, h)], color);
    if (big) {
      // cab + light bar
      const cab = [c(L * 0.35, W * 0.85), c(L, W * 0.85), c(L, -W * 0.85), c(L * 0.35, -W * 0.85)];
      const fw = [c(L, W * 0.8), c(L, -W * 0.8)];
      quad([up(fw[0], h - 6), up(fw[1], h - 6), up(fw[1], h - 1), up(fw[0], h - 1)], 0x9cc3d8);
      void cab;
      const lb = [c(L * 0.5, W * 0.6), c(L * 0.7, W * 0.6), c(L * 0.7, -W * 0.6), c(L * 0.5, -W * 0.6)];
      quad(lb.map((p) => up(p, h + 2.5)), 0xffb020);
      if (kind === 'contractor') { const l0 = c(-L * 0.8, 0), l1 = c(L * 0.2, 0); g.moveTo(up(l0, h + 2).x, up(l0, h + 2).y).lineTo(up(l1, h + 2).x, up(l1, h + 2).y).stroke({ width: 3, color: 0xc9cfd6 }); }
      return;
    }
    const cab = [c(-L * 0.55, W * 0.82), c(L * 0.3, W * 0.82), c(L * 0.3, -W * 0.82), c(-L * 0.55, -W * 0.82)];
    quad(cab.map((p) => up(p, h)), 0x2a3644);
    quad(cab.map((p) => up(p, h + 5)), mix(color, 0xffffff, 0.15));
    const fw = [c(L * 0.3, W * 0.82), c(L * 0.3, -W * 0.82)];
    quad([up(fw[0], h), up(fw[1], h), up(fw[1], h + 5), up(fw[0], h + 5)], 0x9cc3d8);
  }

  private makeCar(car: Car): CarView {
    const root = new Container();
    const views = [0, 1, 2, 3].map((k) => {
      const g = new Graphics();
      this.drawVehicle(g, k < 2 ? 'x' : 'y', k % 2 === 0 ? 1 : -1, car.color, car.kind);
      g.visible = false;
      root.addChild(g);
      this.tintables.push(g);
      return g;
    });
    this.objects.addChild(root);
    const mk = (tint: number, sc: number) => { const s = new Sprite(this.glow); s.anchor.set(0.5); s.tint = tint; s.scale.set(sc); this.lightsLayer.addChild(s); return s; };
    const beacon = car.kind === 'car' ? [] : [mk(0xffb020, 0.28), mk(0xffb020, 0.28)];
    return { root, views, head: [mk(0xfff0c8, 0.15), mk(0xfff0c8, 0.15)], tail: mk(0xff4a4a, 0.08), beacon };
  }

  private destroyCar(v: CarView) {
    for (const g of v.views) { const i = this.tintables.indexOf(g); if (i >= 0) this.tintables.splice(i, 1); }
    v.root.destroy({ children: true });
    for (const s of [...v.head, v.tail, ...v.beacon]) s.destroy();
  }

  /** alpha: 0..1 progress through the current simulation tick (for interpolation). */
  update(sim: Simulation, alpha: number, night: number, power: (x: number, y: number) => number, t: number) {
    if (sim.map !== this.map) this.setMap(sim.map);
    const tr = sim.traffic;
    const seen = new Set<number>();
    const W = sim.map.w;
    for (const car of tr.cars) {
      seen.add(car.id);
      let v = this.cars.get(car.id);
      if (!v) { v = this.makeCar(car); this.cars.set(car.id, v); }
      const cur = tr.world(car);
      const w = car.jumped || car.parked ? cur : { x: car.prev.x + (cur.x - car.prev.x) * alpha, y: car.prev.y + (cur.y - car.prev.y) * alpha };
      const p = iso(w.x, w.y);
      v.root.position.set(p.x, p.y);
      v.root.zIndex = w.x + w.y;
      const vi = viewIndex(car.axis, car.sign);
      v.views.forEach((g, i) => (g.visible = i === vi));
      const s = car.parked ? 5 : car.s;
      const edge = Math.min(s + 1.4, W + 0.4 - s);
      const fade = car.parked ? 1 : Math.max(0, Math.min(1, edge / 1.1));
      v.root.alpha = fade;
      const f = (d: number, lat: number) => {
        const q = car.parked ? { x: w.x + (car.axis === 'x' ? d * car.sign : 0), y: w.y + (car.axis === 'y' ? d * car.sign : 0) } : tr.world(car, car.s + car.sign * d);
        const off = car.axis === 'x' ? { x: 0, y: lat } : { x: lat, y: 0 };
        const dx = w.x - cur.x, dy = w.y - cur.y; // interpolation offset
        return iso(q.x + off.x + dx, q.y + off.y + dy);
      };
      const on = Math.max(night, 1 - power(w.x, w.y)) * fade * (car.parked ? 0.3 : 1);
      const h1 = f(0.33, 0.09), h2 = f(0.33, -0.09), tl = f(-0.32, 0);
      v.head[0].position.set(h1.x, h1.y - 5);
      v.head[1].position.set(h2.x, h2.y - 5);
      for (const h of v.head) h.alpha = on * 0.9;
      v.tail.position.set(tl.x, tl.y - 5);
      v.tail.alpha = Math.max(on * 0.7, car.v < 0.0135 && !car.parked ? 0.65 * fade : 0);
      v.beacon.forEach((b, i) => {
        b.position.set(p.x + (i ? 5 : -5), p.y - 19);
        b.alpha = (Math.sin(t * 10 + i * Math.PI) > 0 ? 0.9 : 0.15) * fade;
      });
    }
    for (const [id, v] of this.cars) if (!seen.has(id)) { this.destroyCar(v); this.cars.delete(id); }

    const LAMP: Record<Signal, number> = { red: 0xff4a4a, yellow: 0xffc542, green: 0x4ee08a, dark: 0x2a2f36 };
    for (const l of this.lights) {
      const g = l.head;
      g.clear();
      const directed = tr.control[`i-${l.x}-${l.y}`]?.mode === 'responder_directed';
      // a directed intersection's signal heads stay dark — the responder's hand signals rule
      const sx = directed ? 'dark' : tr.signal(l.x, l.y, 'x', power), sy = directed ? 'dark' : tr.signal(l.x, l.y, 'y', power);
      for (const [dx, st] of [[-4.5, sx], [4.5, sy]] as const) {
        g.roundRect(dx - 2.6, -38, 5.2, 13, 1.5).fill(0x22272e);
        (['red', 'yellow', 'green'] as const).forEach((c, k) => g.circle(dx, -35 + k * 4, 1.4).fill(st === c ? LAMP[c] : 0x3a4048));
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

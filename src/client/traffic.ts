import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { MAP_W } from '@/sim/map';
import { iso, pts, up, type P } from './iso';
import { mix } from './palette';

/**
 * Ambient traffic. Purely decorative — it never influences the simulation or JEV decisions.
 * Cars queue behind closures and each other, which makes route closures visible.
 */
type Lane = { axis: 'x' | 'y'; line: number; dir: 1 | -1; offset: number };
type Car = { lane: Lane; s: number; speed: number; root: Container; body: Graphics; head: Sprite[]; tail: Sprite[]; color: number };

const ROADS = [5, 11, 17];
const CAR_COLORS = [0xe8eef2, 0xd84d56, 0x3f7cac, 0xf2cc8f, 0x2d8f91, 0x5c6b73, 0xe07a5f, 0x9b72aa, 0x81b29a, 0x2f3a45];

export class Traffic {
  cars: Car[] = [];

  constructor(private objects: Container, private lights: Container, glow: Texture, private tintables: Graphics[]) {
    const lanes: Lane[] = [];
    for (const r of ROADS) {
      lanes.push({ axis: 'x', line: r, dir: 1, offset: 0.22 }, { axis: 'x', line: r, dir: -1, offset: -0.22 });
      lanes.push({ axis: 'y', line: r, dir: 1, offset: -0.22 }, { axis: 'y', line: r, dir: -1, offset: 0.22 });
    }
    for (let i = 0; i < 11; i++) {
      const lane = lanes[(i * 5) % lanes.length];
      const color = CAR_COLORS[i % CAR_COLORS.length];
      const root = new Container();
      const body = new Graphics();
      root.addChild(body);
      this.tintables.push(body);
      this.drawCar(body, lane, color);
      this.objects.addChild(root);
      const mk = (tint: number, sc: number) => {
        const s = new Sprite(glow);
        s.anchor.set(0.5);
        s.tint = tint;
        s.scale.set(sc);
        this.lights.addChild(s);
        return s;
      };
      this.cars.push({ lane, s: (i * 7.3) % MAP_W, speed: 0.028 + (i % 4) * 0.004, root, body, head: [mk(0xfff0c8, 0.16), mk(0xfff0c8, 0.16)], tail: [mk(0xff4a4a, 0.08)], color });
    }
  }

  private dirVec(l: Lane): P {
    return l.axis === 'x' ? { x: l.dir, y: 0 } : { x: 0, y: l.dir };
  }

  private drawCar(g: Graphics, l: Lane, color: number) {
    // Car aligned to its travel axis: length 0.62 tiles, width 0.3 tiles, height 9px + cabin.
    const L = 0.31, W = 0.15;
    const ax = l.axis === 'x';
    const c = (dl: number, dw: number) => (ax ? iso(dl, dw) : iso(dw, dl));
    const A = c(-L, W), B = c(L, W), C = c(L, -W), D = c(-L, -W);
    g.ellipse(0, 3, 22, 9).fill({ color: 0x000000, alpha: 0.18 });
    const h = 8;
    // visible sides: +y face (A-B for x-axis) and +x face
    const side1 = ax ? [A, B] : [B, C].reverse();
    const side2 = ax ? [B, C] : [A, B];
    g.poly(pts(side1[0], side1[1], up(side1[1], h), up(side1[0], h))).fill(mix(color, 0x000000, 0.08));
    g.poly(pts(side2[0], side2[1], up(side2[1], h), up(side2[0], h))).fill(mix(color, 0x000000, 0.25));
    g.poly(pts(up(A, h), up(B, h), up(C, h), up(D, h))).fill(color);
    const k = 0.55;
    const cab = [c(-L * k, W * 0.8), c(L * 0.35, W * 0.8), c(L * 0.35, -W * 0.8), c(-L * k, -W * 0.8)];
    g.poly(pts(...cab.map((p) => up(p, h)))).fill(0x2a3644);
    g.poly(pts(...cab.map((p) => up(p, h + 5)))).fill(mix(color, 0xffffff, 0.15));
    g.poly(pts(up(cab[0], h), up(cab[1], h), up(cab[1], h + 5), up(cab[0], h + 5))).fill(0x8fb3c9);
  }

  update(dt: number, walkable: boolean[][], night: number, power: number) {
    const sorted = [...this.cars];
    for (const car of sorted) {
      const l = car.lane;
      const d = this.dirVec(l);
      // look ahead for closure or car
      const ahead = car.s + l.dir * 0.9;
      const tile = l.axis === 'x' ? { x: Math.round(ahead), y: l.line } : { x: l.line, y: Math.round(ahead) };
      const blocked = tile.x >= 0 && tile.y >= 0 && tile.x < MAP_W && tile.y < MAP_W && !walkable[tile.y][tile.x];
      const carAhead = this.cars.some((o) => o !== car && o.lane === l && (o.s - car.s) * l.dir > 0 && (o.s - car.s) * l.dir < 0.85);
      const here = l.axis === 'x' ? { x: Math.round(car.s), y: l.line } : { x: l.line, y: Math.round(car.s) };
      const onClosure = here.x >= 0 && here.y >= 0 && here.x < MAP_W && here.y < MAP_W && !walkable[here.y][here.x];
      if (onClosure) car.s = l.dir > 0 ? -1.4 : MAP_W + 0.4; // fragment cleared the road: respawn at edge
      else if (!blocked && !carAhead) car.s += l.dir * car.speed * dt;
      if (car.s > MAP_W + 0.5) car.s = -1.5;
      if (car.s < -1.5) car.s = MAP_W + 0.5;
      const wx = l.axis === 'x' ? car.s : l.line + l.offset;
      const wy = l.axis === 'x' ? l.line + l.offset : car.s;
      const p = iso(wx, wy);
      car.root.position.set(p.x, p.y);
      car.root.zIndex = wx + wy;
      const edge = Math.min(car.s + 1.5, MAP_W + 0.5 - car.s);
      const fade = Math.max(0, Math.min(1, edge / 1.2));
      car.root.alpha = fade;
      // headlights / tail lights
      const front = iso(wx + d.x * 0.34, wy + d.y * 0.34);
      const back = iso(wx - d.x * 0.32, wy - d.y * 0.32);
      const perp = l.axis === 'x' ? { x: 0, y: 0.1 } : { x: 0.1, y: 0 };
      const f1 = iso(wx + d.x * 0.34 + perp.x, wy + d.y * 0.34 + perp.y), f2 = iso(wx + d.x * 0.34 - perp.x, wy + d.y * 0.34 - perp.y);
      const lightOn = Math.max(night, 1 - power) * fade;
      car.head[0].position.set(f1.x, f1.y - 5);
      car.head[1].position.set(f2.x, f2.y - 5);
      for (const h of car.head) h.alpha = lightOn * 0.9;
      car.tail[0].position.set(back.x, back.y - 5);
      car.tail[0].alpha = lightOn * 0.8;
      void front;
    }
  }
}

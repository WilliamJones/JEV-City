import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { buildingById, FLOOD_BASIN, isRoad, MAP_H, MAP_W } from '@/sim/map';
import {
  DEEP,
  ENGINE_ROUTE,
  FEST_CLOSED_TICK,
  FEST_CLOSING_TICK,
  FEST_OPEN_TICK,
  FEST_ROAD,
  FIRE_CORDON,
  FLOOD_RISE_TICK,
  type Simulation,
} from '@/sim/world';
import { iso, lerp, pts, up, type P } from './iso';
import { mix } from './palette';

type Particle = { s: Sprite; vx: number; vy: number; life: number; max: number; grow: number };
type Drop = { x: number; y: number; v: number };

const OFFICE = (() => {
  const b = buildingById('office');
  const x0 = b.x - 0.5, x1 = b.x + b.w - 0.5, y0 = b.y - 0.5, y1 = b.y + b.h - 0.5;
  return { x0, x1, y0, y1, H: b.floors * 20 + 10, z: (x0 + x1) / 2 + (y0 + y1) / 2 + 0.5 };
})();
const STAGE = { x: 9.7, y: 12.5 };
const BUNTING_POLES: [number, number][] = [[5.55, 8.55], [10.75, 8.55], [10.75, 11.55], [5.55, 11.55]];
const FEST_STALLS: { x: number; y: number; color: number }[] = [
  { x: 6.3, y: 11.35, color: 0xff7aa2 }, { x: 7.55, y: 11.6, color: 0x2fa9de }, { x: 9.2, y: 11.55, color: 0xf2c94c }, { x: 10.45, y: 11.3, color: 0x7bc67e }, { x: 6.05, y: 9.95, color: 0xb388eb },
];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Scenario-specific scenery for the fire, festival and flood (sim v6). Purely visual: it reads simulation
 * state and never feeds anything back into it.
 */
export class ScenarioFx {
  private water = new Graphics();
  private ripples = new Graphics();
  private cordon = new Graphics();
  private rain = new Graphics();
  private bunting = new Graphics();
  private hose = new Graphics();
  private screen = new Graphics();
  private flames = new Graphics();
  private scorch = new Graphics();
  private engine = new Container();
  private engineViews: Graphics[] = [];
  private engineLights: Sprite[] = [];
  private smoke: Particle[] = [];
  private embers: Particle[] = [];
  private mist: Particle[] = [];
  private fireGlow: Sprite;
  private drops: Drop[] = [];
  private splashes: { x: number; y: number; t: number }[] = [];
  private barriers: Graphics[] = [];
  private stalls: Container[] = [];
  private stage = new Container();
  private performers: Graphics[] = [];
  private notes: { g: Graphics; x: number; y: number; life: number }[] = [];
  private stringLights: Sprite[] = [];
  private fireworks: Particle[] = [];
  private crowdBadge: Text;
  private roadSigns: Graphics[] = [];
  /** Out-of-town festival visitors: grey-toned scenery, deliberately unlike the 25 citizens (not clickable, never counted). */
  private visitors: { g: Graphics; x: number; y: number; from: { x: number; y: number }; arrive: number; leave: number }[] = [];
  private waterVersion = -1;
  private lastFirework = 0;
  private lastFlash = -1;
  private flashT = 0;

  constructor(
    private groundLayer: Container,
    private objects: Container,
    private lights: Container,
    private fx: Container,
    stageRoot: Container,
    private glow: Texture,
    private tintables: Graphics[],
    private people: Graphics[],
    private reducedMotion: boolean,
  ) {
    groundLayer.addChild(this.water, this.ripples, this.cordon);
    stageRoot.addChild(this.screen);
    this.flames.zIndex = OFFICE.z + 0.02;
    this.scorch.zIndex = OFFICE.z + 0.01;
    objects.addChild(this.flames, this.scorch);
    fx.addChild(this.hose, this.bunting, this.rain);
    const sprite = (tint: number, layer: Container) => {
      const s = new Sprite(glow);
      s.anchor.set(0.5);
      s.tint = tint;
      s.visible = false;
      layer.addChild(s);
      return s;
    };
    this.fireGlow = sprite(0xff7a2a, lights);
    for (let i = 0; i < 80; i++) this.smoke.push({ s: sprite(0x5d6168, fx), vx: 0, vy: 0, life: 0, max: 1, grow: 0 });
    for (let i = 0; i < 22; i++) this.embers.push({ s: sprite(0xffa14a, lights), vx: 0, vy: 0, life: 0, max: 1, grow: 0 });
    for (let i = 0; i < 16; i++) this.mist.push({ s: sprite(0xe6f4ff, fx), vx: 0, vy: 0, life: 0, max: 1, grow: 0 });
    for (let i = 0; i < 70; i++) this.fireworks.push({ s: sprite(0xffffff, lights), vx: 0, vy: 0, life: 0, max: 1, grow: 0 });
    this.buildEngine();
    this.buildFestival();
    this.crowdBadge = new Text({ text: '', style: { fontFamily: 'Inter Variable, Inter, system-ui, sans-serif', fontSize: 12, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x14263e, width: 3.5 } } });
    this.crowdBadge.anchor.set(0.5);
    const cb = iso(8, 9.6);
    this.crowdBadge.position.set(cb.x, cb.y - 92);
    this.crowdBadge.zIndex = 999;
    objects.addChild(this.crowdBadge);
    for (let i = 0; i < 16; i++) {
      const g = new Graphics();
      const tone = [0xb9b6c9, 0xa9b4bf, 0xc4bcb2, 0xaeb8ae][i % 4];
      g.ellipse(0, 0, 4.5, 2.2).fill({ color: 0x000000, alpha: 0.12 });
      g.roundRect(-2.6, -5, 2.1, 5, 0.8).fill(0x8c8f99).roundRect(0.5, -5, 2.1, 5, 0.8).fill(0x8c8f99);
      g.roundRect(-3.8, -12.5, 7.6, 8.2, 2.6).fill(tone);
      g.circle(0, -15.8, 3.4).fill(0xd9d4cc);
      g.ellipse(0, -18, 3.7, 2).fill(0x9a958e);
      g.visible = false;
      g.alpha = 0.92;
      this.objects.addChild(g);
      const x = 5.8 + ((i * 0.37) % 1) * 5, y = 9.3 + ((i * 0.61) % 1) * 2.4;
      const edge = i % 3 === 0 ? { x: 5, y: 14 + (i % 4) } : i % 3 === 1 ? { x: 11, y: 6 + (i % 4) } : { x: 3 + (i % 5), y: 11 };
      this.visitors.push({ g, x, y, from: edge, arrive: FEST_OPEN_TICK + 15 + i * 22, leave: FEST_CLOSING_TICK + 20 + i * 14 });
    }
    // rain drops spread over the whole diorama
    for (let i = 0; i < 280; i++) this.drops.push(this.newDrop(true));
  }

  // ---------------------------------------------------------------- construction

  private buildEngine() {
    const draw = (g: Graphics, axis: 'x' | 'y', sign: 1 | -1) => {
      const L = 0.5, W = 0.2;
      const c = (dl: number, dw: number) => (axis === 'x' ? iso(dl * sign, dw) : iso(dw, dl * sign));
      const A = c(-L, W), B = c(L, W), C = c(L, -W), D = c(-L, -W);
      g.ellipse(0, 3, 32, 12).fill({ color: 0, alpha: 0.2 });
      const h = 13;
      const quad = (p: P[], col: number) => g.poly(pts(...p)).fill(col);
      const sides: [P, P][] = [[A, B], [B, C], [C, D], [D, A]];
      sides.sort((a, b) => a[0].y + a[1].y - (b[0].y + b[1].y));
      for (const [p, q] of sides) {
        quad([p, q, up(q, h), up(p, h)], mix(0xd63c3c, 0x000000, p.x + q.x > 0 ? 0.25 : 0.08));
        quad([up(p, 5), up(q, 5), up(q, 7), up(p, 7)], 0xf4f1e6); // white band
      }
      quad([up(A, h), up(B, h), up(C, h), up(D, h)], 0xe04848);
      // ladder along the roof
      const l0 = c(-L * 0.8, 0), l1 = c(L * 0.35, 0);
      g.moveTo(up(l0, h + 3).x, up(l0, h + 3).y).lineTo(up(l1, h + 3).x, up(l1, h + 3).y).stroke({ width: 4, color: 0xc9cfd6 });
      for (let k = 0; k <= 6; k++) { const p = up(lerp(l0, l1, k / 6), h + 3); g.circle(p.x, p.y, 1).fill(0x8d96a0); }
      // cab at the front with windscreen
      const cab = [c(L * 0.45, W * 0.9), c(L, W * 0.9), c(L, -W * 0.9), c(L * 0.45, -W * 0.9)];
      quad(cab.map((p) => up(p, h)), 0xc23535);
      quad(cab.map((p) => up(p, h + 6)), 0xe86060);
      const fw = [c(L, W * 0.85), c(L, -W * 0.85)];
      quad([up(fw[0], h - 1), up(fw[1], h - 1), up(fw[1], h + 5), up(fw[0], h + 5)], 0x9cc3d8);
    };
    for (const [axis, sign] of [['x', 1], ['x', -1], ['y', 1], ['y', -1]] as const) {
      const g = new Graphics();
      draw(g, axis, sign);
      g.visible = false;
      this.engine.addChild(g);
      this.engineViews.push(g);
      this.tintables.push(g);
    }
    for (const tint of [0xff3b3b, 0x3b7bff]) {
      const s = new Sprite(this.glow);
      s.anchor.set(0.5);
      s.tint = tint;
      s.scale.set(0.32);
      s.visible = false;
      this.lights.addChild(s);
      this.engineLights.push(s);
    }
    this.engine.visible = false;
    this.objects.addChild(this.engine);
  }

  private buildFestival() {
    for (const st of FEST_STALLS) {
      const root = new Container();
      const g = new Graphics();
      g.ellipse(0, 2, 15, 6).fill({ color: 0, alpha: 0.15 });
      g.poly([-12, -5, 0, 1, 12, -5, 0, -11]).fill(0xc9a77c);
      g.poly([-12, -5, 0, 1, 0, 5, -12, -1]).fill(0xa98760);
      g.poly([0, 1, 12, -5, 12, -1, 0, 5]).fill(0x8c6f4e);
      for (let k = 0; k < 5; k++) g.circle(-6 + k * 3, -6 + (k % 2), 1.6).fill([0xe07a5f, 0xf2cc8f, 0x81b29a, 0xe5989b, 0xf4d35e][k]);
      g.rect(-11, -22, 1.4, 17).fill(0x7a5a3c).rect(9.6, -22, 1.4, 17).fill(0x7a5a3c);
      for (let k = 0; k < 6; k++) {
        const col = k % 2 === 0 ? st.color : 0xfdf6ea;
        g.poly([-14 + k * 4.8, -20 + k * 1.2, -9.2 + k * 4.8, -18.8 + k * 1.2, -9.2 + k * 4.8, -26 + k * 1.2, -14 + k * 4.8, -27.2 + k * 1.2]).fill(col);
      }
      for (let k = 0; k < 6; k++) g.poly([-14 + k * 4.8, -20 + k * 1.2, -9.2 + k * 4.8, -18.8 + k * 1.2, -11.6 + k * 4.8, -16.5 + k * 1.2]).fill(k % 2 === 0 ? st.color : 0xfdf6ea);
      root.addChild(g);
      const p = iso(st.x, st.y);
      root.position.set(p.x, p.y);
      root.zIndex = st.x + st.y;
      root.visible = false;
      this.tintables.push(g);
      this.objects.addChild(root);
      this.stalls.push(root);
    }
    // stage with three performers (scenery, not citizens)
    const deck = new Graphics();
    const d = (x: number, y: number) => iso(x - STAGE.x, y - STAGE.y);
    const A = d(STAGE.x - 0.9, STAGE.y + 0.55), B = d(STAGE.x + 0.9, STAGE.y + 0.55), C = d(STAGE.x + 0.9, STAGE.y - 0.55), D = d(STAGE.x - 0.9, STAGE.y - 0.55);
    deck.poly(pts(A, B, up(B, 7), up(A, 7))).fill(0x4a3b5c);
    deck.poly(pts(B, C, up(C, 7), up(B, 7))).fill(0x3a2e49);
    deck.poly(pts(up(A, 7), up(B, 7), up(C, 7), up(D, 7))).fill(0x6b5a86);
    // backdrop arch
    deck.moveTo(up(D, 7).x, up(D, 7).y).lineTo(up(D, 44).x, up(D, 44).y).stroke({ width: 2, color: 0x2f2640 });
    deck.moveTo(up(C, 7).x, up(C, 7).y).lineTo(up(C, 44).x, up(C, 44).y).stroke({ width: 2, color: 0x2f2640 });
    deck.poly(pts(up(D, 38), up(C, 38), up(C, 46), up(D, 46))).fill(0xf2c94c);
    this.stage.addChild(deck);
    this.tintables.push(deck);
    const outfits = [0x8e44ad, 0xe67e22, 0x16a085];
    [[-0.45, 0.05], [0.1, -0.15], [0.55, 0.1]].forEach(([dx, dy], i) => {
      const g = new Graphics();
      const p = iso(dx, dy);
      g.position.set(p.x, p.y - 7);
      g.roundRect(-3, -6, 2.4, 6, 1).fill(0x2a2a2a).roundRect(0.6, -6, 2.4, 6, 1).fill(0x2a2a2a);
      g.roundRect(-4.3, -14.5, 8.6, 9.5, 3).fill(outfits[i]);
      g.circle(0, -18.5, 4).fill([0xe8b894, 0x9c6a48, 0xf6d5b8][i]);
      g.ellipse(0, -21, 4.6, 2.4).fill([0x2b2118, 0xd9b26a, 0x5a3c26][i]);
      if (i === 0) { g.ellipse(4, -9, 4.5, 2.6).fill(0xc68642); g.moveTo(6, -10).lineTo(12, -15).stroke({ width: 1.4, color: 0x5a3c26 }); } // guitar
      if (i === 1) { g.rect(-1, -22, 2, 4).fill(0x333333); g.moveTo(0, -18).lineTo(0, -8).stroke({ width: 1, color: 0x555555 }); } // mic
      if (i === 2) { g.ellipse(6, -3, 5, 2.5).fill(0xd9d9d9); g.rect(1, -3, 10, 3).fill(0xb03a2e); } // drum
      this.stage.addChild(g);
      this.performers.push(g);
      this.people.push(g);
    });
    const sp = iso(STAGE.x, STAGE.y);
    this.stage.position.set(sp.x, sp.y);
    this.stage.zIndex = STAGE.x + STAGE.y;
    this.stage.visible = false;
    this.objects.addChild(this.stage);
    // string lights along the bunting
    for (let i = 0; i < 4; i++) {
      const a = BUNTING_POLES[i], b = BUNTING_POLES[(i + 1) % 4];
      for (let k = 1; k < 9; k++) {
        const u = k / 9;
        const s = new Sprite(this.glow);
        s.anchor.set(0.5);
        s.tint = [0xffd27a, 0xff9ec4, 0x9fe3ff][k % 3];
        s.scale.set(0.09);
        const p = this.sag(a, b, u);
        s.position.set(p.x, p.y);
        s.visible = false;
        this.lights.addChild(s);
        this.stringLights.push(s);
      }
    }
    // road-closed barricades at both ends of the plaza road
    for (const x of [FEST_ROAD.x0 - 0.5, FEST_ROAD.x1 + 0.5]) this.roadSigns.push(this.barricade(x, FEST_ROAD.y, 'x'));
  }

  /** Point on a sagging rope strung between two poles (rope ~40px up). */
  private sag(a: [number, number], b: [number, number], u: number): P {
    const p = iso(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u);
    return { x: p.x, y: p.y - 40 + Math.sin(u * Math.PI) * 9 };
  }

  private barricade(x: number, y: number, along: 'x' | 'y') {
    const g = new Graphics();
    const p = iso(x, y);
    const a = along === 'x' ? iso(0, -0.38) : iso(-0.38, 0), b = along === 'x' ? iso(0, 0.38) : iso(0.38, 0);
    g.ellipse(0, 2, 14, 5).fill({ color: 0, alpha: 0.15 });
    for (const q of [a, b]) g.moveTo(q.x, q.y).lineTo(q.x, q.y - 9).stroke({ width: 1.6, color: 0x6b6f75 });
    for (let k = 0; k < 6; k++) {
      const q0 = lerp(a, b, k / 6), q1 = lerp(a, b, (k + 1) / 6);
      g.poly(pts(up(q0, 7), up(q1, 7), up(q1, 11), up(q0, 11))).fill(k % 2 ? 0xffffff : 0xe8542f);
    }
    g.position.set(p.x, p.y);
    g.zIndex = x + y + 0.2;
    g.visible = false;
    this.tintables.push(g);
    this.objects.addChild(g);
    return g;
  }

  private newDrop(anywhere = false): Drop {
    const left = iso(-0.5, MAP_H - 0.5).x, right = iso(MAP_W - 0.5, -0.5).x;
    const top = iso(-0.5, -0.5).y - 220, bottom = iso(MAP_W - 0.5, MAP_H - 0.5).y;
    return { x: rnd(left, right), y: anywhere ? rnd(top, bottom) : top + rnd(-40, 0), v: rnd(9, 13) };
  }

  // ---------------------------------------------------------------- lifecycle

  reset() {
    this.water.clear();
    this.ripples.clear();
    this.cordon.clear();
    this.rain.clear();
    this.bunting.clear();
    this.hose.clear();
    this.screen.clear();
    this.flames.clear();
    this.scorch.clear();
    this.engine.visible = false;
    for (const s of this.engineLights) s.visible = false;
    this.fireGlow.visible = false;
    for (const p of [...this.smoke, ...this.embers, ...this.mist, ...this.fireworks]) { p.life = 0; p.s.visible = false; }
    for (const b of this.barriers) b.visible = false;
    for (const s of this.stalls) s.visible = false;
    for (const s of this.roadSigns) s.visible = false;
    for (const s of this.stringLights) s.visible = false;
    for (const v of this.visitors) v.g.visible = false;
    for (const n of this.notes) n.g.destroy();
    this.notes = [];
    this.stage.visible = false;
    this.crowdBadge.text = '';
    this.waterVersion = -1;
    this.lastFlash = -1;
    this.flashT = 0;
  }

  /** Ambient light shift for the scenario: overcast rain, golden-hour festival dusk. */
  ambient(sim: Simulation): { dark: number; tint: number; amount: number } {
    if (sim.scenario === 'flash_flood') return { dark: sim.flood.rain * 0.3, tint: 0x8fa3b8, amount: sim.flood.rain * 0.5 };
    if (sim.scenario === 'street_festival') {
      const k = Math.max(0, Math.min(1, (sim.tick - 500) / 800));
      return { dark: k * 0.5, tint: 0xffc890, amount: 0.12 + (1 - k) * 0.1 };
    }
    if (sim.scenario === 'building_fire' && sim.fireActive) return { dark: 0, tint: 0xd8c2a8, amount: sim.fire.intensity * 0.12 };
    return { dark: 0, tint: 0xffffff, amount: 0 };
  }

  update(sim: Simulation, t: number, dt: number, night: number) {
    this.updateFire(sim, t, dt);
    this.updateFlood(sim, t, dt);
    this.updateFestival(sim, t, dt, night);
    // screen flash (lightning) fades
    this.screen.clear();
    if (this.flashT > 0) {
      this.flashT -= 0.05 * dt;
      const w = this.screen.parent ? (this.screen.parent as Container).width : 0;
      void w;
      this.screen.rect(-5000, -5000, 10000, 10000).fill({ color: 0xeef4ff, alpha: Math.max(0, this.flashT) * 0.55 });
    }
  }

  // ---------------------------------------------------------------- fire

  private updateFire(sim: Simulation, t: number, dt: number) {
    const f = sim.fire;
    const on = sim.scenario === 'building_fire';
    const roof = (u: number, v: number) => up(iso(OFFICE.x0 + (OFFICE.x1 - OFFICE.x0) * u, OFFICE.y0 + (OFFICE.y1 - OFFICE.y0) * v), OFFICE.H);
    const burning = on && (f.phase === 'burning' || f.phase === 'suppression');
    const smoking = on && sim.fireActive;
    const steam = on && f.phase === 'contained';

    // cordon tape + cones + tinted closed tiles
    this.cordon.clear();
    if (on && sim.fireCordonUp) {
      const c = FIRE_CORDON;
      for (let y = c.y0; y <= c.y1; y++)
        for (let x = c.x0; x <= c.x1; x++) {
          const q = [iso(x - 0.5, y - 0.5), iso(x + 0.5, y - 0.5), iso(x + 0.5, y + 0.5), iso(x - 0.5, y + 0.5)];
          this.cordon.poly(pts(...q)).fill({ color: 0xd84d56, alpha: isRoad(x, y) ? 0.16 : 0.08 });
        }
      const corners = [iso(c.x0 - 0.5, c.y0 - 0.5), iso(c.x1 + 0.5, c.y0 - 0.5), iso(c.x1 + 0.5, c.y1 + 0.5), iso(c.x0 - 0.5, c.y1 + 0.5)];
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        const n = Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 9);
        for (let k = 0; k < n; k++) {
          const p = lerp(a, b, k / n), q = lerp(a, b, (k + 1) / n);
          this.cordon.moveTo(p.x, p.y - 6).lineTo(q.x, q.y - 6).stroke({ width: 2.4, color: k % 2 ? 0xffffff : 0xd84d56 });
        }
        this.cordon.poly([a.x - 3.5, a.y, a.x + 3.5, a.y, a.x, a.y - 10]).fill(0xf17961).rect(a.x - 2.2, a.y - 5, 4.4, 1.5).fill(0xffffff);
      }
    }

    // flames on the roof and in the windows
    this.flames.clear();
    this.fireGlow.visible = burning;
    if (burning) {
      const k = f.intensity;
      const mid = roof(0.5, 0.5);
      this.fireGlow.position.set(mid.x, mid.y + 10);
      this.fireGlow.scale.set(1.6 + k * 1.4);
      this.fireGlow.alpha = (0.45 + 0.15 * Math.sin(t * 13)) * k;
      const tongues = 9;
      for (let i = 0; i < tongues; i++) {
        const u = (i + 0.5) / tongues;
        const base = i % 2 ? roof(u, 1) : roof(1, u);
        const hgt = (14 + 22 * k) * (0.7 + 0.3 * Math.sin(t * (7 + i) + i * 1.7));
        const w = 6 + 4 * k;
        this.flames.poly([base.x - w, base.y, base.x + w, base.y, base.x + Math.sin(t * 9 + i) * 3, base.y - hgt]).fill({ color: 0xff6a2a, alpha: 0.9 });
        this.flames.poly([base.x - w * 0.5, base.y, base.x + w * 0.5, base.y, base.x + Math.sin(t * 11 + i) * 2, base.y - hgt * 0.6]).fill({ color: 0xffd36a, alpha: 0.95 });
      }
      // glowing windows on the street-facing walls
      const A = iso(OFFICE.x0, OFFICE.y1), B = iso(OFFICE.x1, OFFICE.y1), C = iso(OFFICE.x1, OFFICE.y0);
      const floors = Math.max(1, Math.round(1 + k * 3));
      for (let fl = 4 - floors; fl < 4; fl++)
        for (const [fa, fb] of [[A, B], [B, C]] as const)
          for (let i = 0; i < 6; i++) {
            if ((i * 5 + fl * 3) % 3 === 0) continue;
            const flick = 0.55 + 0.45 * Math.sin(t * (8 + i) + fl * 2 + i);
            const yb = 9 + fl * 20, yt = yb + 12;
            const p0 = lerp(fa, fb, (i + 0.15) / 6), p1 = lerp(fa, fb, (i + 0.85) / 6);
            this.flames.poly(pts(up(p0, yb), up(p1, yb), up(p1, yt), up(p0, yt))).fill({ color: mix(0xff5a1f, 0xffc24a, flick), alpha: (0.35 + 0.45 * flick) * k });
          }
    }

    // soot streaks stay after the fire
    this.scorch.clear();
    if (on && f.phase !== 'none' && f.phase !== 'smoke') {
      const A = iso(OFFICE.x0, OFFICE.y1), B = iso(OFFICE.x1, OFFICE.y1), C = iso(OFFICE.x1, OFFICE.y0);
      const a = burning ? 0.25 + f.intensity * 0.2 : 0.35;
      for (const [fa, fb] of [[A, B], [B, C]] as const)
        for (let i = 0; i < 6; i++) {
          if ((i * 5) % 4 === 0) continue;
          const p0 = lerp(fa, fb, (i + 0.1) / 6), p1 = lerp(fa, fb, (i + 0.9) / 6);
          for (let fl = 1; fl < 4; fl++) this.scorch.poly(pts(up(p0, 21 + fl * 20), up(p1, 21 + fl * 20), up(lerp(p0, p1, 0.6), 33 + fl * 20), up(lerp(p0, p1, 0.4), 33 + fl * 20))).fill({ color: 0x1f1a17, alpha: a });
        }
    }

    // smoke plume (normal blend), steam after the fire is out
    const src = roof(0.5, 0.5);
    for (const p of this.smoke) {
      if (p.life <= 0 && (smoking || steam) && Math.random() < (steam ? 0.06 : 0.12 + f.intensity * 0.4) * dt) {
        p.max = p.life = rnd(3, 5.5);
        p.s.position.set(src.x + rnd(-26, 26), src.y + rnd(-4, 4));
        p.vx = rnd(0.35, 0.8);
        p.vy = -rnd(0.75, 1.15);
        p.grow = rnd(0.005, 0.009);
        p.s.scale.set(rnd(0.16, 0.28));
        p.s.tint = steam ? 0xeef3f6 : f.phase === 'smoke' ? 0xa7adb3 : mix(0x6c7178, 0x3d4046, f.intensity);
      }
      if (p.life > 0) {
        p.life -= dt / 60;
        p.s.visible = true;
        p.s.x += p.vx * dt;
        p.s.y += p.vy * dt;
        p.s.scale.set(p.s.scale.x + p.grow * dt);
        const age = 1 - p.life / p.max;
        const peak = steam ? 0.3 : f.phase === 'smoke' ? 0.32 : 0.32 + f.intensity * 0.22;
        p.s.alpha = peak * Math.min(1, age * 5) * (1 - age);
      } else p.s.visible = false;
    }
    for (const p of this.embers) {
      if (p.life <= 0 && burning && !this.reducedMotion && Math.random() < 0.08 * f.intensity * dt) {
        p.max = p.life = rnd(1, 2.2);
        p.s.position.set(src.x + rnd(-40, 40), src.y + rnd(-8, 4));
        p.vx = rnd(-0.2, 0.8);
        p.vy = -rnd(0.8, 1.6);
        p.s.scale.set(rnd(0.04, 0.07));
      }
      if (p.life > 0) {
        p.life -= dt / 60;
        p.s.visible = true;
        p.s.x += (p.vx + Math.sin(t * 6 + p.max * 10) * 0.3) * dt;
        p.s.y += p.vy * dt;
        p.s.alpha = Math.min(1, p.life * 1.5);
      } else p.s.visible = false;
    }

    // fire engine
    const e = f.engine;
    this.engine.visible = on && e.dispatched && sim.fireActive;
    if (this.engine.visible) {
      const pos = iso(e.x, e.y);
      this.engine.position.set(pos.x, pos.y);
      this.engine.zIndex = e.x + e.y + 0.1;
      const seg = Math.min(e.seg, ENGINE_ROUTE.length - 2);
      const a = ENGINE_ROUTE[seg], b = ENGINE_ROUTE[seg + 1];
      const vi = b.x !== a.x ? (b.x > a.x ? 0 : 1) : b.y > a.y ? 2 : 3;
      this.engineViews.forEach((g, i) => (g.visible = i === vi));
      const flash = Math.sin(t * 14) > 0;
      this.engineLights.forEach((s, i) => {
        s.visible = f.phase !== 'contained';
        s.position.set(pos.x + (i ? 6 : -6), pos.y - 30);
        s.alpha = (i === 0 ? flash : !flash) ? 0.95 : 0.15;
      });
    } else for (const s of this.engineLights) s.visible = false;

    // hose spray from the engine onto the roof
    this.hose.clear();
    if (on && f.phase === 'suppression') {
      const from = up(iso(e.x, e.y), 22);
      const to = roof(0.85, 0.75);
      const ctrl = { x: (from.x + to.x) / 2 + 10, y: Math.min(from.y, to.y) - 60 };
      this.hose.moveTo(from.x, from.y).quadraticCurveTo(ctrl.x, ctrl.y, to.x, to.y).stroke({ width: 3, color: 0xcfe9ff, alpha: 0.85 });
      for (let i = 0; i < 10; i++) {
        const u = ((t * 1.6 + i / 10) % 1);
        const q = { x: (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * ctrl.x + u * u * to.x, y: (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * ctrl.y + u * u * to.y };
        this.hose.circle(q.x, q.y, 2.2).fill({ color: 0xffffff, alpha: 0.9 });
      }
      for (const p of this.mist) {
        if (p.life <= 0 && Math.random() < 0.15 * dt) {
          p.max = p.life = rnd(0.8, 1.6);
          p.s.position.set(to.x + rnd(-14, 14), to.y + rnd(-6, 6));
          p.vx = rnd(-0.4, 0.4);
          p.vy = -rnd(0.1, 0.5);
          p.s.scale.set(rnd(0.2, 0.35));
        }
        if (p.life > 0) {
          p.life -= dt / 60;
          p.s.visible = true;
          p.s.x += p.vx * dt;
          p.s.y += p.vy * dt;
          p.s.alpha = 0.5 * (p.life / p.max);
        } else p.s.visible = false;
      }
    } else for (const p of this.mist) { p.life = 0; p.s.visible = false; }
  }

  // ---------------------------------------------------------------- flood

  private updateFlood(sim: Simulation, t: number, dt: number) {
    const on = sim.scenario === 'flash_flood';
    const fl = sim.flood;
    if (on && fl.version !== this.waterVersion) {
      this.waterVersion = fl.version;
      this.drawWater(sim);
    }
    if (!on && this.waterVersion !== -1) { this.water.clear(); this.waterVersion = -1; }

    // ripples and glints on the water
    this.ripples.clear();
    if (on && fl.level > 0 && !this.reducedMotion) {
      for (let i = 0; i < 60; i++) {
        const x = (i * 7) % MAP_W, y = (i * 13 + Math.floor(t / 3)) % MAP_H;
        if (fl.depth[y * MAP_W + x] <= 0) continue;
        const ph = (t * 0.9 + i * 0.37) % 1;
        const c = iso(x + ((i * 0.31) % 0.6) - 0.3, y + ((i * 0.53) % 0.6) - 0.3);
        this.ripples.ellipse(c.x, c.y, 3 + ph * 12, (3 + ph * 12) / 2).stroke({ width: 1, color: 0xe6f4ff, alpha: 0.5 * (1 - ph) * Math.min(1, fl.rain + 0.3) });
      }
    }

    // rain
    this.rain.clear();
    const rain = on ? fl.rain : 0;
    if (rain > 0.01) {
      const n = Math.floor(this.drops.length * Math.min(1, rain * 1.1));
      const bottom = iso(MAP_W - 0.5, MAP_H - 0.5).y;
      for (let i = 0; i < n; i++) {
        const d = this.drops[i];
        if (!this.reducedMotion) { d.y += d.v * dt; d.x -= d.v * 0.28 * dt; }
        if (d.y > bottom) {
          if (this.splashes.length < 40) this.splashes.push({ x: d.x, y: d.y - rnd(0, 300), t: 1 });
          Object.assign(d, this.newDrop());
        }
        this.rain.moveTo(d.x, d.y).lineTo(d.x + 4, d.y - 15).stroke({ width: 1.3, color: i % 3 ? 0x7f97b0 : 0xe8f1fa, alpha: 0.55 });
      }
      for (const s of this.splashes) {
        s.t -= 0.06 * dt;
        this.rain.ellipse(s.x, s.y, 5 * (1 - s.t) + 1, 2 * (1 - s.t) + 0.5).stroke({ width: 1, color: 0xe6f4ff, alpha: Math.max(0, s.t) * 0.6 });
      }
      this.splashes = this.splashes.filter((s) => s.t > 0);
    } else this.splashes = [];

    // lightning: once at the cloudburst, then now and again while rising
    if (on && !this.reducedMotion) {
      const strike = sim.tick === FLOOD_RISE_TICK || (fl.phase === 'rising' && sim.tick % 230 === 0);
      if (strike && this.lastFlash !== sim.tick) { this.lastFlash = sim.tick; this.flashT = 1; }
    }
  }

  private drawWater(sim: Simulation) {
    const g = this.water;
    g.clear();
    const fl = sim.flood;
    const depth = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? 0 : fl.depth[y * MAP_W + x]);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const d = depth(x, y);
        if (d <= 0) continue;
        const q = [iso(x - 0.52, y - 0.52), iso(x + 0.52, y - 0.52), iso(x + 0.52, y + 0.52), iso(x - 0.52, y + 0.52)];
        const deep = d > DEEP;
        g.poly(pts(...q)).fill({ color: deep ? mix(0x4c86b5, 0x2f5f8a, Math.min(1, (d - DEEP) / 0.2)) : 0x8cc0dd, alpha: deep ? 0.82 : 0.55 });
        // foam where the water meets dry ground
        const edges: [number, number, P, P][] = [[0, -1, q[0], q[1]], [1, 0, q[1], q[2]], [0, 1, q[2], q[3]], [-1, 0, q[3], q[0]]];
        for (const [dx, dy, a, b] of edges) if (depth(x + dx, y + dy) <= 0) g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1.6, color: 0xf1f8ff, alpha: 0.75 });
      }
    // barriers on dry road tiles that border deep water
    let used = 0;
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (!isRoad(x, y) || depth(x, y) > DEEP) continue;
        const wetAlongX = depth(x + 1, y) > DEEP || depth(x - 1, y) > DEEP;
        const wetAlongY = depth(x, y + 1) > DEEP || depth(x, y - 1) > DEEP;
        if (!wetAlongX && !wetAlongY) continue;
        if (used >= 24) break;
        if (!this.barriers[used]) this.barriers[used] = this.barricade(0, 0, 'x');
        const b = this.barriers[used++];
        const dir: 'x' | 'y' = wetAlongX ? 'x' : 'y';
        b.clear();
        const a0 = dir === 'x' ? iso(0, -0.38) : iso(-0.38, 0), b0 = dir === 'x' ? iso(0, 0.38) : iso(0.38, 0);
        b.ellipse(0, 2, 14, 5).fill({ color: 0, alpha: 0.15 });
        for (const q of [a0, b0]) b.moveTo(q.x, q.y).lineTo(q.x, q.y - 9).stroke({ width: 1.6, color: 0x6b6f75 });
        for (let k = 0; k < 6; k++) {
          const q0 = lerp(a0, b0, k / 6), q1 = lerp(a0, b0, (k + 1) / 6);
          b.poly(pts(up(q0, 7), up(q1, 7), up(q1, 11), up(q0, 11))).fill(k % 2 ? 0xffffff : 0xe8542f);
        }
        const p = iso(x, y);
        b.position.set(p.x, p.y);
        b.zIndex = x + y + 0.2;
        b.visible = true;
      }
    for (let i = used; i < this.barriers.length; i++) this.barriers[i].visible = false;
    void FLOOD_BASIN;
  }

  // ---------------------------------------------------------------- festival

  private updateFestival(sim: Simulation, t: number, dt: number, night: number) {
    const on = sim.scenario === 'street_festival';
    const fe = sim.festival;
    const up_ = on && fe.phase !== 'closed' && fe.phase !== 'none';
    // stalls pop in during setup, one by one
    this.stalls.forEach((s, i) => {
      const at = (i + 1) * 30;
      s.visible = up_ && sim.tick >= at;
      if (s.visible) s.scale.set(Math.min(1, 0.6 + (sim.tick - at) / 40));
    });
    for (const s of this.roadSigns) s.visible = on && sim.festivalRoadClosed;
    this.stage.visible = up_;
    const live = on && (fe.phase === 'open' || fe.phase === 'closing');
    const beat = Math.abs(Math.sin(t * Math.PI * 2));
    this.performers.forEach((g, i) => {
      g.y = iso(0, 0).y - 7 - (live && !this.reducedMotion ? beat * (i === 1 ? 2.5 : 1.5) : 0);
      g.rotation = live && !this.reducedMotion ? Math.sin(t * 4 + i) * 0.06 : 0;
    });
    // bunting
    this.bunting.clear();
    if (up_) {
      for (let i = 0; i < 4; i++) {
        const a = BUNTING_POLES[i], b = BUNTING_POLES[(i + 1) % 4];
        const pa = iso(a[0], a[1]);
        this.bunting.moveTo(pa.x, pa.y).lineTo(pa.x, pa.y - 42).stroke({ width: 1.8, color: 0x6b5a4a });
        let prev = this.sag(a, b, 0);
        for (let k = 1; k <= 12; k++) {
          const p = this.sag(a, b, k / 12);
          this.bunting.moveTo(prev.x, prev.y).lineTo(p.x, p.y).stroke({ width: 1, color: 0x4a3b30, alpha: 0.7 });
          const m = lerp(prev, p, 0.5);
          const sway = this.reducedMotion ? 0 : Math.sin(t * 3 + k + i) * 1.2;
          this.bunting.poly([prev.x, prev.y, p.x, p.y, m.x + sway, m.y + 7]).fill([0xff7aa2, 0x2fa9de, 0xf2c94c, 0x7bc67e, 0xb388eb][(k + i) % 5]);
          prev = p;
        }
      }
    }
    const glowK = Math.max(0.35, night);
    this.stringLights.forEach((s, i) => {
      s.visible = up_;
      s.alpha = glowK * (0.65 + 0.35 * Math.sin(t * 3 + i * 0.9));
    });
    // music notes drifting up from the stage
    if (live && !this.reducedMotion && Math.random() < 0.05 * dt && this.notes.length < 14) {
      const g = new Graphics();
      const col = [0xff7aa2, 0x2fa9de, 0xf2c94c][Math.floor(Math.random() * 3)];
      g.circle(-2, 3, 2.2).fill(col).rect(-0.4, -5, 1.4, 8).fill(col).poly([-0.4, -5, 4, -3, 4, -1.4, 1, -3]).fill(col);
      const sp = iso(STAGE.x, STAGE.y);
      const n = { g, x: sp.x + rnd(-20, 20), y: sp.y - 40, life: 1 };
      this.fx.addChild(g);
      this.notes.push(n);
    }
    for (const n of this.notes) {
      n.life -= 0.011 * dt;
      n.y -= 0.4 * dt;
      n.g.position.set(n.x + Math.sin(n.life * 12) * 6, n.y);
      n.g.alpha = Math.min(1, n.life * 2);
    }
    this.notes = this.notes.filter((n) => { if (n.life <= 0) { n.g.destroy(); return false; } return true; });
    // fireworks over the plaza at the closing announcement (scenery)
    const show = on && sim.tick >= FEST_CLOSING_TICK && sim.tick < FEST_CLOSED_TICK && !this.reducedMotion;
    if (show && t - this.lastFirework > 1.1) {
      this.lastFirework = t;
      const c = iso(rnd(6, 11), rnd(8, 11));
      const cy = c.y - rnd(150, 230);
      const col = [0xff7aa2, 0x9fe3ff, 0xffd27a, 0xb388eb][Math.floor(Math.random() * 4)];
      let k = 0;
      for (const p of this.fireworks) {
        if (p.life > 0) continue;
        const a = (k / 22) * Math.PI * 2;
        p.max = p.life = rnd(1.1, 1.6);
        p.s.position.set(c.x, cy);
        p.vx = Math.cos(a) * rnd(1.6, 2.4);
        p.vy = Math.sin(a) * rnd(1.6, 2.4);
        p.s.tint = col;
        p.s.scale.set(0.07);
        if (++k >= 22) break;
      }
    }
    for (const p of this.fireworks) {
      if (p.life > 0) {
        p.life -= dt / 60;
        p.vy += 0.03 * dt;
        p.vx *= 0.985;
        p.s.visible = true;
        p.s.x += p.vx * dt;
        p.s.y += p.vy * dt;
        p.s.alpha = Math.min(1, p.life / p.max * 1.6);
      } else p.s.visible = false;
    }
    for (const v of this.visitors) {
      const showIt = on && sim.tick >= v.arrive && sim.tick < v.leave + 60;
      v.g.visible = showIt;
      if (!showIt) continue;
      const kIn = Math.min(1, (sim.tick - v.arrive) / 60), kOut = Math.max(0, Math.min(1, (sim.tick - v.leave) / 60));
      const k = kIn * (1 - kOut);
      const wob = this.reducedMotion ? 0 : Math.sin(t * 0.7 + v.arrive) * 0.25;
      const px = v.from.x + (v.x + wob - v.from.x) * k, py = v.from.y + (v.y - v.from.y) * k;
      const p = iso(px, py);
      const dancing = k === 1 && live && !this.reducedMotion;
      v.g.position.set(p.x, p.y - (dancing ? Math.abs(Math.sin(t * Math.PI * 2 + v.arrive)) * 1.6 : 0));
      v.g.zIndex = px + py;
      v.g.alpha = 0.92 * Math.min(1, kIn * 3) * (1 - kOut * kOut);
    }
    const n = sim.festivalCrowd();
    this.crowdBadge.text = on && fe.phase !== 'setup' && fe.phase !== 'none' && fe.phase !== 'closed' && sim.tick >= FEST_OPEN_TICK ? `♫ ${n} at the festival` : '';
  }
}

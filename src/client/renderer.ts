'use client';
import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { BUILDINGS, isRoad, MAP_H, MAP_W, STREETLIGHTS, TREES, type Building } from '@/sim/map';
import type { Citizen } from '@/sim/citizens';
import type { ActionId } from '@/sim/types';
import { BLACKOUT_TICK, METEOR_CENTER, METEOR_IMPACT_TICK, METEOR_WARN_TICK, POWER_RESTORED_TICK, type Simulation } from '@/sim/world';
import type { Controller } from './controller';
import { drawActionIcon } from './icons';
import { ease, glowTexture, iso, lerp, pts, up, type P } from './iso';
import { ACTION_COLOR, HAIRS, mix, PAL, SHIRTS, SKINS } from './palette';
import { Traffic } from './traffic';

const DAY_TINT = 0xffffff;
const NIGHT_TINT = 0x4a5a86;
const BLACKOUT_TINT = 0x29334f;
const SUBSTATION = { x: 14, y: 20 };

type Light = { sprites: Sprite[]; x: number; y: number; base: number };
type BuildingView = { b: Building; root: Container; body: Graphics; windows: Graphics; spill: Sprite[]; glow: Sprite | null; badge: Text | null; depth: number; x0: number; x1: number; y0: number; y1: number };
type CitizenView = {
  root: Container; body: Container; ring: Graphics; alert: Graphics; pulse: Graphics; bubble: Container; bubbleIcon: Graphics;
  marker: Graphics; markerT: number; markerAt: P | null; pulseT: number; bubbleT: number; lastDecisionId: string | null; label: Text; action: ActionId | null;
};
type Stall = { root: Container; x: number; y: number; debris: Graphics };

export class CityRenderer {
  app = new Application();
  private world = new Container();
  private ground = new Graphics();
  private hazardLayer = new Graphics();
  private markers = new Container();
  private pathLayer = new Graphics();
  private crater = new Graphics();
  private objects = new Container();
  private lights = new Container();
  private fx = new Container();
  private flash = new Graphics();
  private buildings: BuildingView[] = [];
  private citizens = new Map<string, CitizenView>();
  private tintables: Graphics[] = [];
  /** Citizens get a lighter tint than the world at night so they stay readable (rim-light effect). */
  private people: Graphics[] = [];
  private streetLights: Light[] = [];
  private stalls: Stall[] = [];
  private fountainSpray!: Graphics;
  private beacon!: Sprite;
  private lantern!: Sprite;
  private meteorHead!: Sprite;
  private meteorTrail = new Graphics();
  private shock = new Graphics();
  private sparks: { s: Sprite; vx: number; vy: number; life: number }[] = [];
  private dust: { s: Sprite; vx: number; vy: number; life: number }[] = [];
  private embers: { s: Sprite; phase: number }[] = [];
  private traffic!: Traffic;
  private glow!: Texture;
  private night = 0;
  private blackoutF = 0;
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private fitScale = 1;
  private destroyed = false;
  private reducedMotion = false;
  private lastSim: Simulation | null = null;
  private userMovedCamera = false;
  private cam: { from: { zoom: number; pan: P }; to: { zoom: number; pan: P }; t0: number; dur: number } | null = null;
  private cue = new Set<string>();
  private lastFrame = performance.now();
  onSelect: (id: string | null) => void = () => {};

  async init(el: HTMLElement, ctrl: Controller) {
    await this.app.init({ resizeTo: el, antialias: true, backgroundAlpha: 0, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
    if (this.destroyed) { this.app.destroy(true); return; }
    el.appendChild(this.app.canvas);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.glow = glowTexture();
    this.objects.sortableChildren = true;
    this.lights.blendMode = 'add';
    this.app.stage.addChild(this.world, this.flash);
    this.world.addChild(this.ground, this.hazardLayer, this.crater, this.markers, this.pathLayer, this.objects, this.lights, this.fx);
    this.drawGround();
    this.drawTrees();
    this.drawStreetlights();
    this.drawDecor();
    for (const b of BUILDINGS) this.drawBuilding(b);
    this.traffic = new Traffic(this.objects, this.lights, this.glow, this.tintables);
    this.setupFx();
    this.setupInput(ctrl);
    this.fit();
    this.app.renderer.on('resize', () => this.fit());
    this.app.ticker.add(() => this.frame(ctrl));
  }

  destroy() {
    this.destroyed = true;
    try { this.app.destroy(true, { children: true }); } catch { /* not initialized yet */ }
  }

  // ---------------------------------------------------------------- static scene

  private drawGround() {
    const g = this.ground;
    this.tintables.push(g);
    const a = iso(-0.5, MAP_H - 0.5), b = iso(MAP_W - 0.5, MAP_H - 0.5), c = iso(MAP_W - 0.5, -0.5);
    const depth = 46;
    g.poly(pts(a, b, up(b, -depth), up(a, -depth))).fill(PAL.soilSide);
    g.poly(pts(b, c, up(c, -depth), up(b, -depth))).fill(PAL.soilDark);
    g.poly(pts(a, b, up(b, -8), up(a, -8))).fill(0x7fae62);
    g.poly(pts(b, c, up(c, -8), up(b, -8))).fill(0x6c9853);
    for (let i = 1; i < 4; i++) {
      const t = 8 + i * 9;
      g.moveTo(a.x, a.y + t).lineTo(b.x, b.y + t).lineTo(c.x, c.y + t).stroke({ width: 1, color: 0x000000, alpha: 0.08 });
    }
    // pebbles in the soil
    for (let i = 0; i < 40; i++) {
      const u = (i * 0.618) % 1, v = ((i * 0.37) % 1) * 0.7 + 0.2;
      const side = i % 2 === 0;
      const p = side ? lerp(a, b, u) : lerp(b, c, u);
      g.ellipse(p.x, p.y + 10 + v * (depth - 14), 2.5, 1.2).fill({ color: 0x000000, alpha: 0.1 });
    }
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const corners = [iso(x - 0.5, y - 0.5), iso(x + 0.5, y - 0.5), iso(x + 0.5, y + 0.5), iso(x - 0.5, y + 0.5)];
        const road = isRoad(x, y);
        const nearRoad = !road && (isRoad(x + 1, y) || isRoad(x - 1, y) || isRoad(x, y + 1) || isRoad(x, y - 1));
        const plaza = x >= 6 && x <= 10 && y >= 9 && y <= 10;
        const color = road ? PAL.road : plaza ? PAL.plaza : nearRoad ? PAL.sidewalk : PAL.grass[(x * 7 + y * 13) % 3];
        g.poly(pts(...corners)).fill(color);
        if (!road) g.poly(pts(...corners)).stroke({ width: 1, color: 0x000000, alpha: nearRoad || plaza ? 0.06 : 0.02 });
        if (!road && !nearRoad && !plaza) {
          // grass tufts and the odd flower
          const n = (x * 31 + y * 17) % 7;
          for (let k = 0; k < 2; k++) {
            const c0 = iso(x - 0.3 + ((n + k * 3) % 5) * 0.14, y - 0.3 + ((n * 2 + k) % 5) * 0.14);
            g.moveTo(c0.x - 2, c0.y).lineTo(c0.x, c0.y - 3).lineTo(c0.x + 2, c0.y).stroke({ width: 1, color: 0x6f9e55, alpha: 0.5 });
          }
          if (n === 3) {
            const f = iso(x + 0.2, y - 0.15);
            g.circle(f.x, f.y, 1.6).fill([0xf2cc8f, 0xe5989b, 0xffffff][(x + y) % 3]);
          }
        }
        if (road) {
          // curb shading
          if (!isRoad(x, y + 1) && y + 1 < MAP_H) g.moveTo(corners[3].x, corners[3].y).lineTo(corners[2].x, corners[2].y).stroke({ width: 2, color: PAL.curb, alpha: 0.9 });
          if (!isRoad(x + 1, y) && x + 1 < MAP_W) g.moveTo(corners[1].x, corners[1].y).lineTo(corners[2].x, corners[2].y).stroke({ width: 2, color: PAL.curb, alpha: 0.9 });
          const hRoad = [5, 11, 17].includes(y), vRoad = [5, 11, 17].includes(x);
          if (hRoad && vRoad) {
            for (const [ox, oy, alongX] of [[0, -0.42, true], [0, 0.42, true], [-0.42, 0, false], [0.42, 0, false]] as const)
              for (let i = -2; i <= 2; i++) {
                const p = alongX ? iso(x + i * 0.16, y + oy - 0.06) : iso(x + ox - 0.06, y + i * 0.16);
                const q = alongX ? iso(x + i * 0.16, y + oy + 0.06) : iso(x + ox + 0.06, y + i * 0.16);
                g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 2.5, color: PAL.roadLine, alpha: 0.7 });
              }
          } else if (hRoad) {
            const p = iso(x - 0.2, y), q = iso(x + 0.2, y);
            g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 2, color: PAL.roadLine, alpha: 0.8 });
          } else if (vRoad) {
            const p = iso(x, y - 0.2), q = iso(x, y + 0.2);
            g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 2, color: PAL.roadLine, alpha: 0.8 });
          }
        }
      }
    // plaza paving pattern
    for (let x = 6; x <= 10; x++)
      for (let y = 9; y <= 10; y++) {
        const c0 = iso(x, y);
        g.poly(pts({ x: c0.x, y: c0.y - 6 }, { x: c0.x + 12, y: c0.y }, { x: c0.x, y: c0.y + 6 }, { x: c0.x - 12, y: c0.y })).stroke({ width: 1, color: 0xc9b894, alpha: 0.45 });
      }
  }

  private drawTrees() {
    TREES.forEach((t, i) => {
      if (t.x === 3 && t.y === 10) return; // fountain lives here
      const g = new Graphics();
      const p = iso(t.x, t.y);
      g.ellipse(4, 2, 16, 7).fill({ color: 0x000000, alpha: 0.16 });
      g.rect(-2, -14, 4, 15).fill(PAL.trunk);
      const s = 0.9 + ((i * 37) % 5) / 12;
      const conifer = i % 4 === 1;
      if (conifer) {
        for (let k = 0; k < 3; k++) g.poly([-11 * s + k * 2.5, -10 - k * 9 * s, 11 * s - k * 2.5, -10 - k * 9 * s, 0, -24 * s - k * 9 * s]).fill(mix(0x3f7d4f, 0x5f9e5a, k / 3));
      } else {
        g.circle(0, -22 * s, 12 * s).fill(PAL.leaf[0]);
        g.circle(-6 * s, -18 * s, 8 * s).fill(PAL.leaf[1]);
        g.circle(6 * s, -17 * s, 7 * s).fill(mix(PAL.leaf[0], 0x000000, 0.12));
        g.circle(5 * s, -28 * s, 8 * s).fill(PAL.leaf[2]);
        g.circle(-3 * s, -29 * s, 4 * s).fill({ color: 0xffffff, alpha: 0.18 });
      }
      g.position.set(p.x, p.y);
      g.zIndex = t.x + t.y;
      this.tintables.push(g);
      this.objects.addChild(g);
    });
  }

  private addLight(x: number, y: number, h: number, tint: number, scale: [number, number], head = true): Light {
    const p = iso(x, y);
    const sprites: Sprite[] = [];
    const pool = new Sprite(this.glow);
    pool.anchor.set(0.5);
    pool.tint = tint;
    pool.scale.set(scale[0], scale[1]);
    pool.position.set(p.x, p.y);
    sprites.push(pool);
    if (head) {
      const hs = new Sprite(this.glow);
      hs.anchor.set(0.5);
      hs.tint = 0xffd590;
      hs.scale.set(0.2);
      hs.position.set(p.x, p.y - h);
      sprites.push(hs);
    }
    this.lights.addChild(...sprites);
    return { sprites, x, y, base: 0.55 };
  }

  private drawStreetlights() {
    for (const t of STREETLIGHTS) {
      const p = iso(t.x + 0.3, t.y + 0.3);
      const g = new Graphics();
      g.ellipse(0, 1, 4, 2).fill({ color: 0, alpha: 0.2 });
      g.rect(-1, -26, 2, 26).fill(0x4a5563);
      g.moveTo(0, -26).quadraticCurveTo(0, -31, 5, -30).stroke({ width: 2, color: 0x4a5563 });
      g.roundRect(2, -31, 7, 3.5, 1.5).fill(0x39424f);
      g.position.set(p.x, p.y);
      g.zIndex = t.x + t.y + 0.6;
      this.tintables.push(g);
      this.objects.addChild(g);
      const l = this.addLight(t.x + 0.3, t.y + 0.3, 0, 0xffb85c, [1.15, 0.58], false);
      const head = new Sprite(this.glow);
      head.anchor.set(0.5);
      head.tint = 0xffd590;
      head.scale.set(0.2);
      head.position.set(p.x + 5.5, p.y - 28);
      this.lights.addChild(head);
      l.sprites.push(head);
      this.streetLights.push(l);
    }
  }

  private drawDecor() {
    const piece = (x: number, y: number, draw: (g: Graphics) => void, z = 0.3) => {
      const g = new Graphics();
      const p = iso(x, y);
      draw(g);
      g.position.set(p.x, p.y);
      g.zIndex = x + y + z;
      this.tintables.push(g);
      this.objects.addChild(g);
      return g;
    };
    const bench = (g: Graphics) => {
      g.ellipse(0, 2, 10, 4).fill({ color: 0, alpha: 0.12 });
      g.poly([-9, -3, 3, 3, 3, 1, -9, -5]).fill(0xa0714f);
      g.poly([-9, -8, 3, -2, 3, -4, -9, -10]).fill(0xb98563);
      g.rect(-8, -3, 1.5, 4).fill(0x3b4250).rect(1, 1, 1.5, 4).fill(0x3b4250);
    };
    const planter = (g: Graphics) => {
      g.ellipse(0, 1, 7, 3).fill({ color: 0, alpha: 0.12 });
      g.poly([-6, -4, 0, -1, 6, -4, 6, 0, 0, 3, -6, 0]).fill(0xc58b62);
      g.circle(-2, -7, 4).fill(0x6fae63).circle(2, -8, 3.5).fill(0x84bf6d);
      g.circle(-1, -10, 1.3).fill(0xe5989b).circle(2.5, -9, 1.2).fill(0xf2cc8f);
    };
    const bin = (g: Graphics) => {
      g.ellipse(0, 1, 4, 2).fill({ color: 0, alpha: 0.15 });
      g.roundRect(-3, -9, 6, 9, 1.5).fill(0x4f7c6a);
      g.rect(-3.4, -10, 6.8, 2).fill(0x3c5f51);
    };
    for (const [x, y] of [[6.25, 9.25], [10.2, 10.1], [12.3, 4.2], [16.2, 12.2], [4.2, 18.2]]) piece(x, y, bench);
    for (const [x, y] of [[6.3, 10.3], [10.3, 9.2], [16.3, 6.3], [12.3, 18.3], [18.3, 10.3], [3.3, 12.3], [9.3, 4.3]]) piece(x, y, planter);
    for (const [x, y] of [[10.35, 18.35], [4.35, 6.35], [15.3, 12.35]]) piece(x, y, bin, 0.4);

    // Fountain on the little green west of the market.
    const fp = iso(3, 10);
    const f = new Graphics();
    f.ellipse(0, 4, 24, 11).fill({ color: 0, alpha: 0.14 });
    f.ellipse(0, 0, 22, 11).fill(0xd8d2c4);
    f.ellipse(0, -2, 22, 11).fill(0xe8e2d4);
    f.ellipse(0, -2, 17, 8.5).fill(0x6fb3c9);
    f.ellipse(-4, -4, 7, 2.5).fill({ color: 0xffffff, alpha: 0.35 });
    f.rect(-2.5, -16, 5, 14).fill(0xd8d2c4);
    f.ellipse(0, -16, 7, 3.5).fill(0xe8e2d4);
    f.position.set(fp.x, fp.y);
    f.zIndex = 13;
    this.tintables.push(f);
    this.objects.addChild(f);
    this.fountainSpray = new Graphics();
    this.fountainSpray.position.set(fp.x, fp.y);
    this.fountainSpray.zIndex = 13.01;
    this.objects.addChild(this.fountainSpray);

    // Market stalls on the plaza (knocked flat if inside the impact zone).
    const stallColors = [0xf17961, 0x2d8f91, 0xe0a83a, 0x8a6cc9];
    [[6.6, 9.6], [7.7, 10.5], [9.6, 9.6], [10.4, 10.7]].forEach(([x, y], i) => {
      const root = new Container();
      const g = new Graphics();
      const col = stallColors[i];
      g.ellipse(0, 2, 13, 6).fill({ color: 0, alpha: 0.14 });
      g.rect(-9, -16, 1.5, 16).fill(0x7a5a3c).rect(7.5, -16, 1.5, 16).fill(0x7a5a3c);
      g.poly([-12, -6, 0, 0, 12, -6, 0, -12]).fill(0xc9a77c);
      for (let k = 0; k < 5; k++) g.circle(-6 + k * 3, -6 + (k % 2), 1.6).fill([0xe07a5f, 0xf2cc8f, 0x81b29a, 0xe5989b, 0xf4d35e][k]);
      for (let k = 0; k < 4; k++) {
        const c0 = k % 2 === 0 ? col : 0xfdf6ea;
        g.poly([-13 + k * 6.5, -15 + k * 1.5, -6.5 + k * 6.5, -13.5 + k * 1.5, -6.5 + k * 6.5, -21 + k * 1.5, -13 + k * 6.5, -22.5 + k * 1.5]).fill(c0);
      }
      root.addChild(g);
      const debris = new Graphics();
      debris.poly([-12, -1, 0, 4, 12, -1, 0, -5]).fill(0x7a5a3c);
      debris.poly([-10, -2, -2, 2, 5, -3, -3, -6]).fill(col);
      debris.circle(6, 1, 2).fill(0x5a463a).circle(-7, 2, 1.5).fill(0x5a463a);
      debris.visible = false;
      root.addChild(debris);
      const p = iso(x, y);
      root.position.set(p.x, p.y);
      root.zIndex = x + y;
      this.tintables.push(g, debris);
      this.objects.addChild(root);
      this.stalls.push({ root, x, y, debris });
    });
  }

  private face(g: Graphics, a: P, b: P, h0: number, h1: number, color: number, alpha = 1) {
    g.poly(pts(up(a, h0), up(b, h0), up(b, h1), up(a, h1))).fill({ color, alpha });
  }

  private drawBuilding(b: Building) {
    const x0 = b.x - 0.5, x1 = b.x + b.w - 0.5, y0 = b.y - 0.5, y1 = b.y + b.h - 0.5;
    const A = iso(x0, y1), B = iso(x1, y1), C = iso(x1, y0), D = iso(x0, y0);
    const floorH = b.kind === 'office' ? 20 : 19;
    const H = b.floors * floorH + (b.kind === 'house' ? 8 : 10);
    const root = new Container();
    const body = new Graphics();
    const windows = new Graphics();
    root.addChild(body, windows);
    this.tintables.push(body);
    const idx = Number(b.id.split('-')[1] ?? 0);

    body.poly(pts(A, B, C, { x: C.x + 20, y: C.y + 10 }, { x: B.x + 20, y: B.y + 10 }, { x: A.x + 20, y: A.y + 10 })).fill({ color: 0x000000, alpha: 0.13 });
    // plinth
    this.face(body, A, B, -1, 3, mix(b.wall, 0x000000, 0.3));
    this.face(body, B, C, -1, 3, mix(b.wall, 0x000000, 0.38));
    const left = mix(b.wall, 0xffffff, 0.05);
    const right = mix(b.wall, 0x000000, 0.16);
    this.face(body, A, B, 3, H, left);
    this.face(body, B, C, 3, H, right);
    // corner highlight + floor trim
    body.moveTo(B.x, B.y - 3).lineTo(B.x, B.y - H).stroke({ width: 1.2, color: 0xffffff, alpha: 0.35 });
    for (let f = 1; f < b.floors; f++) {
      const h = 4 + f * floorH;
      this.face(body, A, B, h - 1, h + 1, mix(b.wall, 0x000000, 0.1));
      this.face(body, B, C, h - 1, h + 1, mix(b.wall, 0x000000, 0.22));
    }
    // cornice
    this.face(body, A, B, H - 3, H, mix(b.wall, 0xffffff, 0.25));
    this.face(body, B, C, H - 3, H, mix(b.wall, 0x000000, 0.05));

    const office = b.kind === 'office';
    const winGrid = (fa: P, fb: P, cols: number, faceDark: boolean) => {
      for (let f = 0; f < b.floors; f++) {
        const yb = 9 + f * floorH, yt = yb + floorH * (office ? 0.62 : 0.5);
        for (let i = 0; i < cols; i++) {
          const u0 = (i + (office ? 0.12 : 0.28)) / cols, u1 = (i + (office ? 0.88 : 0.72)) / cols;
          const p0 = lerp(fa, fb, u0), p1 = lerp(fa, fb, u1);
          const pane = pts(up(p0, yb), up(p1, yb), up(p1, yt), up(p0, yt));
          body.poly(pane).fill(faceDark ? mix(PAL.windowDay, 0x000000, 0.15) : PAL.windowDay);
          if (!office) {
            // frames and sills
            body.poly(pane).stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
            body.moveTo(up(p0, yb - 1).x - 1, up(p0, yb - 1).y).lineTo(up(p1, yb - 1).x + 1, up(p1, yb - 1).y).stroke({ width: 1.5, color: mix(b.wall, 0x000000, 0.3) });
          } else {
            body.moveTo(up(p0, yt).x, up(p0, yt).y).lineTo(up(p1, yb).x, up(p1, yb).y).stroke({ width: 1, color: 0xffffff, alpha: 0.25 });
          }
          // lit windows: deterministic pattern so not every window is on
          if ((i * 7 + f * 3 + idx) % 5 !== 0 || b.kind === 'clinic') windows.poly(pane).fill(PAL.window);
          // flower boxes on houses
          if (b.kind === 'house' && f === b.floors - 1 && i % 2 === 0) {
            const q0 = up(p0, yb - 2), q1 = up(p1, yb - 2);
            body.poly(pts(q0, q1, { x: q1.x, y: q1.y + 2.5 }, { x: q0.x, y: q0.y + 2.5 })).fill(0xa0714f);
            body.circle((q0.x + q1.x) / 2 - 2, (q0.y + q1.y) / 2 - 1, 1.4).fill(0xe5989b).circle((q0.x + q1.x) / 2 + 2, (q0.y + q1.y) / 2 - 1.5, 1.3).fill(0xf2cc8f);
          }
        }
      }
    };
    winGrid(A, B, b.w * 2, false);
    winGrid(B, C, b.h * 2, true);

    // door with step + awning
    const du = (b.door.x - x0) / b.w;
    const d0 = lerp(A, B, du - 0.09), d1 = lerp(A, B, du + 0.09);
    body.poly(pts(d0, d1, up(d1, 14), up(d0, 14))).fill(mix(b.roof, 0x000000, 0.4));
    body.poly(pts(up(d0, 14), up(d1, 14), { x: d1.x - 5, y: d1.y - 11 }, { x: d0.x - 5, y: d0.y - 11 })).fill(mix(b.roof, 0xffffff, 0.1));
    body.poly(pts({ x: d0.x - 2, y: d0.y + 1 }, { x: d1.x + 2, y: d1.y + 1 }, { x: d1.x - 2, y: d1.y + 4 }, { x: d0.x - 6, y: d0.y + 4 })).fill(0xcfc8b8);

    // roofs
    const rA = up(A, H), rB = up(B, H), rC = up(C, H), rD = up(D, H);
    const center = iso((x0 + x1) / 2, (y0 + y1) / 2);
    if (b.kind === 'house') {
      if (idx % 2 === 0) {
        // gable roof, ridge along x
        const ym = (y0 + y1) / 2;
        const r0 = up(iso(x0 - 0.08, ym), H + 22), r1 = up(iso(x1 + 0.08, ym), H + 22);
        const eA = up(iso(x0 - 0.08, y1 + 0.1), H - 2), eB = up(iso(x1 + 0.08, y1 + 0.1), H - 2), eC = up(iso(x1 + 0.08, y0 - 0.1), H - 2), eD = up(iso(x0 - 0.08, y0 - 0.1), H - 2);
        body.poly(pts(eD, eC, r1, r0)).fill(mix(b.roof, 0x000000, 0.18));
        body.poly(pts(rB, rC, r1)).fill(mix(b.wall, 0x000000, 0.12)); // gable end
        body.poly(pts(eA, eB, r1, r0)).fill(mix(b.roof, 0xffffff, 0.08));
        for (let k = 1; k < 5; k++) {
          const p = lerp(eA, r0, k / 5), q = lerp(eB, r1, k / 5);
          body.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 1, color: 0x000000, alpha: 0.1 });
        }
        body.moveTo(r0.x, r0.y).lineTo(r1.x, r1.y).stroke({ width: 2, color: mix(b.roof, 0x000000, 0.3) });
        const gw = up(lerp(rB, rC, 0.5), 9);
        body.circle(gw.x, gw.y, 3).fill(PAL.windowDay);
        windows.circle(gw.x, gw.y, 3).fill(PAL.window);
      } else {
        const apex = up(center, H + 22);
        const ov = (p: P, dx: number, dy: number) => ({ x: p.x + dx, y: p.y + dy });
        body.poly(pts(ov(rD, 0, -2), ov(rA, -4, 1), apex)).fill(mix(b.roof, 0x000000, 0.1));
        body.poly(pts(ov(rC, 4, 1), ov(rD, 0, -2), apex)).fill(mix(b.roof, 0x000000, 0.22));
        body.poly(pts(ov(rA, -4, 1), ov(rB, 0, 3), apex)).fill(mix(b.roof, 0xffffff, 0.12));
        body.poly(pts(ov(rB, 0, 3), ov(rC, 4, 1), apex)).fill(mix(b.roof, 0x000000, 0.16));
        for (let k = 1; k < 5; k++) {
          const p = lerp(ov(rA, -4, 1), apex, k / 5), q = lerp(ov(rB, 0, 3), apex, k / 5);
          body.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 1, color: 0x000000, alpha: 0.09 });
        }
      }
      const ch = up(lerp(rB, rC, 0.7), 6);
      body.rect(ch.x - 3, ch.y - 12, 6, 12).fill(0x9a6b55).rect(ch.x - 3.6, ch.y - 13, 7.2, 2).fill(0x7c5442);
      // little picket fence along the front garden
      const f0 = iso(x0 + 0.05, y1 + 0.42), f1 = iso(x1 - 0.05, y1 + 0.42);
      for (let k = 0; k <= 10; k++) {
        if (Math.abs(k / 10 - du) < 0.12) continue;
        const p = lerp(f0, f1, k / 10);
        body.rect(p.x - 0.6, p.y - 6, 1.2, 6).fill(0xfdf6ea);
      }
      body.moveTo(f0.x, f0.y - 4).lineTo(lerp(f0, f1, du - 0.12).x, lerp(f0, f1, du - 0.12).y - 4).stroke({ width: 1, color: 0xfdf6ea });
      body.moveTo(lerp(f0, f1, du + 0.12).x, lerp(f0, f1, du + 0.12).y - 4).lineTo(f1.x, f1.y - 4).stroke({ width: 1, color: 0xfdf6ea });
    } else {
      body.poly(pts(rA, rB, rC, rD)).fill(b.roof);
      const rc = up(center, H);
      const inset = (p: P) => ({ x: p.x + (rc.x - p.x) * 0.12, y: p.y + (rc.y - p.y) * 0.12 });
      body.poly(pts(inset(rA), inset(rB), inset(rC), inset(rD))).fill(mix(b.roof, 0x000000, 0.12));
      if (b.kind !== 'clinic' && b.kind !== 'shelter') {
        // rooftop units
        const u = lerp(inset(rD), inset(rB), 0.3);
        body.poly(pts(up(u, 0), { x: u.x + 8, y: u.y + 4 }, { x: u.x + 8, y: u.y - 4 }, { x: u.x, y: u.y - 8 })).fill(0x9aa6b2);
        body.poly(pts({ x: u.x - 8, y: u.y + 4 }, u, { x: u.x, y: u.y - 8 }, { x: u.x - 8, y: u.y - 4 })).fill(0xb7c1ca);
        body.poly(pts({ x: u.x, y: u.y - 8 }, { x: u.x + 8, y: u.y - 4 }, { x: u.x, y: u.y }, { x: u.x - 8, y: u.y - 4 })).fill(0xd0d8de);
      }
    }
    const roofCenter = up(center, H);

    if (b.kind === 'market' || b.kind === 'shop') {
      const stripes = b.kind === 'market' ? 8 : 6;
      for (let i = 0; i < stripes; i++) {
        const p0 = lerp(A, B, i / stripes), p1 = lerp(A, B, (i + 1) / stripes);
        const c = i % 2 === 0 ? (b.kind === 'market' ? PAL.coral : 0xe6b54a) : 0xfdf6ea;
        body.poly(pts(up(p0, H - 4), up(p1, H - 4), { x: p1.x - 7, y: p1.y - H + 15 }, { x: p0.x - 7, y: p0.y - H + 15 })).fill(c);
        body.moveTo(p0.x - 7, p0.y - H + 15).quadraticCurveTo((p0.x + p1.x) / 2 - 7, (p0.y + p1.y) / 2 - H + 18, p1.x - 7, p1.y - H + 15).stroke({ width: 1.5, color: c });
      }
      // sign board
      const s0 = up(lerp(B, C, 0.25), H - 6), s1 = up(lerp(B, C, 0.75), H - 6);
      body.poly(pts(s0, s1, up(s1, 9), up(s0, 9))).fill(b.kind === 'market' ? 0x2d8f91 : 0xd84d56);
    }
    if (b.kind === 'clinic') {
      body.rect(roofCenter.x - 3, roofCenter.y - 10, 6, 20).fill(0xd84d56);
      body.rect(roofCenter.x - 10, roofCenter.y - 3, 20, 6).fill(0xd84d56);
      this.face(body, A, B, H - 7, H - 3, PAL.teal);
      this.face(body, B, C, H - 7, H - 3, mix(PAL.teal, 0x000000, 0.2));
      const e0 = lerp(A, B, du - 0.18), e1 = lerp(A, B, du + 0.18);
      body.poly(pts(up(e0, 18), up(e1, 18), { x: e1.x - 12, y: e1.y - 12 }, { x: e0.x - 12, y: e0.y - 12 })).fill(0xffffff);
      body.rect(e0.x - 11, e0.y - 13, 1.2, 13).fill(0xbfc8c6);
    }
    if (b.kind === 'shelter') {
      const r = roofCenter;
      body.poly([r.x - 9, r.y - 8, r.x + 9, r.y - 8, r.x + 9, r.y + 1, r.x, r.y + 9, r.x - 9, r.y + 1]).fill(0xfdf6ea);
      body.poly([r.x - 5, r.y - 5, r.x + 5, r.y - 5, r.x + 5, r.y, r.x, r.y + 5, r.x - 5, r.y]).fill(PAL.teal);
    }
    if (b.kind === 'firestation') {
      for (const u of [0.3, 0.7]) {
        const p0 = lerp(A, B, u - 0.15), p1 = lerp(A, B, u + 0.15);
        body.poly(pts(p0, p1, up(p1, 22), up(p0, 22))).fill(0x7a2c33);
        for (let k = 4; k < 22; k += 3.5) body.moveTo(up(p0, k).x, up(p0, k).y).lineTo(up(p1, k).x, up(p1, k).y).stroke({ width: 1, color: 0x000000, alpha: 0.25 });
      }
      this.face(body, A, B, H - 6, H - 2, 0xf3d34a);
      const bell = up(lerp(rB, rC, 0.5), 2);
      body.rect(bell.x - 4, bell.y - 14, 8, 14).fill(0xc8454f).poly([bell.x - 6, bell.y - 14, bell.x + 6, bell.y - 14, bell.x, bell.y - 20]).fill(0x8f2f37);
    }
    if (b.kind === 'office') {
      body.circle(roofCenter.x + 2, roofCenter.y - 22, 2.5).fill(0xd84d56);
      body.rect(roofCenter.x + 1.5, roofCenter.y - 20, 1, 14).fill(0x55606b);
      for (let k = 1; k < b.w * 2; k++) {
        const p = lerp(A, B, k / (b.w * 2));
        body.moveTo(p.x, p.y - 4).lineTo(p.x, p.y - H + 3).stroke({ width: 1, color: 0xffffff, alpha: 0.25 });
      }
    }
    if (b.kind === 'substation') {
      const r = roofCenter;
      body.poly([r.x + 2, r.y - 14, r.x - 6, r.y, r.x, r.y, r.x - 3, r.y + 10, r.x + 7, r.y - 4, r.x + 1, r.y - 4]).fill(0xf3d34a);
      for (const u of [0.25, 0.75]) {
        const p = up(lerp(rA, rC, u), 0);
        body.rect(p.x - 1, p.y - 18, 2, 18).fill(0x55606b);
        body.moveTo(p.x - 6, p.y - 16).lineTo(p.x + 6, p.y - 16).stroke({ width: 1.5, color: 0x55606b });
      }
    }

    // window light spill on the ground at night
    const spill: Sprite[] = [];
    if (b.kind !== 'substation') {
      for (const u of b.w >= 3 ? [0.25, 0.75] : [0.5]) {
        const p = lerp(A, B, u);
        const s = new Sprite(this.glow);
        s.anchor.set(0.5);
        s.tint = 0xffc070;
        s.scale.set(0.9, 0.38);
        s.position.set(p.x - 8, p.y + 6);
        this.lights.addChild(s);
        spill.push(s);
      }
    }

    let glow: Sprite | null = null;
    if (b.kind === 'clinic' || b.kind === 'shop') {
      glow = new Sprite(this.glow);
      glow.anchor.set(0.5);
      glow.tint = b.kind === 'clinic' ? 0xff6b5e : 0xffb35c;
      glow.position.set(b.kind === 'clinic' ? roofCenter.x : lerp(A, B, 0.5).x, b.kind === 'clinic' ? roofCenter.y - 6 : lerp(A, B, 0.5).y - 18);
      glow.scale.set(b.kind === 'clinic' ? 1.4 : 1);
      glow.alpha = 0;
      this.lights.addChild(glow);
      if (b.kind === 'clinic') this.beacon = glow; else this.lantern = glow;
    }

    let badge: Text | null = null;
    if (b.kind === 'shelter' || b.kind === 'clinic') {
      badge = new Text({ text: '', style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x14263e, width: 3 } } });
      badge.anchor.set(0.5);
      badge.position.set(roofCenter.x, roofCenter.y - 38);
      root.addChild(badge);
    }

    root.zIndex = (x0 + x1) / 2 + (y0 + y1) / 2 + 0.5;
    this.objects.addChild(root);
    this.buildings.push({ b, root, body, windows, spill, glow, badge, depth: root.zIndex, x0, x1, y0, y1 });
  }

  private setupFx() {
    this.meteorHead = new Sprite(this.glow);
    this.meteorHead.anchor.set(0.5);
    this.meteorHead.tint = 0xffd29a;
    this.meteorHead.visible = false;
    this.fx.addChild(this.meteorTrail, this.meteorHead, this.shock);
    const sprite = (tint: number, layer: Container) => {
      const s = new Sprite(this.glow);
      s.anchor.set(0.5);
      s.tint = tint;
      s.visible = false;
      layer.addChild(s);
      return s;
    };
    for (let i = 0; i < 70; i++) this.dust.push({ s: sprite(0xcdb79a, this.fx), vx: 0, vy: 0, life: 0 });
    for (let i = 0; i < 14; i++) this.embers.push({ s: sprite(0xff8a4c, this.lights), phase: i * 0.7 });
    for (let i = 0; i < 26; i++) this.sparks.push({ s: sprite(0x9fd8ff, this.lights), vx: 0, vy: 0, life: 0 });
  }

  // ---------------------------------------------------------------- citizens

  private makeCitizen(c: Citizen): CitizenView {
    const root = new Container();
    const shadow = new Graphics().ellipse(0, 0, 6, 3).fill({ color: 0x000000, alpha: 0.22 });
    const ring = new Graphics();
    const pulse = new Graphics();
    const body = new Container();
    const g = new Graphics();
    const shirt = c.role === 'healthcare' ? 0xf4f7f6 : c.role === 'responder' ? PAL.responder : SHIRTS[c.look.shirt];
    const pants = c.role === 'healthcare' ? 0x6fb3c9 : c.role === 'responder' ? 0x2f3a45 : [0x3b4250, 0x5a4636, 0x2f4a6b][c.look.hair % 3];
    g.roundRect(-3.2, -6, 2.6, 6, 1).fill(pants);
    g.roundRect(0.6, -6, 2.6, 6, 1).fill(pants);
    g.roundRect(-3.4, -0.8, 3, 1.6, 0.8).fill(0x2a2a2a).roundRect(0.4, -0.8, 3, 1.6, 0.8).fill(0x2a2a2a);
    g.roundRect(-4.5, -15, 9, 10, 3).fill(shirt);
    g.roundRect(-5.8, -14, 2, 7, 1).fill(mix(shirt, 0x000000, 0.12)).roundRect(3.8, -14, 2, 7, 1).fill(mix(shirt, 0x000000, 0.12));
    if (c.role === 'responder') g.rect(-4.5, -10.5, 9, 2).fill(0xf3d34a);
    if (c.role === 'healthcare') { g.rect(-0.8, -13.5, 1.6, 5).fill(PAL.teal); g.rect(-2.5, -11.8, 5, 1.6).fill(PAL.teal); }
    if (c.role === 'service') g.roundRect(-3.5, -11, 7, 6, 1.5).fill(0xfdf6ea);
    if (c.role === 'resident' && c.workId === 'office') g.roundRect(3.5, -9, 4, 3.5, 0.8).fill(0x6b4a33);
    if (c.age >= 65) g.rect(5.5, -10, 1, 10).fill(0x8a6a4b);
    g.circle(0, -19, 4.2).fill(SKINS[c.look.skin]);
    if (c.role === 'responder') g.ellipse(0, -22, 5, 2.6).fill(0xf3d34a).rect(-5.2, -22, 10.4, 1.4).fill(0xd9b32f);
    else g.ellipse(0, -21.2, 4.4, 2.6).fill(HAIRS[c.look.hair]);
    g.circle(1.6, -19.3, 0.6).fill(0x1b1b1b);
    body.addChild(g);
    this.people.push(g);
    const alert = new Graphics();
    alert.circle(0, -34, 6.5).fill(PAL.coral).circle(0, -34, 6.5).stroke({ width: 1.5, color: 0xffffff });
    alert.rect(-0.9, -37.5, 1.8, 4.2).fill(0xffffff).circle(0, -31.4, 1).fill(0xffffff);
    alert.visible = false;
    const bubble = new Container();
    const bubbleBg = new Graphics();
    bubbleBg.roundRect(-9, -9, 18, 18, 9).fill(0xffffff).roundRect(-9, -9, 18, 18, 9).stroke({ width: 1, color: 0x14263e, alpha: 0.15 });
    bubbleBg.poly([-3, 8, 3, 8, 0, 12]).fill(0xffffff);
    const bubbleIcon = new Graphics();
    bubble.addChild(bubbleBg, bubbleIcon);
    bubble.position.set(0, -38);
    bubble.visible = false;
    const label = new Text({ text: c.name.split(' ')[0], style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, fontWeight: '700', fill: 0x1b303d, stroke: { color: 0xffffff, width: 3 } } });
    label.anchor.set(0.5, 1);
    label.position.set(0, -27);
    label.visible = false;
    root.addChild(pulse, shadow, ring, body, alert, bubble, label);
    this.objects.addChild(root);
    const marker = new Graphics();
    this.markers.addChild(marker);
    return { root, body, ring, alert, pulse, bubble, bubbleIcon, marker, markerT: 0, markerAt: null, pulseT: 0, bubbleT: 0, lastDecisionId: null, label, action: null };
  }

  private citizenDepth(c: Citizen) {
    let z = c.pos.x + c.pos.y;
    for (const v of this.buildings) {
      const inY = c.pos.y >= v.y0 - 0.6 && c.pos.y <= v.y1 + 0.6;
      const inX = c.pos.x >= v.x0 - 0.6 && c.pos.x <= v.x1 + 0.6;
      if ((c.pos.x >= v.x1 && inY) || (c.pos.y >= v.y1 && inX)) z = Math.max(z, v.depth + 0.01);
      else if ((c.pos.x <= v.x0 && inY) || (c.pos.y <= v.y0 && inX)) z = Math.min(z, v.depth - 0.01);
    }
    return z;
  }

  // ---------------------------------------------------------------- camera

  private mapCenter() {
    return { x: (iso(-0.5, MAP_H - 0.5).x + iso(MAP_W - 0.5, -0.5).x) / 2, y: (iso(-0.5, -0.5).y - 60 + iso(MAP_W - 0.5, MAP_H - 0.5).y + 50) / 2 };
  }

  private fit() {
    const w = this.app.screen.width, h = this.app.screen.height;
    const left = iso(-0.5, MAP_H - 0.5).x, right = iso(MAP_W - 0.5, -0.5).x;
    const top = iso(-0.5, -0.5).y - 60, bottom = iso(MAP_W - 0.5, MAP_H - 0.5).y + 50;
    this.fitScale = Math.min(w / (right - left + 40), h / (bottom - top + 20));
    this.applyCamera();
  }

  private applyCamera() {
    const w = this.app.screen.width, h = this.app.screen.height;
    const s = this.fitScale * this.zoom;
    const c = this.mapCenter();
    this.world.scale.set(s);
    this.world.position.set(w / 2 - c.x * s + this.pan.x, h / 2 - c.y * s + this.pan.y);
  }

  /** Pan offset that centers world tile (x,y) at the given zoom. */
  private panFor(x: number, y: number, zoom: number): P {
    const p = iso(x, y), c = this.mapCenter(), s = this.fitScale * zoom;
    return { x: -(p.x - c.x) * s, y: -(p.y - c.y) * s };
  }

  private moveCamera(zoom: number, pan: P, dur: number) {
    if (this.reducedMotion) dur = 0;
    this.cam = { from: { zoom: this.zoom, pan: { ...this.pan } }, to: { zoom, pan }, t0: performance.now(), dur: Math.max(1, dur) };
  }

  private focusTile(x: number, y: number, zoom: number, dur: number) {
    if (this.userMovedCamera) return;
    this.moveCamera(zoom, this.panFor(x, y, zoom), dur);
  }

  private stepCamera() {
    if (!this.cam) return;
    const k = ease((performance.now() - this.cam.t0) / this.cam.dur);
    this.zoom = this.cam.from.zoom + (this.cam.to.zoom - this.cam.from.zoom) * k;
    this.pan = { x: this.cam.from.pan.x + (this.cam.to.pan.x - this.cam.from.pan.x) * k, y: this.cam.from.pan.y + (this.cam.to.pan.y - this.cam.from.pan.y) * k };
    if (k >= 1) this.cam = null;
  }

  private setupInput(ctrl: Controller) {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    let drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
    stage.on('pointerdown', (e) => { drag = { x: e.global.x, y: e.global.y, px: this.pan.x, py: this.pan.y, moved: false }; });
    stage.on('pointermove', (e) => {
      if (!drag) return;
      const dx = e.global.x - drag.x, dy = e.global.y - drag.y;
      if (Math.hypot(dx, dy) > 4) { drag.moved = true; this.userMovedCamera = true; this.cam = null; }
      if (drag.moved) this.pan = { x: drag.px + dx, y: drag.py + dy };
    });
    stage.on('pointerup', (e) => {
      if (drag && !drag.moved) {
        const local = this.world.toLocal(e.global);
        let best: string | null = null, bestD = 18;
        for (const c of ctrl.sim.citizens) {
          if (c.inside) continue;
          const p = iso(c.pos.x, c.pos.y);
          const d = Math.hypot(local.x - p.x, local.y - (p.y - 11));
          if (d < bestD) { bestD = d; best = c.id; }
        }
        this.onSelect(best);
      }
      drag = null;
    });
    stage.on('pointerupoutside', () => (drag = null));
    this.app.canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      this.userMovedCamera = true;
      this.cam = null;
      const old = this.zoom;
      this.zoom = Math.max(0.7, Math.min(2.8, this.zoom * (ev.deltaY < 0 ? 1.1 : 0.9)));
      const rect = this.app.canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left - this.app.screen.width / 2, my = ev.clientY - rect.top - this.app.screen.height / 2;
      const k = this.zoom / old;
      this.pan = { x: mx - (mx - this.pan.x) * k, y: my - (my - this.pan.y) * k };
    }, { passive: false });
  }

  resetCamera() {
    this.userMovedCamera = false;
    this.moveCamera(1, { x: 0, y: 0 }, 700);
  }

  // ---------------------------------------------------------------- lighting helpers

  /** 0..1 grid power at a world point: the outage spreads outward from the substation, then returns. */
  private power(sim: Simulation, x: number, y: number) {
    if (sim.scenario !== 'blackout') return 1;
    const d = Math.hypot(x - SUBSTATION.x, y - SUBSTATION.y);
    const t = sim.tick;
    if (t < BLACKOUT_TICK) return 1;
    if (t < POWER_RESTORED_TICK) {
      const front = (t - BLACKOUT_TICK) * 0.28;
      if (front >= d + 1.2) return 0;
      if (front >= d - 0.4) return Math.sin(performance.now() / 30 + d * 7) > 0 ? 1 : 0.15; // flicker as the wave hits
      return 1;
    }
    const front = (t - POWER_RESTORED_TICK) * 0.35;
    return front >= d ? 1 : 0;
  }

  // ---------------------------------------------------------------- per frame

  private frame(ctrl: Controller) {
    const sim = ctrl.sim;
    const now = performance.now();
    const dt = Math.min(3, (now - this.lastFrame) / 16.67);
    this.lastFrame = now;
    const t = now / 1000;
    if (sim !== this.lastSim) this.onNewSim(sim);
    this.cueCamera(ctrl);
    this.stepCamera();
    this.applyCamera();

    const targetNight = ctrl.night ? 1 : 0;
    this.night += (targetNight - this.night) * 0.05;
    this.blackoutF += ((sim.blackout ? 1 : 0) - this.blackoutF) * 0.04;
    const dark = Math.max(this.night, this.blackoutF * 0.55);
    const tint = mix(DAY_TINT, mix(NIGHT_TINT, BLACKOUT_TINT, this.blackoutF), dark);
    for (const g of this.tintables) g.tint = tint;
    const peopleTint = mix(tint, 0xffffff, 0.5);
    for (const g of this.people) g.tint = peopleTint;

    for (const l of this.streetLights) {
      const pw = this.power(sim, l.x, l.y);
      for (const s of l.sprites) s.alpha = this.night * pw * l.base;
    }
    for (const v of this.buildings) {
      const pw = v.b.kind === 'clinic' ? 1 : v.b.kind === 'shop' ? Math.max(this.power(sim, v.b.x, v.b.y), 0.65 * (0.85 + Math.sin(t * 9) * 0.1 + Math.sin(t * 23) * 0.05)) : this.power(sim, v.b.x + v.b.w / 2, v.b.y + v.b.h / 2);
      v.windows.alpha = dark * pw * 0.95;
      for (const s of v.spill) s.alpha = dark * pw * 0.32;
      if (v.badge) {
        const n = sim.occupancy(v.b.id);
        v.badge.text = n ? `${n} inside` : '';
      }
    }
    if (this.beacon) this.beacon.alpha = this.blackoutF * (0.6 + Math.sin(t * 4) * 0.3) + this.night * 0.12;
    if (this.lantern) this.lantern.alpha = this.blackoutF * this.night * (0.55 + Math.sin(t * 11) * 0.08);

    // fountain spray (stops when the power is out — the pump is electric)
    const fs = this.fountainSpray;
    fs.clear();
    const pump = this.power(sim, 3, 10);
    if (pump > 0.5) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 0.6;
        const r = 9 + Math.sin(t * 3 + i) * 1.5;
        fs.moveTo(0, -17).quadraticCurveTo(Math.cos(a) * r * 0.6, -26, Math.cos(a) * r, -4 + Math.sin(a) * r * 0.45).stroke({ width: 1.2, color: 0xbfe3f0, alpha: 0.75 });
      }
    }

    const speed = ctrl.paused ? 0 : ctrl.speed * (sim.stalled ? 0 : 1);
    this.traffic.update(dt * speed, sim.walkable, this.night, sim.scenario === 'blackout' ? this.power(sim, 11, 11) : 1);

    this.updateSparks(sim, dt);
    this.drawHazard(ctrl, t);
    this.drawCitizens(ctrl, t, dt);
    this.drawPath(ctrl);
  }

  private cueCamera(ctrl: Controller) {
    const sim = ctrl.sim;
    const once = (key: string, fn: () => void) => {
      if (this.cue.has(key)) return;
      this.cue.add(key);
      if (!ctrl.selectedId) fn();
    };
    if (sim.scenario === 'meteor') {
      if (sim.tick >= METEOR_WARN_TICK) once('warn', () => this.focusTile(METEOR_CENTER.x, METEOR_CENTER.y, 1.35, 2600));
      if (sim.tick >= METEOR_IMPACT_TICK + 60) once('settle', () => this.focusTile(10.5, 10.5, 1, 2400));
    }
    if (sim.scenario === 'blackout') {
      if (sim.tick >= BLACKOUT_TICK - 12) once('outage', () => this.focusTile(SUBSTATION.x, SUBSTATION.y - 2, 1.3, 1500));
      if (sim.tick >= BLACKOUT_TICK + 55) once('wide', () => this.focusTile(10.5, 10.5, 1, 3000));
    }
  }

  private onNewSim(sim: Simulation) {
    const first = this.lastSim === null;
    this.lastSim = sim;
    for (const v of this.citizens.values()) {
      this.objects.removeChild(v.root);
      this.markers.removeChild(v.marker);
      this.people = this.people.filter((g) => !v.body.children.includes(g));
      v.root.destroy({ children: true });
      v.marker.destroy();
    }
    this.citizens.clear();
    this.crater.clear();
    this.hazardLayer.clear();
    this.shock.clear();
    this.meteorTrail.clear();
    this.meteorHead.visible = false;
    this.flash.clear();
    for (const s of this.stalls) { s.root.children[0].visible = true; s.debris.visible = false; }
    for (const d of this.dust) { d.s.visible = false; d.life = 0; }
    for (const e of this.embers) e.s.visible = false;
    for (const s of this.sparks) { s.s.visible = false; s.life = 0; }
    this.cue.clear();
    this.userMovedCamera = false;
    if (first) {
      // Opening shot: start close on the market square, then pull back to the whole district.
      this.zoom = 1.6;
      this.pan = this.panFor(8.5, 9.5, 1.6);
      this.applyCamera();
      setTimeout(() => this.moveCamera(1, { x: 0, y: 0 }, 3200), 500);
    }
  }

  private updateSparks(sim: Simulation, dt: number) {
    const sp = iso(SUBSTATION.x, SUBSTATION.y);
    const burst = sim.scenario === 'blackout' && sim.tick >= BLACKOUT_TICK - 2 && sim.tick < BLACKOUT_TICK + 25;
    for (const s of this.sparks) {
      if (s.life <= 0 && burst) {
        s.life = 0.4 + Math.random() * 0.6;
        s.s.position.set(sp.x + (Math.random() - 0.5) * 20, sp.y - 30);
        s.vx = (Math.random() - 0.5) * 4;
        s.vy = -1.5 - Math.random() * 2.5;
        s.s.scale.set(0.05 + Math.random() * 0.06);
      }
      if (s.life > 0) {
        s.life -= 0.016 * dt;
        s.vy += 0.15 * dt;
        s.s.x += s.vx * dt;
        s.s.y += s.vy * dt;
        s.s.visible = true;
        s.s.alpha = Math.min(1, s.life * 2);
      } else s.s.visible = false;
    }
  }

  private drawHazard(ctrl: Controller, t: number) {
    const sim = ctrl.sim;
    const target = iso(METEOR_CENTER.x, METEOR_CENTER.y);
    if (sim.meteorIncoming) {
      const k = Math.min(1, (sim.tick - METEOR_WARN_TICK) / (METEOR_IMPACT_TICK - METEOR_WARN_TICK));
      const start = { x: target.x + 900, y: target.y - 900 };
      const head = { x: start.x + (target.x - start.x) * k * k, y: start.y + (target.y - start.y) * k * k };
      this.meteorHead.visible = true;
      this.meteorHead.position.set(head.x, head.y);
      this.meteorHead.scale.set(0.5 + k * 0.7);
      this.meteorTrail.clear();
      for (let i = 0; i < 6; i++) {
        const f = 1 + i * 0.12;
        this.meteorTrail.moveTo(head.x, head.y).lineTo(head.x + (start.x - head.x) * 0.2 * f, head.y + (start.y - head.y) * 0.2 * f).stroke({ width: 8 - i, color: i < 2 ? 0xfff1d6 : 0xffa86b, alpha: 0.5 - i * 0.07 });
      }
      // growing target shadow — anticipation
      this.hazardLayer.clear();
      this.hazardLayer.ellipse(target.x, target.y, 20 + k * 60, (20 + k * 60) / 2).fill({ color: 0x000000, alpha: 0.08 + k * 0.12 });
    } else {
      this.meteorHead.visible = false;
      this.meteorTrail.clear();
    }
    const hz = sim.hazard;
    this.flash.clear();
    if (!hz) return;
    const since = (sim.tick - hz.impactTick) * 0.1;
    if (since < 1.2) {
      const a = Math.max(0, 0.85 - since * 0.75);
      this.flash.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ color: 0xfff3e0, alpha: a });
      if (!this.reducedMotion && since < 0.5) this.world.position.x += Math.sin(t * 90) * 4 * (0.5 - since);
    }
    this.shock.clear();
    if (since < 2.5) {
      const r = since * 260;
      this.shock.ellipse(target.x, target.y, r, r / 2).stroke({ width: 6 * (1 - since / 2.5) + 1, color: 0xffe2b8, alpha: 0.7 * (1 - since / 2.5) });
    }
    if (this.crater.width === 0) {
      const hzG = this.hazardLayer;
      hzG.clear();
      for (let y = 0; y < MAP_H; y++)
        for (let x = 0; x < MAP_W; x++) {
          if (Math.hypot(x - hz.center.x, y - hz.center.y) > hz.radius) continue;
          const c = [iso(x - 0.5, y - 0.5), iso(x + 0.5, y - 0.5), iso(x + 0.5, y + 0.5), iso(x - 0.5, y + 0.5)];
          hzG.poly(pts(...c)).fill({ color: 0x6b5446, alpha: 0.45 });
          hzG.poly(pts(...c)).fill({ color: PAL.coral, alpha: 0.18 });
        }
      const R = hz.radius + 0.5;
      for (let i = 0; i < 28; i++) {
        if (i % 2) continue;
        const a0 = (i / 28) * Math.PI * 2, a1 = ((i + 1) / 28) * Math.PI * 2;
        hzG.moveTo(target.x + Math.cos(a0) * R * 45, target.y + Math.sin(a0) * R * 22.5).lineTo(target.x + Math.cos(a1) * R * 45, target.y + Math.sin(a1) * R * 22.5).stroke({ width: 3, color: PAL.coral, alpha: 0.9 });
      }
      // cones on the closure edge
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.2;
        const cx = target.x + Math.cos(a) * (R + 0.15) * 45, cy = target.y + Math.sin(a) * (R + 0.15) * 22.5;
        hzG.poly([cx - 3, cy, cx + 3, cy, cx, cy - 8]).fill(0xf17961).rect(cx - 2, cy - 4, 4, 1.4).fill(0xffffff);
      }
      this.crater.ellipse(target.x, target.y, 48, 24).fill(0x5a463a);
      this.crater.ellipse(target.x, target.y + 2, 38, 18).fill(0x3d2f27);
      this.crater.ellipse(target.x + 4, target.y + 3, 18, 8).fill(0x2a1f1a);
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        this.crater.ellipse(target.x + Math.cos(a) * 54, target.y + Math.sin(a) * 27, 7 + (i % 3) * 2, 4).fill(0x6f5a49);
      }
      this.crater.ellipse(target.x + 4, target.y + 2, 10, 5).fill(0xff7a3c);
      this.crater.ellipse(target.x + 4, target.y + 1, 5, 2.5).fill(0xffd29a);
      for (const s of this.stalls) {
        if (Math.hypot(s.x - hz.center.x, s.y - hz.center.y) <= hz.radius + 0.6) { s.root.children[0].visible = false; s.debris.visible = true; }
      }
    }
    this.embers.forEach((e, i) => {
      e.s.visible = true;
      const a = (i / this.embers.length) * Math.PI * 2;
      const rr = 8 + (i % 4) * 7;
      e.s.position.set(target.x + Math.cos(a + t * 0.2) * rr, target.y + Math.sin(a + t * 0.2) * rr * 0.5 - ((t * 12 + i * 5) % 20));
      e.s.scale.set(0.08 + 0.04 * Math.sin(t * 5 + e.phase));
      e.s.alpha = 0.9 * Math.max(0.35, 1 - since / 40) * (0.6 + 0.4 * Math.sin(t * 6 + e.phase));
    });
    for (const d of this.dust) {
      if (d.life <= 0) {
        d.life = 2 + Math.random() * 3;
        d.s.position.set(target.x + (Math.random() - 0.5) * 70, target.y + (Math.random() - 0.5) * 30);
        d.vx = 10 + Math.random() * 18;
        d.vy = -4 - Math.random() * 6;
        d.s.scale.set(0.3 + Math.random() * 0.5);
      }
      d.life -= 1 / 60;
      d.s.visible = true;
      d.s.x += d.vx / 60;
      d.s.y += d.vy / 60;
      const fade = Math.max(0, Math.min(1, since / 2)) * Math.max(0.2, 1 - since / 120);
      d.s.alpha = Math.min(0.22, d.life * 0.08) * fade;
    }
  }

  private drawCitizens(ctrl: Controller, t: number, dt: number) {
    const sim = ctrl.sim;
    const nightUi = this.night > 0.5;
    for (const c of sim.citizens) {
      let v = this.citizens.get(c.id);
      if (!v) { v = this.makeCitizen(c); this.citizens.set(c.id, v); }
      const p = iso(c.pos.x, c.pos.y);
      v.root.visible = !c.inside;
      v.root.position.set(p.x, p.y);
      v.root.zIndex = this.citizenDepth(c);
      const moving = c.path.length > 0 && !sim.stalled && !ctrl.paused;
      const phase = t * 9 * Math.max(1, ctrl.speed * 0.7) + Number(c.id.slice(-2));
      v.body.y = moving ? -Math.abs(Math.sin(phase)) * 1.6 : Math.sin(t * 2 + phase) * 0.3;
      v.body.rotation = moving ? Math.sin(phase) * 0.05 : 0;
      v.body.scale.x = c.facing;
      v.alert.visible = c.needsHelp;
      if (c.needsHelp) v.alert.y = Math.sin(t * 5) * 1.5;
      if (c.helpingId && !c.path.length) v.body.rotation = Math.sin(t * 6) * 0.12; // tending to someone

      const d = c.lastDecision;
      if (d && d.id !== v.lastDecisionId) {
        v.lastDecisionId = d.id;
        v.pulseT = 1;
        v.bubbleT = c.inside ? 0 : 1;
        v.action = d.enactedChoice;
        v.bubbleIcon.clear();
        drawActionIcon(v.bubbleIcon, d.enactedChoice, ACTION_COLOR[d.enactedChoice]);
        const dest = c.path[c.path.length - 1];
        v.markerAt = dest ? iso(dest.x, dest.y) : null;
        v.markerT = dest ? 1 : 0;
      }
      v.pulse.clear();
      if (v.pulseT > 0 && v.action) {
        v.pulseT -= 0.025 * dt;
        const r = (1 - v.pulseT) * 22 + 4;
        v.pulse.ellipse(0, 0, r, r / 2).stroke({ width: 2, color: ACTION_COLOR[v.action], alpha: Math.max(0, v.pulseT) * 0.9 });
      }
      // decision bubble: pops in, floats, fades
      if (v.bubbleT > 0 && !c.needsHelp) {
        v.bubbleT -= 0.008 * dt;
        const age = 1 - v.bubbleT;
        const pop = age < 0.08 ? ease(age / 0.08) * 1.15 : age < 0.14 ? 1.15 - (age - 0.08) * 2.5 : 1;
        v.bubble.visible = true;
        v.bubble.scale.set(pop * 0.95);
        v.bubble.y = -38 - age * 6;
        v.bubble.alpha = Math.min(1, v.bubbleT * 4);
      } else v.bubble.visible = false;
      // destination marker on the ground
      v.marker.clear();
      if (v.markerT > 0 && v.markerAt && v.action) {
        v.markerT -= 0.006 * dt;
        const k = Math.max(0, v.markerT);
        const r = 9 + (1 - k) * 4;
        v.marker.ellipse(v.markerAt.x, v.markerAt.y, r, r / 2).stroke({ width: 2, color: ACTION_COLOR[v.action], alpha: k * 0.8 });
        v.marker.ellipse(v.markerAt.x, v.markerAt.y, 3, 1.5).fill({ color: ACTION_COLOR[v.action], alpha: k * 0.8 });
      }

      const selected = ctrl.selectedId === c.id;
      v.ring.clear();
      if (selected) {
        const pr = 1 + Math.sin(t * 4) * 0.08;
        v.ring.ellipse(0, 0, 11 * pr, 5.5 * pr).fill({ color: PAL.teal, alpha: 0.25 }).ellipse(0, 0, 11 * pr, 5.5 * pr).stroke({ width: 2.5, color: 0xffffff });
      }
      v.label.visible = selected;
      v.label.style.fill = nightUi ? 0xffffff : 0x1b303d;
      v.label.style.stroke = { color: nightUi ? 0x14263e : 0xffffff, width: 3 };
      v.label.y = v.bubble.visible ? -52 : -27;
    }
  }

  private drawPath(ctrl: Controller) {
    const g = this.pathLayer;
    g.clear();
    const c = ctrl.selected;
    if (!c || c.inside || !c.path.length) return;
    const color = c.action ? ACTION_COLOR[c.action] : PAL.teal;
    let prev = iso(c.pos.x, c.pos.y);
    const dash = (performance.now() / 120) % 2;
    c.path.forEach((tile, i) => {
      const p = iso(tile.x, tile.y);
      if ((i + Math.floor(dash)) % 2 === 0) g.moveTo(prev.x, prev.y).lineTo(p.x, p.y).stroke({ width: 3, color, alpha: 0.75, cap: 'round' });
      prev = p;
    });
    const end = iso(c.path[c.path.length - 1].x, c.path[c.path.length - 1].y);
    g.ellipse(end.x, end.y, 12, 6).stroke({ width: 2.5, color, alpha: 0.95 });
    g.ellipse(end.x, end.y, 4, 2).fill({ color, alpha: 0.95 });
  }
}

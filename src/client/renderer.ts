'use client';
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { BUILDINGS, isRoad, MAP_H, MAP_W, STREETLIGHTS, TREES, type Building } from '@/sim/map';
import type { Citizen } from '@/sim/citizens';
import type { Controller } from './controller';
import { ACTION_COLOR, HAIRS, mix, PAL, SHIRTS, SKINS } from './palette';

const TW = 64;
const TH = 32;
const iso = (x: number, y: number) => ({ x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) });
const pts = (...p: { x: number; y: number }[]) => p.flatMap((q) => [q.x, q.y]);
const up = (p: { x: number; y: number }, h: number) => ({ x: p.x, y: p.y - h });
const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

const DAY_TINT = 0xffffff;
const NIGHT_TINT = 0x4a5a86;
const BLACKOUT_TINT = 0x29334f;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return Texture.from(c);
}

type BuildingView = { b: Building; root: Container; body: Graphics; windows: Graphics; glow: Sprite | null; badge: Text | null; depth: number; x0: number; x1: number; y0: number; y1: number };
type CitizenView = { root: Container; body: Container; shadow: Graphics; ring: Graphics; alert: Graphics; pulse: Graphics; pulseT: number; lastDecisionId: string | null; label: Text };

export class CityRenderer {
  app = new Application();
  private world = new Container();
  private ground = new Graphics();
  private hazardLayer = new Graphics();
  private pathLayer = new Graphics();
  private objects = new Container();
  private lights = new Container();
  private fx = new Container();
  private flash = new Graphics();
  private buildings: BuildingView[] = [];
  private citizens = new Map<string, CitizenView>();
  private tintables: Graphics[] = [];
  private streetGlows: Sprite[] = [];
  private beacon!: Sprite;
  private lantern!: Sprite;
  private meteorHead!: Sprite;
  private meteorTrail = new Graphics();
  private shock = new Graphics();
  private crater = new Graphics();
  private dust: { s: Sprite; vx: number; vy: number; life: number }[] = [];
  private embers: { s: Sprite; phase: number }[] = [];
  private glow!: Texture;
  private night = 0;
  private blackoutF = 0;
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private fitScale = 1;
  private destroyed = false;
  private reducedMotion = false;
  private lastSim: unknown = null;
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
    this.world.addChild(this.ground, this.hazardLayer, this.pathLayer, this.crater, this.objects, this.lights, this.fx);
    this.drawGround();
    this.drawTrees();
    this.drawStreetlights();
    for (const b of BUILDINGS) this.drawBuilding(b);
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

  // ---------- static scene ----------

  private drawGround() {
    const g = this.ground;
    this.tintables.push(g);
    // Diorama slab sides.
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
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const corners = [iso(x - 0.5, y - 0.5), iso(x + 0.5, y - 0.5), iso(x + 0.5, y + 0.5), iso(x - 0.5, y + 0.5)];
        const road = isRoad(x, y);
        const nearRoad = !road && (isRoad(x + 1, y) || isRoad(x - 1, y) || isRoad(x, y + 1) || isRoad(x, y - 1));
        const plaza = x >= 6 && x <= 10 && y >= 9 && y <= 10;
        const color = road ? PAL.road : plaza ? PAL.plaza : nearRoad ? PAL.sidewalk : PAL.grass[(x * 7 + y * 13) % 3];
        g.poly(pts(...corners)).fill(color);
        if (!road) g.poly(pts(...corners)).stroke({ width: 1, color: 0x000000, alpha: nearRoad || plaza ? 0.06 : 0.025 });
        if (road) {
          const hRoad = [5, 11, 17].includes(y), vRoad = [5, 11, 17].includes(x);
          if (hRoad && vRoad) {
            // crosswalk stripes
            for (let i = -2; i <= 2; i++) {
              const p = iso(x + i * 0.16, y - 0.42), q = iso(x + i * 0.16, y - 0.3);
              g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 3, color: PAL.roadLine, alpha: 0.75 });
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
    // Market plaza tiles pattern
    for (let x = 6; x <= 10; x++) {
      const p = iso(x - 0.5, 9.5), q = iso(x + 0.5, 9.5);
      g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 1, color: 0xc9b894, alpha: 0.5 });
    }
  }

  private drawTrees() {
    TREES.forEach((t, i) => {
      const c = new Container();
      const g = new Graphics();
      const p = iso(t.x, t.y);
      g.ellipse(0, 2, 14, 6).fill({ color: 0x000000, alpha: 0.16 });
      g.rect(-2, -14, 4, 15).fill(PAL.trunk);
      const s = 0.9 + ((i * 37) % 5) / 12;
      g.circle(0, -22 * s, 12 * s).fill(PAL.leaf[0]);
      g.circle(-6 * s, -18 * s, 8 * s).fill(PAL.leaf[1]);
      g.circle(5 * s, -28 * s, 8 * s).fill(PAL.leaf[2]);
      g.circle(-3 * s, -28 * s, 4 * s).fill({ color: 0xffffff, alpha: 0.18 });
      c.addChild(g);
      c.position.set(p.x, p.y);
      c.zIndex = t.x + t.y;
      this.tintables.push(g);
      this.objects.addChild(c);
    });
  }

  private drawStreetlights() {
    for (const t of STREETLIGHTS) {
      const p = iso(t.x + 0.3, t.y + 0.3);
      const g = new Graphics();
      g.ellipse(0, 1, 4, 2).fill({ color: 0, alpha: 0.2 });
      g.rect(-1, -26, 2, 26).fill(0x4a5563);
      g.roundRect(-4, -30, 8, 5, 2).fill(0x39424f);
      g.position.set(p.x, p.y);
      g.zIndex = t.x + t.y + 0.6;
      this.tintables.push(g);
      this.objects.addChild(g);
      const head = new Sprite(this.glow);
      head.anchor.set(0.5);
      head.tint = 0xffc86e;
      head.scale.set(0.18);
      head.position.set(p.x, p.y - 27);
      const pool = new Sprite(this.glow);
      pool.anchor.set(0.5);
      pool.tint = 0xffb85c;
      pool.scale.set(1.1, 0.55);
      pool.position.set(p.x, p.y);
      this.lights.addChild(pool, head);
      this.streetGlows.push(pool, head);
    }
  }

  private face(g: Graphics, a: { x: number; y: number }, b: { x: number; y: number }, h0: number, h1: number, color: number, alpha = 1) {
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

    // contact shadow
    body.poly(pts(lerp(A, B, 0), B, C, { x: C.x + 18, y: C.y + 9 }, { x: B.x + 18, y: B.y + 9 }, { x: A.x + 18, y: A.y + 9 })).fill({ color: 0x000000, alpha: 0.12 });
    const left = mix(b.wall, 0xffffff, 0.05);
    const right = mix(b.wall, 0x000000, 0.16);
    this.face(body, A, B, 0, H, left);
    this.face(body, B, C, 0, H, right);
    // base band
    this.face(body, A, B, 0, 4, mix(b.wall, 0x000000, 0.25));
    this.face(body, B, C, 0, 4, mix(b.wall, 0x000000, 0.35));
    body.moveTo(up(A, H).x, up(A, H).y).lineTo(up(B, H).x, up(B, H).y).lineTo(up(C, H).x, up(C, H).y).stroke({ width: 1, color: 0xffffff, alpha: 0.35 });

    // windows per floor on both faces
    const winGrid = (fa: { x: number; y: number }, fb: { x: number; y: number }, cols: number) => {
      for (let f = 0; f < b.floors; f++) {
        const yb = 8 + f * floorH, yt = yb + floorH * 0.5;
        for (let i = 0; i < cols; i++) {
          const u0 = (i + 0.28) / cols, u1 = (i + 0.72) / cols;
          const p0 = lerp(fa, fb, u0), p1 = lerp(fa, fb, u1);
          body.poly(pts(up(p0, yb), up(p1, yb), up(p1, yt), up(p0, yt))).fill(PAL.windowDay);
          windows.poly(pts(up(p0, yb), up(p1, yb), up(p1, yt), up(p0, yt))).fill(PAL.window);
        }
      }
    };
    winGrid(A, B, b.w * 2);
    winGrid(B, C, b.h * 2);

    // door on the +y face
    const du = (b.door.x - x0) / b.w;
    const d0 = lerp(A, B, du - 0.09), d1 = lerp(A, B, du + 0.09);
    body.poly(pts(d0, d1, up(d1, 13), up(d0, 13))).fill(mix(b.roof, 0x000000, 0.35));

    // roofs
    const rA = up(A, H), rB = up(B, H), rC = up(C, H), rD = up(D, H);
    if (b.kind === 'house') {
      const apex = up(iso((x0 + x1) / 2, (y0 + y1) / 2), H + 20);
      body.poly(pts(rD, rA, apex)).fill(mix(b.roof, 0x000000, 0.1));
      body.poly(pts(rC, rD, apex)).fill(mix(b.roof, 0x000000, 0.2));
      body.poly(pts(rA, rB, apex)).fill(mix(b.roof, 0xffffff, 0.12));
      body.poly(pts(rB, rC, apex)).fill(mix(b.roof, 0x000000, 0.18));
      const ch = up(lerp(rB, rC, 0.6), 4);
      body.rect(ch.x - 3, ch.y - 12, 6, 12).fill(0x9a6b55);
    } else {
      body.poly(pts(rA, rB, rC, rD)).fill(b.roof);
      const inset = (p: { x: number; y: number }) => ({ x: p.x + (iso((x0 + x1) / 2, (y0 + y1) / 2).x - p.x) * 0.12, y: p.y + (up(iso((x0 + x1) / 2, (y0 + y1) / 2), H).y - p.y) * 0.12 });
      body.poly(pts(inset(rA), inset(rB), inset(rC), inset(rD))).fill(mix(b.roof, 0x000000, 0.12));
    }
    const roofCenter = up(iso((x0 + x1) / 2, (y0 + y1) / 2), H);

    // identity props
    if (b.kind === 'market' || b.kind === 'shop') {
      const stripes = b.kind === 'market' ? 8 : 6;
      for (let i = 0; i < stripes; i++) {
        const p0 = lerp(A, B, i / stripes), p1 = lerp(A, B, (i + 1) / stripes);
        const c = i % 2 === 0 ? (b.kind === 'market' ? PAL.coral : 0xe6b54a) : 0xfdf6ea;
        body.poly(pts(up(p0, H - 4), up(p1, H - 4), { x: p1.x - 6, y: p1.y - H + 16 }, { x: p0.x - 6, y: p0.y - H + 16 })).fill(c);
      }
    }
    if (b.kind === 'clinic') {
      body.rect(roofCenter.x - 3, roofCenter.y - 10, 6, 20).fill(0xd84d56);
      body.rect(roofCenter.x - 10, roofCenter.y - 3, 20, 6).fill(0xd84d56);
      this.face(body, A, B, H - 7, H - 3, PAL.teal);
      this.face(body, B, C, H - 7, H - 3, mix(PAL.teal, 0x000000, 0.2));
    }
    if (b.kind === 'shelter') {
      body.poly([roofCenter.x - 9, roofCenter.y - 8, roofCenter.x + 9, roofCenter.y - 8, roofCenter.x + 9, roofCenter.y + 1, roofCenter.x, roofCenter.y + 9, roofCenter.x - 9, roofCenter.y + 1]).fill(0xfdf6ea);
      body.poly([roofCenter.x - 5, roofCenter.y - 5, roofCenter.x + 5, roofCenter.y - 5, roofCenter.x + 5, roofCenter.y, roofCenter.x, roofCenter.y + 5, roofCenter.x - 5, roofCenter.y]).fill(PAL.teal);
    }
    if (b.kind === 'firestation') {
      for (const u of [0.3, 0.7]) {
        const p0 = lerp(A, B, u - 0.15), p1 = lerp(A, B, u + 0.15);
        body.poly(pts(p0, p1, up(p1, 20), up(p0, 20))).fill(0x7a2c33);
        for (let k = 4; k < 20; k += 4) body.moveTo(up(p0, k).x, up(p0, k).y).lineTo(up(p1, k).x, up(p1, k).y).stroke({ width: 1, color: 0x000000, alpha: 0.25 });
      }
      this.face(body, A, B, H - 6, H - 2, 0xf3d34a);
    }
    if (b.kind === 'office') {
      for (const [dx, dy] of [[-12, 0], [10, 2]]) body.roundRect(roofCenter.x + dx - 6, roofCenter.y + dy - 9, 12, 9, 2).fill(0x8d9aa6);
      body.circle(roofCenter.x + 2, roofCenter.y - 18, 2.5).fill(0xd84d56);
      body.rect(roofCenter.x + 1.5, roofCenter.y - 16, 1, 10).fill(0x55606b);
    }
    if (b.kind === 'substation') {
      body.poly([roofCenter.x + 2, roofCenter.y - 14, roofCenter.x - 6, roofCenter.y, roofCenter.x, roofCenter.y, roofCenter.x - 3, roofCenter.y + 10, roofCenter.x + 7, roofCenter.y - 4, roofCenter.x + 1, roofCenter.y - 4]).fill(0xf3d34a);
    }

    let glow: Sprite | null = null;
    if (b.kind === 'clinic' || b.kind === 'shop') {
      glow = new Sprite(this.glow);
      glow.anchor.set(0.5);
      glow.tint = b.kind === 'clinic' ? 0xff6b5e : 0xffb35c;
      glow.position.set(b.kind === 'clinic' ? roofCenter.x : lerp(A, B, 0.5).x, b.kind === 'clinic' ? roofCenter.y - 6 : lerp(A, B, 0.5).y - 18);
      glow.scale.set(b.kind === 'clinic' ? 1.3 : 0.9);
      glow.alpha = 0;
      this.lights.addChild(glow);
      if (b.kind === 'clinic') this.beacon = glow; else this.lantern = glow;
    }

    let badge: Text | null = null;
    if (b.kind === 'shelter' || b.kind === 'clinic') {
      badge = new Text({ text: '', style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, fontWeight: '700', fill: 0xffffff } });
      badge.anchor.set(0.5);
      badge.position.set(roofCenter.x, roofCenter.y - 30);
      root.addChild(badge);
    }

    root.zIndex = (x0 + x1) / 2 + (y0 + y1) / 2 + 0.5;
    this.objects.addChild(root);
    this.buildings.push({ b, root, body, windows, glow, badge, depth: root.zIndex, x0, x1, y0, y1 });
  }

  private setupFx() {
    this.meteorHead = new Sprite(this.glow);
    this.meteorHead.anchor.set(0.5);
    this.meteorHead.tint = 0xffd29a;
    this.meteorHead.visible = false;
    this.fx.addChild(this.meteorTrail, this.meteorHead, this.shock);
    for (let i = 0; i < 70; i++) {
      const s = new Sprite(this.glow);
      s.anchor.set(0.5);
      s.tint = 0xcdb79a;
      s.visible = false;
      this.fx.addChild(s);
      this.dust.push({ s, vx: 0, vy: 0, life: 0 });
    }
    for (let i = 0; i < 14; i++) {
      const s = new Sprite(this.glow);
      s.anchor.set(0.5);
      s.tint = 0xff8a4c;
      s.visible = false;
      this.lights.addChild(s);
      this.embers.push({ s, phase: i * 0.7 });
    }
  }

  // ---------- citizens ----------

  private makeCitizen(c: Citizen): CitizenView {
    const root = new Container();
    const shadow = new Graphics().ellipse(0, 0, 6, 3).fill({ color: 0x000000, alpha: 0.22 });
    const ring = new Graphics();
    const pulse = new Graphics();
    const body = new Container();
    const g = new Graphics();
    const shirt = c.role === 'healthcare' ? 0xf4f7f6 : c.role === 'responder' ? PAL.responder : SHIRTS[c.look.shirt];
    g.roundRect(-3.2, -6, 2.6, 6, 1).fill(0x3b4250);
    g.roundRect(0.6, -6, 2.6, 6, 1).fill(0x3b4250);
    g.roundRect(-4.5, -15, 9, 10, 3).fill(shirt);
    if (c.role === 'responder') g.rect(-4.5, -10.5, 9, 2).fill(0xf3d34a);
    if (c.role === 'healthcare') { g.rect(-0.8, -13.5, 1.6, 5).fill(PAL.teal); g.rect(-2.5, -11.8, 5, 1.6).fill(PAL.teal); }
    if (c.role === 'service') g.roundRect(-3.5, -11, 7, 6, 1.5).fill(0xfdf6ea);
    g.circle(0, -19, 4.2).fill(SKINS[c.look.skin]);
    g.ellipse(0, -21.2, 4.4, 2.6).fill(HAIRS[c.look.hair]);
    body.addChild(g);
    this.tintables.push(g);
    const alert = new Graphics();
    alert.circle(0, -33, 6).fill(PAL.coral).circle(0, -33, 6).stroke({ width: 1.5, color: 0xffffff });
    alert.rect(-0.9, -36.5, 1.8, 4.2).fill(0xffffff).circle(0, -30.4, 1).fill(0xffffff);
    alert.visible = false;
    const label = new Text({ text: c.name.split(' ')[0], style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, fontWeight: '700', fill: 0x1b303d, stroke: { color: 0xffffff, width: 3 } } });
    label.anchor.set(0.5, 1);
    label.position.set(0, -27);
    label.visible = false;
    root.addChild(pulse, shadow, ring, body, alert, label);
    this.objects.addChild(root);
    return { root, body, shadow, ring, alert, pulse, pulseT: 0, lastDecisionId: null, label };
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

  // ---------- input / camera ----------

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
    const cx = (iso(-0.5, MAP_H - 0.5).x + iso(MAP_W - 0.5, -0.5).x) / 2;
    const cy = (iso(-0.5, -0.5).y - 60 + iso(MAP_W - 0.5, MAP_H - 0.5).y + 50) / 2;
    this.world.scale.set(s);
    this.world.position.set(w / 2 - cx * s + this.pan.x, h / 2 - cy * s + this.pan.y);
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
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) { this.pan = { x: drag.px + dx, y: drag.py + dy }; this.applyCamera(); }
    });
    const end = (e: { global: { x: number; y: number } }) => {
      if (drag && !drag.moved) {
        const local = this.world.toLocal(e.global);
        let best: string | null = null, bestD = 16;
        for (const c of ctrl.sim.citizens) {
          if (c.inside) continue;
          const p = iso(c.pos.x, c.pos.y);
          const d = Math.hypot(local.x - p.x, local.y - (p.y - 10));
          if (d < bestD) { bestD = d; best = c.id; }
        }
        this.onSelect(best);
      }
      drag = null;
    };
    stage.on('pointerup', end);
    stage.on('pointerupoutside', () => (drag = null));
    this.app.canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const old = this.zoom;
      this.zoom = Math.max(0.7, Math.min(2.8, this.zoom * (ev.deltaY < 0 ? 1.1 : 0.9)));
      const rect = this.app.canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left - this.app.screen.width / 2, my = ev.clientY - rect.top - this.app.screen.height / 2;
      const k = this.zoom / old;
      this.pan = { x: mx - (mx - this.pan.x) * k, y: my - (my - this.pan.y) * k };
      this.applyCamera();
    }, { passive: false });
  }

  resetCamera() {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.applyCamera();
  }

  // ---------- per-frame ----------

  private frame(ctrl: Controller) {
    const sim = ctrl.sim;
    const t = performance.now() / 1000;
    if (sim !== this.lastSim) this.onNewSim(sim);
    this.applyCamera();

    // Lighting
    const targetNight = ctrl.night ? 1 : 0;
    const targetBlackout = sim.blackout ? 1 : 0;
    this.night += (targetNight - this.night) * 0.06;
    this.blackoutF += (targetBlackout - this.blackoutF) * 0.08;
    const nightTint = mix(NIGHT_TINT, BLACKOUT_TINT, this.blackoutF);
    const dark = Math.max(this.night, this.blackoutF * 0.55);
    const tint = mix(DAY_TINT, nightTint, dark);
    for (const g of this.tintables) g.tint = tint;
    const powered = 1 - this.blackoutF;
    for (const s of this.streetGlows) s.alpha = this.night * powered * 0.55;
    for (const v of this.buildings) {
      const generator = v.b.kind === 'clinic' || (v.b.kind === 'shop');
      const flicker = v.b.kind === 'shop' ? 0.75 + Math.sin(t * 9 + 1) * 0.08 + Math.sin(t * 23) * 0.05 : 1;
      v.windows.alpha = dark * (generator ? (v.b.kind === 'shop' ? Math.max(powered, 0.7 * this.blackoutF) * flicker : 1) : powered) * 0.95;
      if (v.badge) {
        const n = sim.occupancy(v.b.id);
        v.badge.text = n ? `${n} inside` : '';
        v.badge.style.fill = dark > 0.5 ? 0xffffff : 0x1b303d;
      }
    }
    if (this.beacon) this.beacon.alpha = this.blackoutF * (0.55 + Math.sin(t * 4) * 0.3) + this.night * powered * 0.15;
    if (this.lantern) this.lantern.alpha = this.blackoutF * this.night * (0.5 + Math.sin(t * 11) * 0.08);

    this.drawHazard(ctrl, t);
    this.drawCitizens(ctrl, t);
    this.drawPath(ctrl);
  }

  private onNewSim(sim: unknown) {
    this.lastSim = sim;
    for (const v of this.citizens.values()) {
      this.objects.removeChild(v.root);
      this.tintables = this.tintables.filter((g) => !v.body.children.includes(g));
      v.root.destroy({ children: true });
    }
    this.citizens.clear();
    this.crater.clear();
    this.hazardLayer.clear();
    this.shock.clear();
    this.meteorTrail.clear();
    this.meteorHead.visible = false;
    this.flash.clear();
    for (const d of this.dust) { d.s.visible = false; d.life = 0; }
    for (const e of this.embers) e.s.visible = false;
  }

  private drawHazard(ctrl: Controller, t: number) {
    const sim = ctrl.sim;
    const impactAt = 90, warnAt = 50;
    const target = iso(9, 11);
    // Incoming meteor streak
    if (sim.meteorIncoming) {
      const k = Math.min(1, (sim.tick - warnAt) / (impactAt - warnAt));
      const start = { x: target.x + 900, y: target.y - 900 };
      const head = { x: start.x + (target.x - start.x) * k * k, y: start.y + (target.y - start.y) * k * k };
      this.meteorHead.visible = true;
      this.meteorHead.position.set(head.x, head.y);
      this.meteorHead.scale.set(0.5 + k * 0.6);
      this.meteorTrail.clear();
      for (let i = 0; i < 6; i++) {
        const f = 1 + i * 0.12;
        this.meteorTrail.moveTo(head.x, head.y).lineTo(head.x + (start.x - head.x) * 0.18 * f, head.y + (start.y - head.y) * 0.18 * f).stroke({ width: 7 - i, color: i < 2 ? 0xfff1d6 : 0xffa86b, alpha: 0.5 - i * 0.07 });
      }
    } else {
      this.meteorHead.visible = false;
      this.meteorTrail.clear();
    }
    const hz = sim.hazard;
    if (!hz) return;
    const since = (sim.tick - hz.impactTick) * 0.1; // seconds of sim time
    // Flash
    this.flash.clear();
    if (since < 1.2) {
      const a = Math.max(0, 0.85 - since * 0.75);
      this.flash.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ color: 0xfff3e0, alpha: a });
      if (!this.reducedMotion && since < 0.5) this.world.position.x += Math.sin(t * 90) * 4 * (0.5 - since);
    }
    // Shockwave
    this.shock.clear();
    if (since < 2.5) {
      const r = since * 260;
      this.shock.ellipse(target.x, target.y, r, r / 2).stroke({ width: 6 * (1 - since / 2.5) + 1, color: 0xffe2b8, alpha: 0.7 * (1 - since / 2.5) });
    }
    // Crater + hazard zone (static after impact)
    if (this.crater.children.length === 0 && this.crater.width === 0) {
      const hzG = this.hazardLayer;
      for (let y = 0; y < MAP_H; y++)
        for (let x = 0; x < MAP_W; x++) {
          if (Math.hypot(x - hz.center.x, y - hz.center.y) > hz.radius) continue;
          const c = [iso(x - 0.5, y - 0.5), iso(x + 0.5, y - 0.5), iso(x + 0.5, y + 0.5), iso(x - 0.5, y + 0.5)];
          hzG.poly(pts(...c)).fill({ color: PAL.coral, alpha: 0.22 });
          for (let k = -0.4; k <= 0.4; k += 0.4) {
            const p = iso(x + k - 0.1, y - 0.5 + 0.1), q = iso(x + k + 0.1, y + 0.5 - 0.1);
            hzG.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 1.5, color: PAL.coral, alpha: 0.35 });
          }
        }
      const R = hz.radius + 0.5;
      hzG.ellipse(target.x, target.y, R * 45, R * 22.5).stroke({ width: 2.5, color: PAL.coral, alpha: 0.85 });
      this.crater.ellipse(target.x, target.y, 46, 23).fill(0x5a463a);
      this.crater.ellipse(target.x, target.y + 2, 36, 17).fill(0x3d2f27);
      this.crater.ellipse(target.x + 4, target.y + 3, 18, 8).fill(0x2a1f1a);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        this.crater.ellipse(target.x + Math.cos(a) * 52, target.y + Math.sin(a) * 26, 7, 4).fill(0x6f5a49);
      }
      this.crater.ellipse(target.x + 4, target.y + 2, 10, 5).fill(0xff7a3c);
    }
    // Embers
    this.embers.forEach((e, i) => {
      e.s.visible = true;
      const a = (i / this.embers.length) * Math.PI * 2;
      const rr = 8 + (i % 4) * 7;
      e.s.position.set(target.x + Math.cos(a + t * 0.2) * rr, target.y + Math.sin(a + t * 0.2) * rr * 0.5 - ((t * 12 + i * 5) % 20));
      e.s.scale.set(0.08 + 0.04 * Math.sin(t * 5 + e.phase));
      e.s.alpha = Math.max(0, 0.9 * Math.max(0.35, 1 - since / 40)) * (0.6 + 0.4 * Math.sin(t * 6 + e.phase));
    });
    // Dust drifting east (low opacity, keeps characters readable)
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

  private drawCitizens(ctrl: Controller, t: number) {
    const sim = ctrl.sim;
    for (const c of sim.citizens) {
      let v = this.citizens.get(c.id);
      if (!v) { v = this.makeCitizen(c); this.citizens.set(c.id, v); }
      const p = iso(c.pos.x, c.pos.y);
      v.root.visible = !c.inside;
      v.root.position.set(p.x, p.y);
      v.root.zIndex = this.citizenDepth(c);
      const moving = c.path.length > 0;
      const phase = t * 9 + Number(c.id.slice(-2));
      v.body.y = moving ? -Math.abs(Math.sin(phase)) * 1.6 : Math.sin(t * 2 + phase) * 0.3;
      v.body.scale.x = c.facing;
      v.alert.visible = c.needsHelp;
      if (c.needsHelp) v.alert.y = Math.sin(t * 5) * 1.5;
      // decision pulse
      const d = c.lastDecision;
      if (d && d.id !== v.lastDecisionId) { v.lastDecisionId = d.id; v.pulseT = 1; }
      v.pulse.clear();
      if (v.pulseT > 0 && d) {
        v.pulseT -= 0.025;
        const r = (1 - v.pulseT) * 22 + 4;
        v.pulse.ellipse(0, 0, r, r / 2).stroke({ width: 2, color: ACTION_COLOR[d.enactedChoice], alpha: v.pulseT * 0.9 });
      }
      const selected = ctrl.selectedId === c.id;
      v.ring.clear();
      if (selected) {
        const pr = 1 + Math.sin(t * 4) * 0.08;
        v.ring.ellipse(0, 0, 10 * pr, 5 * pr).stroke({ width: 2.5, color: 0xffffff }).ellipse(0, 0, 10 * pr, 5 * pr).stroke({ width: 1, color: PAL.teal, alpha: 0.9 });
        v.ring.moveTo(0, -27).lineTo(0, -40).stroke({ width: 0 });
      }
      v.label.visible = selected;
      v.label.style.fill = this.night > 0.5 ? 0xffffff : 0x1b303d;
      v.label.style.stroke = { color: this.night > 0.5 ? 0x14263e : 0xffffff, width: 3 };
    }
  }

  private drawPath(ctrl: Controller) {
    const g = this.pathLayer;
    g.clear();
    const c = ctrl.selected;
    if (!c || c.inside || !c.path.length) return;
    const color = c.action ? ACTION_COLOR[c.action] : PAL.teal;
    let prev = iso(c.pos.x, c.pos.y);
    c.path.forEach((tile, i) => {
      const p = iso(tile.x, tile.y);
      if (i % 1 === 0) g.circle((prev.x + p.x) / 2, (prev.y + p.y) / 2, 2).fill({ color, alpha: 0.85 });
      g.circle(p.x, p.y, 2.2).fill({ color, alpha: 0.85 });
      prev = p;
    });
    const end = iso(c.path[c.path.length - 1].x, c.path[c.path.length - 1].y);
    g.ellipse(end.x, end.y, 11, 5.5).stroke({ width: 2, color, alpha: 0.9 });
  }
}

import { Texture } from 'pixi.js';

export const TW = 64;
export const TH = 32;
export type P = { x: number; y: number };
export const iso = (x: number, y: number): P => ({ x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) });
export const pts = (...p: P[]) => p.flatMap((q) => [q.x, q.y]);
export const up = (p: P, h: number): P => ({ x: p.x, y: p.y - h });
export const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function glowTexture() {
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

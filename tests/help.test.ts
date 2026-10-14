import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (p: string) => readFileSync(p, 'utf8');
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith('.tsx') ? [join(dir, d.name)] : []));

describe('help system', () => {
  const content = src('src/components/help/content.tsx');
  const ids = [...content.matchAll(/id: '([a-z-]+)'/g)].map((m) => m[1]);

  it('has the expected topics with unique ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of ['overview', 'controls', 'inspector', 'modes', 'scenarios', 'legend', 'performance', 'benchmark', 'faq', 'glossary']) expect(ids).toContain(t);
  });

  it('every in-app help link points at a real topic', () => {
    const used = files('src/components').flatMap((f) => [...src(f).matchAll(/(?:section|help)="([a-z-]+)"|openHelp\('([a-z-]+)'\)/g)].map((m) => m[1] ?? m[2]));
    expect(used.length).toBeGreaterThan(8);
    for (const u of used) expect(ids, `unknown help section "${u}"`).toContain(u);
  });

  it('scenario times in the help match the simulation timeline', () => {
    // 1 tick = 0.1 sim minute; see src/sim/world.ts
    const world = src('src/sim/world.ts');
    const tick = (name: string) => Number(world.match(new RegExp(`${name} = (\\d+)`))![1]);
    const hhmm = (start: number, t: number) => { const m = start + Math.floor(t * 0.1); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
    expect(content).toContain(hhmm(18 * 60 + 50, tick('BLACKOUT_TICK')));
    expect(content).toContain(hhmm(18 * 60 + 50, tick('BLACKOUT_TICK') + tick('ISOLATION_TICKS')));
    expect(content).toContain(hhmm(18 * 60 + 50, tick('BLACKOUT_TICK') + tick('CONTRACTOR_DELAY')));
    expect(content).toContain(hhmm(18 * 60 + 40, tick('BLACKOUT_TICK') + tick('CONTRACTOR_DELAY')));
    const mb = (k: string) => Number(world.match(new RegExp(`METEOR_BLACKOUT: MeteorConfig = \\{[\\s\\S]*?${k}: (\\d+)`))![1]);
    for (const k of ['warnTick', 'impactTick', 'crewTick', 'clearTick']) expect(content).toContain(hhmm(17 * 60 + 40, mb(k)));
    expect(content).toContain(hhmm(17 * 60 + 40, mb('impactTick') + tick('MB_ISOLATION_TICKS')));
    expect(content).toContain(hhmm(17 * 60 + 40, mb('impactTick') + tick('CONTRACTOR_DELAY')));
    expect(content).toContain(hhmm(12 * 60 + 30, tick('METEOR_IMPACT_TICK')));
    expect(content).toContain(hhmm(12 * 60 + 30, tick('METEOR_CREW_TICK')));
    expect(content).toContain(hhmm(12 * 60 + 30, tick('METEOR_CLEARED_TICK')));
    for (const k of ['FIRE_SMOKE_TICK', 'FIRE_IGNITE_TICK', 'FIRE_DISPATCH_TICK']) expect(content).toContain(hhmm(15 * 60 + 10, tick(k)));
    for (const k of ['FEST_OPEN_TICK', 'FEST_PEAK_TICK', 'FEST_CLOSING_TICK', 'FEST_CLOSED_TICK']) expect(content).toContain(hhmm(17 * 60, tick(k)));
    for (const k of ['FLOOD_WARN_TICK', 'FLOOD_RISE_TICK', 'FLOOD_ALERT_TICK', 'FLOOD_RECEDE_TICK', 'FLOOD_DRY_TICK']) expect(content).toContain(hhmm(16 * 60, tick(k)));
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asReplayed, rulesDecision } from '@/sim/decisions';
import { SCENARIOS, type DecisionResultV1, type ScenarioId } from '@/sim/types';
import { SIM_VERSION, Simulation } from '@/sim/world';

function run(scenario: ScenarioId, ticks: number, provide: (s: Simulation) => void) {
  const sim = new Simulation(scenario, 2401);
  while (sim.tick < ticks) {
    provide(sim);
    expect(sim.step()).toBe(true);
  }
  return sim;
}
const rules = (s: Simulation) => { for (const r of s.outbox.splice(0)) s.provide(r.key, rulesDecision(r)); };
const snapshot = (s: Simulation) => JSON.stringify(s.citizens.map((c) => [c.id, c.pos, c.action, c.needsHelp, c.inside]));

describe('F01 seeding and determinism', () => {
  it.each(SCENARIOS)('%s starts with 25 unique citizens', (sc) => {
    const ids = new Simulation(sc, 2401).citizens.map((c) => c.id);
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
  });

  it.each(SCENARIOS)('%s: same seed + decisions => identical world', (sc) => {
    expect(snapshot(run(sc, 900, rules))).toBe(snapshot(run(sc, 900, rules)));
  });

  it.each(SCENARIOS)('%s: committed recording replays with no missing decisions', (sc) => {
    const log = JSON.parse(readFileSync(`public/replays/${sc}.json`, 'utf8')) as { decisions: DecisionResultV1[]; ticks: number; simVersion: number };
    expect(log.simVersion, 'recording is stale — run `npm run record`').toBe(SIM_VERSION);
    const idx = new Map(log.decisions.map((d) => [d.id, d]));
    let missing = 0;
    run(sc, log.ticks, (s) => {
      for (const r of s.outbox.splice(0)) {
        const d = idx.get(r.key);
        if (!d) missing++;
        s.provide(r.key, d ? asReplayed(d) : rulesDecision(r, 'fallback'));
      }
    });
    expect(missing).toBe(0);
  });
});

describe('F02 physically plausible actions', () => {
  it.each(SCENARIOS)('%s: enacted actions are eligible and paths avoid blocked tiles', (sc) => {
    const sim = new Simulation(sc, 2401);
    const seen = new Set<string>();
    while (sim.tick < 1500) {
      for (const r of sim.outbox.splice(0)) {
        expect(r.input.eligibleActionIds.length).toBeGreaterThanOrEqual(2);
        expect(r.input.eligibleActionIds).toContain('wait');
        sim.provide(r.key, rulesDecision(r));
      }
      sim.step();
      for (const c of sim.citizens) {
        const d = c.lastDecision;
        if (d && !seen.has(d.id)) {
          seen.add(d.id);
          if (d.samplingPolicy !== 'deterministic-override') expect(d.enactedChoice).toBe(d.modelTopChoice ?? d.enactedChoice);
        }
        for (const t of c.path) expect(sim.walkable[t.y][t.x]).toBe(true);
      }
    }
    expect(seen.size).toBeGreaterThan(50);
  });

  it('report_for_duty is only offered to responders/healthcare during an incident', () => {
    const sim = run('meteor', 400, rules);
    for (const c of sim.citizens) {
      const el = sim.getEligibleActions(c);
      if (el.includes('report_for_duty')) expect(['healthcare', 'responder']).toContain(c.role);
    }
    const calm = run('ordinary_morning', 200, rules);
    for (const c of calm.citizens) expect(calm.getEligibleActions(c)).not.toContain('report_for_duty');
  });

  it('meteor blocks tiles inside the hazard radius', () => {
    const sim = run('meteor', 120, rules);
    expect(sim.hazard).not.toBeNull();
    expect(sim.walkable[11][9]).toBe(false);
    for (const c of sim.citizens) expect(sim.walkable[c.tile.y][c.tile.x] || !!c.inside).toBe(true);
  });
});

describe('F05 simulation consequences', () => {
  it('blackout toggles at its scheduled tick and logs incidents', () => {
    const sim = run('blackout', 100, rules);
    expect(sim.blackout).toBe(true);
    expect(sim.events.some((e) => e.kind === 'incident' && /dark/.test(e.text))).toBe(true);
    expect(sim.citizens.filter((c) => c.needsHelp).length).toBeGreaterThan(0);
  });

  it('rules decisions are labeled as rules with no model probabilities', () => {
    const sim = new Simulation('blackout', 1);
    while (!sim.outbox.length) sim.step();
    const req = sim.outbox[0];
    const d = rulesDecision(req);
    expect(d.provenance).toBe('rules');
    expect(d.answers).toBeUndefined();
    expect(d.metrics.upstreamRoundTripMs).toBeNull();
  });
});

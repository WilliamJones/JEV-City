import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asReplayed, rulesDecision } from '@/sim/decisions';
import { SCENARIOS, type DecisionResult, type ScenarioId } from '@/sim/types';
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
  it.each(SCENARIOS)('%s starts with its full population of unique citizens', (sc) => {
    const ids = new Simulation(sc, 2401).citizens.map((c) => c.id);
    const n = sc === 'big_city_blackout' ? 100 : 25;
    expect(ids).toHaveLength(n);
    expect(new Set(ids).size).toBe(n);
  });

  it.each(SCENARIOS)('%s: same seed + decisions => identical world', (sc) => {
    expect(snapshot(run(sc, 900, rules))).toBe(snapshot(run(sc, 900, rules)));
  });

  it.each(SCENARIOS)('%s: recording reproduces the live run exactly (order + state hashes)', (sc) => {
    const log = JSON.parse(readFileSync(`public/replays/${sc}.json`, 'utf8')) as {
      decisions: DecisionResult[]; ticks: number; simVersion: number; checkpoints: Record<string, string>; appliedOrder: string[];
    };
    expect(log.simVersion, 'recording is stale — run `npm run record`').toBe(SIM_VERSION);
    expect(Object.keys(log.checkpoints).length).toBeGreaterThanOrEqual(7);
    const idx = new Map(log.decisions.map((d) => [d.id, d]));
    let missing = 0;
    const hashes: Record<string, string> = {};
    const sim = new Simulation(sc, 2401);
    while (sim.tick < log.ticks) {
      for (const r of sim.outbox.splice(0)) {
        const d = idx.get(r.key);
        if (!d) missing++;
        sim.provide(r.key, d ? asReplayed(d) : rulesDecision(r, 'fallback'));
      }
      expect(sim.step()).toBe(true);
      if (sim.tick % 300 === 0) hashes[sim.tick] = sim.stateHash();
    }
    expect(missing).toBe(0);
    expect(sim.appliedKeys).toEqual(log.appliedOrder);
    expect(hashes).toEqual(log.checkpoints);
  });

  it('late, duplicate and foreign responses cannot mutate the world', () => {
    const sim = new Simulation('blackout', 2401);
    while (!sim.outbox.length) sim.step();
    const [req] = sim.outbox.splice(0);
    const first = rulesDecision(req);
    expect(sim.provide(req.key, first)).toBe(true);
    expect(sim.provide(req.key, { ...first, enactedChoice: 'go_home' })).toBe(false); // duplicate
    expect(sim.provide('citizen-99#1', { ...first, id: 'citizen-99#1' })).toBe(false); // unknown
    expect(sim.provide(req.key, { ...first, id: 'citizen-01#7' })).toBe(false); // mismatched id
    while (sim.citizens.find((c) => c.id === req.citizenId)!.pending) sim.step();
    expect(sim.provide(req.key, first)).toBe(false); // late, already applied
    expect(sim.citizens.find((c) => c.id === req.citizenId)!.lastDecision!.enactedChoice).toBe(first.enactedChoice);
  });

  it('stalls instead of diverging when a due decision has not arrived', () => {
    const sim = new Simulation('ordinary_morning', 2401);
    while (!sim.outbox.length) sim.step();
    const [req] = sim.outbox.splice(0);
    for (let i = 0; i < 10; i++) sim.step();
    const t = sim.tick;
    expect(sim.step()).toBe(false);
    expect(sim.tick).toBe(t);
    sim.provide(req.key, rulesDecision(req));
    expect(sim.step()).toBe(true);
  });
});

describe('F02 physically plausible actions', () => {
  it.each(SCENARIOS)('%s: enacted actions are eligible and paths avoid blocked tiles', (sc) => {
    const sim = new Simulation(sc, 2401);
    const seen = new Set<string>();
    while (sim.tick < 1500) {
      for (const r of sim.outbox.splice(0)) {
        expect(r.input.eligibleActionIds.length).toBeGreaterThanOrEqual(2);
        if (r.input.local.hazard !== 'immediate' && sim.trueHazardAt(sim.citizen(r.citizenId).tile) !== 'immediate') expect(r.input.eligibleActionIds).toContain('wait');
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

  it('regression: a route planned through the impact zone is re-planned before entering it', () => {
    const sim = new Simulation('meteor', 2401);
    while (sim.tick < 85) { for (const r of sim.outbox.splice(0)) sim.provide(r.key, rulesDecision(r)); sim.step(); }
    const c = sim.citizens.find((x) => !x.inside && !x.pending)!;
    c.tile = { x: 6, y: 11 }; c.pos = { x: 6, y: 11 };
    c.path = [7, 8, 9, 10, 11, 12].map((x) => ({ x, y: 11 }));
    while (sim.tick < 400) {
      for (const r of sim.outbox.splice(0)) sim.provide(r.key, rulesDecision(r));
      sim.step();
      expect(sim.walkable[Math.round(c.pos.y)][Math.round(c.pos.x)] || !!c.inside).toBe(true);
      for (const t of c.path) expect(sim.walkable[t.y][t.x]).toBe(true);
    }
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

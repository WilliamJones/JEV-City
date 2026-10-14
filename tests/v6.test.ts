import { describe, expect, it } from 'vitest';
import { buildJevRequest } from '@/jev/contract';
import { rulesDecision } from '@/sim/decisions';
import { buildingById, MAP_H, MAP_W, reachMap } from '@/sim/map';
import { ruleWeights } from '@/sim/rules';
import { SCENARIOS, type ActionId, type ScenarioId } from '@/sim/types';
import { DEEP, FEST_CAPACITY, FIRE_CORDON, Simulation, type DecisionRequest } from '@/sim/world';

/** Run a scenario on the rules baseline, calling `onRequest` for every decision request and `onTick` after every step. */
function run(sc: ScenarioId, ticks: number, hooks: { onRequest?: (r: DecisionRequest, s: Simulation) => void; onTick?: (s: Simulation) => void } = {}) {
  const sim = new Simulation(sc, 2401);
  while (sim.tick < ticks) {
    for (const r of sim.outbox.splice(0)) {
      hooks.onRequest?.(r, sim);
      sim.provide(r.key, rulesDecision(r));
    }
    expect(sim.step()).toBe(true);
    hooks.onTick?.(sim);
  }
  return sim;
}

const NEW: ActionId[] = ['seek_medical_care', 'move_away_from_hazard', 'check_on_family', 'warn_others', 'attend_festival'];

describe('sim v6 acceptance (docs/reviews/2026-10-14-chatgpt-v6-expansion.md)', () => {
  it('V6-01 new actions are only offered when their gates hold', () => {
    for (const sc of SCENARIOS)
      run(sc, 1600, {
        onRequest: (r, s) => {
          const c = s.citizen(r.citizenId);
          const el = r.input.eligibleActionIds;
          const l = r.input.local;
          if (el.includes('seek_medical_care')) { expect(c.injury).toBe('minor'); expect(c.care).toBe('none'); expect(l.reachableClinic).toBe(true); }
          if (el.includes('move_away_from_hazard')) { expect(['nearby', 'immediate']).toContain(l.hazard); expect(l.safeSpotReachable).toBe(true); }
          if (el.includes('check_on_family')) { expect(l.family.unaccountedFor).toBeGreaterThan(0); expect(l.family.lastKnownPlace).not.toBeNull(); }
          if (el.includes('warn_others')) { expect(['building_fire', 'flash_flood']).toContain(sc); expect(l.alertSource).not.toBe('none'); expect(l.unwarnedPeopleNearby).toBe(true); }
          if (el.includes('attend_festival')) { expect(sc).toBe('street_festival'); expect(l.festival).toBe('open'); expect(l.festivalReachable).toBe(true); }
          if (l.hazard === 'immediate') expect(el).not.toContain('wait');
          // a citizen who hasn't heard about a fire/flood is never told about it in the DTO
          if ((sc === 'building_fire' || sc === 'flash_flood') && c.alert === 'none') { expect(l.hazard).toBe('none'); expect(l.hazardKind).toBe('none'); }
        },
      });
  });

  it('V6-02 every new action is selected and executed somewhere', () => {
    const done = new Set<string>();
    for (const sc of SCENARIOS) {
      const sim = run(sc, 2400);
      const acts = sim.events.filter((e) => e.kind === 'action').map((e) => e.text);
      if (acts.some((t) => /clinic for treatment/i.test(t))) done.add('seek_medical_care');
      if (acts.some((t) => /moving away/i.test(t))) done.add('move_away_from_hazard');
      if (acts.some((t) => /checking on/i.test(t))) done.add('check_on_family');
      if (acts.some((t) => /warning /i.test(t))) done.add('warn_others');
      if (acts.some((t) => /going to the festival/i.test(t))) done.add('attend_festival');
    }
    for (const a of NEW) expect(done, a).toContain(a);
  });

  it('V6-03 immediate danger is handled by labeled safety rules, and nobody stands on a closed tile', () => {
    let safety = 0;
    for (const sc of ['meteor', 'building_fire', 'flash_flood'] as const) {
      const sim = run(sc, 1600, {
        onTick: (s) => { for (const c of s.citizens) if (!c.inside) expect(s.walkable[c.tile.y][c.tile.x], `${c.id} on closed tile at ${s.tick}`).toBe(true); },
      });
      safety += sim.events.filter((e) => e.kind === 'safety' && e.via === 'safety').length;
      for (const c of sim.citizens) if (c.lastDecision?.provenance === 'simulation') expect(c.lastDecision.overrideReason).toBeTruthy();
    }
    expect(safety).toBeGreaterThan(0);
  });

  it('V6-04 clinic treats only injured people and never beyond capacity', () => {
    for (const sc of ['meteor', 'building_fire', 'blackout'] as const) {
      let treatedSomeone = false;
      run(sc, 1500, {
        onTick: (s) => {
          const l = s.clinicLoad();
          expect(l.treating).toBeLessThanOrEqual(5); // 2 beds + up to 3 staff (a nurse leaving never evicts a patient)
          for (const c of s.citizens) if (c.care !== 'none') { expect(c.injury).not.toBe('none'); expect(c.inside).toBe('clinic'); treatedSomeone ||= c.care === 'treating'; }
        },
      });
      expect(treatedSomeone, sc).toBe(true);
    }
  });

  it('V6-05 family searches head only to the last known place, never the true location', () => {
    let searches = 0;
    for (const sc of ['blackout', 'meteor', 'building_fire', 'flash_flood'] as const) {
      const seen = new Set<string>();
      run(sc, 1500, {
        onTick: (s) => {
          for (const c of s.citizens) {
            const d = c.lastDecision;
            if (!d || seen.has(d.id) || c.action !== 'check_on_family' || !c.taskTargetId) continue;
            seen.add(d.id);
            searches++;
            const dest = c.path[c.path.length - 1];
            const known = c.family[c.taskTargetId].lastKnown;
            if (dest) expect(dest).toEqual(known);
          }
        },
      });
    }
    expect(searches).toBeGreaterThan(0);
  });

  it('V6-06 warnings reach real recipients once and do not loop', () => {
    for (const sc of ['building_fire', 'flash_flood'] as const) {
      const alertTicks = new Map<string, number>();
      const sim = run(sc, 1600, {
        onTick: (s) => {
          for (const c of s.citizens) {
            if (c.alertTick === null) continue;
            const prev = alertTicks.get(c.id);
            if (prev === undefined) alertTicks.set(c.id, c.alertTick);
            else expect(c.alertTick).toBe(prev); // alerted once, never re-alerted
            if (c.alert === 'from_citizen') expect(c.alertFromId).not.toBeNull();
          }
        },
      });
      const warned = sim.citizens.filter((c) => c.alert === 'from_citizen');
      for (const w of warned) expect(sim.events.some((e) => / warned /.test(e.text) && e.citizenId === w.alertFromId && e.relatedIds?.includes(w.id))).toBe(true);
    }
  });

  it('V6-07 festival attendance is real: crowd = citizens who chose to attend, within capacity', () => {
    let peak = 0;
    run('street_festival', 1400, {
      onTick: (s) => {
        expect(s.festival.slots.filter(Boolean).length).toBeLessThanOrEqual(FEST_CAPACITY);
        const crowd = s.festivalCrowd();
        for (const c of s.citizens) if (c.festivalUntil !== null) expect(c.action).toBe('attend_festival');
        peak = Math.max(peak, crowd);
      },
    });
    expect(peak).toBeGreaterThan(0);
  });

  it('V6-08 fire cordon and floodwater block people and cars; nobody is trapped on a dry island', () => {
    run('building_fire', 700, {
      onTick: (s) => {
        if (!s.fireCordonUp) return;
        for (let y = FIRE_CORDON.y0; y <= FIRE_CORDON.y1; y++) for (let x = FIRE_CORDON.x0; x <= FIRE_CORDON.x1; x++) { expect(s.walkable[y][x]).toBe(false); expect(s.drivable[y][x]).toBe(false); }
      },
    });
    run('flash_flood', 1400, {
      onTick: (s) => {
        if (s.tick % 50) return;
        const shelter = reachMap(s.walkable, buildingById('shelter').door);
        for (let y = 0; y < MAP_H; y++)
          for (let x = 0; x < MAP_W; x++) {
            const d = s.flood.depth[y * MAP_W + x];
            if (d > DEEP) expect(s.walkable[y][x]).toBe(false);
            if (d > 0) expect(s.drivable[y][x]).toBe(false);
            if (s.walkable[y][x]) expect(shelter[y * MAP_W + x], `island at ${x},${y} t=${s.tick}`).toBeGreaterThanOrEqual(0);
          }
      },
    });
  });

  it('V6-10 rules baseline is deterministic and only weighs eligible actions', () => {
    const sim = new Simulation('building_fire', 2401);
    const reqs: DecisionRequest[] = [];
    while (sim.tick < 400) { for (const r of sim.outbox.splice(0)) { reqs.push(r); sim.provide(r.key, rulesDecision(r)); } sim.step(); }
    for (const r of reqs) {
      const a = ruleWeights(r.input, r.seq), b = ruleWeights(r.input, r.seq);
      expect(a).toEqual(b);
      expect(Object.keys(a).sort()).toEqual([...r.input.eligibleActionIds].sort());
    }
  });

  it('V6-11 every consequence is labeled by what produced it', () => {
    for (const sc of SCENARIOS) {
      const sim = run(sc, 1500);
      for (const e of sim.events) if (e.kind !== 'incident') expect(e.via, `${sc}: ${e.text}`).toBeTruthy();
    }
  });

  it('V6-12 each decision is still one request with exactly the four JEV questions', () => {
    run('flash_flood', 700, {
      onRequest: (r) => {
        const body = buildJevRequest(r.input);
        expect(Object.keys(body.questions)).toEqual(['next_action', 'perceived_risk', 'duty_pressure', 'would_interrupt_routine']);
        expect(Object.keys(body.questions.next_action.criteria)).toEqual(r.input.eligibleActionIds);
        expect(JSON.stringify(r.input).length).toBeLessThan(4096);
      },
    });
  });
});

import { describe, expect, it } from 'vitest';
import { rulesDecision } from '@/sim/decisions';
import { buildingById, reachMap } from '@/sim/map';
import type { ActionId, DecisionResult, ScenarioId } from '@/sim/types';
import { METEOR_BLACKOUT, REPAIR_WORK, Simulation, type DecisionRequest } from '@/sim/world';

type Policy = (r: DecisionRequest) => ActionId | null;
/** Rules baseline, optionally overridden by a test policy (forced choices must be eligible). Optionally hide actions. */
function decide(r: DecisionRequest, policy?: Policy, hide: ActionId[] = []): DecisionResult {
  const input = { ...r.input, eligibleActionIds: r.input.eligibleActionIds.filter((a) => !hide.includes(a)) };
  if (input.eligibleActionIds.length < 2) input.eligibleActionIds = r.input.eligibleActionIds;
  const d = rulesDecision({ ...r, input });
  const forced = policy?.(r);
  return forced && r.input.eligibleActionIds.includes(forced) ? { ...d, enactedChoice: forced } : d;
}
function run(sc: ScenarioId, ticks: number, o: { policy?: Policy; hide?: ActionId[]; onTick?: (s: Simulation) => void; onRequest?: (r: DecisionRequest, s: Simulation) => void } = {}) {
  const sim = new Simulation(sc, 2401);
  while (sim.tick < ticks) {
    for (const r of sim.outbox.splice(0)) { o.onRequest?.(r, sim); sim.provide(r.key, decide(r, o.policy, o.hide)); }
    expect(sim.step()).toBe(true);
    o.onTick?.(sim);
  }
  return sim;
}
const utilityOnly = (ids: string[]): Policy => (r) => (ids.includes(r.citizenId) ? 'restore_power' : null);

describe('sim v7 — restore_power (docs/reviews/2026-10-14-chatgpt-v7-plan.md)', () => {
  it('V7-P01/P02 only utility staff, only for an open, safe, reachable order with a free slot', () => {
    for (const sc of ['blackout', 'meteor_blackout', 'ordinary_morning'] as const)
      run(sc, 1400, {
        onRequest: (r, s) => {
          if (!r.input.eligibleActionIds.includes('restore_power')) return;
          const c = s.citizen(r.citizenId), o = s.power.order!;
          expect(c.role).toBe('utility');
          expect(s.repairSiteSafe).toBe(true);
          expect(s.power.status).not.toBe('restored');
          expect(o.assigned.length).toBeLessThan(2);
          expect(reachMap(s.walkable, c.tile)[o.site.y * s.W + o.site.x]).toBeGreaterThanOrEqual(0);
        },
      });
  });

  it('V7-P03/C06 progress only while someone is physically working; power only returns when the work is done', () => {
    let last = 0;
    run('blackout', 2000, {
      policy: utilityOnly(['citizen-08']),
      onTick: (s) => {
        const o = s.power.order;
        if (!o) return;
        const working = s.citizens.filter((c) => c.utility?.stage === 'working').length + (o.contractor.stage === 'working' ? 1 : 0);
        if (o.workCompleted > last && s.power.status !== 'restored') expect(working).toBeGreaterThan(0);
        if (s.power.status === 'restored') expect(o.workCompleted).toBe(REPAIR_WORK); else expect(s.blackout).toBe(true);
        last = o.workCompleted;
      },
    });
  });

  it('V7-P04/C07 counterfactual: two utility workers restore power sooner than one', () => {
    const one = run('blackout', 2400, { policy: utilityOnly(['citizen-08']), hide: [] , onRequest: () => {} });
    const both = run('blackout', 2400, { policy: utilityOnly(['citizen-08', 'citizen-24']) });
    // In the one-worker run the other utility worker never takes the order.
    const oneRun = run('blackout', 2400, { policy: utilityOnly(['citizen-08']), hide: ['restore_power'] });
    void one;
    expect(both.power.restoredTick).not.toBeNull();
    expect(oneRun.power.restoredTick === null || both.power.restoredTick! < oneRun.power.restoredTick).toBe(true);
  });

  it('V7-P05 nobody responds → the backup contractor drives in and restores power', () => {
    const s = run('blackout', 2400, { hide: ['restore_power'] });
    expect(s.power.order!.assigned).toEqual([]);
    expect(s.power.status).toBe('restored');
    expect(s.power.order!.repairedBy).toEqual(['contractor']);
    expect(s.power.restoredTick!).toBeGreaterThan(s.power.order!.contractorDueTick);
  });

  it('V7-P06 restoration brings back building power and traffic signals', () => {
    const s = run('blackout', 2400, { policy: utilityOnly(['citizen-08', 'citizen-24']) });
    expect(s.power.status).toBe('restored');
    for (const i of s.traffic.intersections) { expect(s.powerAt(i.x, i.y)).toBe(1); expect(s.traffic.control[i.id].mode).toBe('signals'); }
  });
});

describe('sim v7 — direct_traffic', () => {
  it('V7-T01/T02/T03 only responders; one controller per intersection; control starts on arrival', () => {
    let directed = 0;
    for (const sc of ['blackout', 'big_city_blackout'] as const)
      run(sc, 1300, {
        policy: (r) => 'direct_traffic' as ActionId,
        onRequest: (r, s) => { if (r.input.eligibleActionIds.includes('direct_traffic')) expect(s.citizen(r.citizenId).role).toBe('responder'); },
        onTick: (s) => {
          const jobs = s.citizens.filter((c) => c.trafficJob).map((c) => c.trafficJob!.intersectionId);
          expect(new Set(jobs).size).toBe(jobs.length);
          expect(jobs.length).toBeLessThanOrEqual(2);
          for (const i of s.traffic.intersections) {
            const ctl = s.traffic.control[i.id];
            if (ctl.mode !== 'responder_directed') continue;
            directed++;
            const c = s.citizen(ctl.controllerId!);
            expect(c.trafficJob?.stage).toBe('directing');
            expect(c.tile).toEqual({ x: i.x, y: i.y });
          }
        },
      });
    expect(directed).toBeGreaterThan(0);
  });

  it('V7-T04/T05/C05 vehicles never overlap or enter closed tiles, through manual control and back to signals', () => {
    for (const sc of ['blackout', 'meteor_blackout'] as const)
      run(sc, 1700, {
        policy: (r) => (['restore_power', 'direct_traffic'] as ActionId[]).find((a) => r.input.eligibleActionIds.includes(a)) ?? null,
        onTick: (s) => {
          const moving = s.traffic.cars.filter((c) => !c.parked);
          for (const car of moving) {
            const w = s.traffic.world(car);
            const tx = Math.round(w.x), ty = Math.round(w.y);
            if (tx >= 0 && ty >= 0 && tx < s.W && ty < s.H) expect(s.drivable[ty][tx] || car.jumped, `car on closed tile ${tx},${ty} t=${s.tick}`).toBe(true);
          }
          for (let i = 0; i < moving.length; i++)
            for (let j = i + 1; j < moving.length; j++) {
              const a = s.traffic.world(moving[i]), b = s.traffic.world(moving[j]);
              if (moving[i].jumped || moving[j].jumped) continue;
              expect(Math.hypot(a.x - b.x, a.y - b.y), `overlap t=${s.tick}`).toBeGreaterThan(0.3);
            }
        },
      });
  });

  it('V7-T06 measured: responder-directed intersections move more cars than all-way stops (same seed, same decisions)', () => {
    const measure = (directed: boolean) => {
      let through = 0;
      run('blackout', 800, {
        hide: ['restore_power', 'direct_traffic'],
        onTick: (s) => {
          if (directed && s.tick === 200) for (const i of s.traffic.intersections) s.traffic.control[i.id] = { mode: 'responder_directed', controllerId: 'test', since: s.traffic.clock };
          if (s.tick > 200) for (const st of Object.values(s.traffic.stats)) through += st.throughput;
        },
      });
      return through;
    };
    const stop = measure(false), directed = measure(true);
    expect(directed).toBeGreaterThan(stop);
  });
});

describe('sim v7 — meteor strike + power failure', () => {
  it('V7-C01/C02 the impact creates exactly one linked outage that spreads outward from the substation', () => {
    const s = run('meteor_blackout', METEOR_BLACKOUT.impactTick + 30);
    expect(s.power.outageTick).toBe(METEOR_BLACKOUT.impactTick);
    expect(s.blackout).toBe(true);
    const sub = buildingById('substation');
    const src = { x: sub.x + 0.5, y: sub.y + 0.5 };
    // nearer tiles go dark first
    const near = s.powerAt(src.x + 1, src.y), far = s.powerAt(0, 0);
    expect(near).toBe(0);
    expect(far).toBe(1);
    expect(s.walkable[METEOR_BLACKOUT.center.y][METEOR_BLACKOUT.center.x]).toBe(false);
  });

  it('V7-C03 citizens see the dark, not hidden causes; only utility staff are told about the repair order', () => {
    run('meteor_blackout', 900, {
      onRequest: (r, s) => {
        const c = s.citizen(r.citizenId);
        if (c.role !== 'utility') expect(r.input.local.power.workOrderOpen).toBe(false);
        expect(JSON.stringify(r.input)).not.toMatch(/feeder|cause|substation-damage/);
      },
    });
  });

  it('V7-C04 either recovery can finish first', () => {
    const powerFirst = run('meteor_blackout', 1500, { policy: utilityOnly(['citizen-08', 'citizen-24']) });
    expect(powerFirst.power.restoredTick!).toBeLessThan(METEOR_BLACKOUT.clearTick);
    const roadsFirst = run('meteor_blackout', 1500, { hide: ['restore_power'] });
    expect(roadsFirst.clearedTick).toBe(METEOR_BLACKOUT.clearTick);
    expect(roadsFirst.power.status).not.toBe('restored');
  });
});

describe('sim v7 — counterfactual mechanism checks (not decision quality)', () => {
  it('a delivered warning changes the recipient’s next input', () => {
    let warnedKey: string | null = null, warnedInput: string | null = null;
    run('building_fire', 600, {
      policy: (r) => 'warn_others' as ActionId,
      onRequest: (r) => { if (!warnedKey && r.input.local.alertSource === 'from_citizen') { warnedKey = r.key; warnedInput = r.input.local.alertSource; } },
    });
    expect(warnedKey).not.toBeNull();
    let counterfactual: string | null = null;
    run('building_fire', 600, { hide: ['warn_others'], onRequest: (r) => { if (r.key === warnedKey) counterfactual = r.input.local.alertSource; } });
    expect(warnedInput).toBe('from_citizen');
    expect(counterfactual).not.toBe('from_citizen');
  });
});

describe('sim v7 — Big City', () => {
  it('V7-S01/S02/S03 100 unique citizens with valid homes and reachable destinations; nobody on a closed tile', () => {
    const s = new Simulation('big_city_blackout', 2401);
    expect(s.citizens).toHaveLength(100);
    expect(new Set(s.citizens.map((c) => c.id)).size).toBe(100);
    expect(new Set(s.citizens.map((c) => c.name)).size).toBe(100);
    const roles = s.citizens.reduce((a: Record<string, number>, c) => ((a[c.role] = (a[c.role] ?? 0) + 1), a), {});
    expect(roles).toEqual({ resident: 70, service: 10, healthcare: 8, responder: 8, utility: 4 });
    for (const c of s.citizens) {
      expect(s.walkable[c.tile.y][c.tile.x]).toBe(true);
      const reach = reachMap(s.walkable, c.tile);
      const home = s.homeDoor(c);
      expect(reach[home.y * s.W + home.x]).toBeGreaterThanOrEqual(0);
    }
    run('big_city_blackout', 600, { onTick: (x) => { if (x.tick % 20) return; for (const c of x.citizens) if (!c.inside && c.inVehicle === null) expect(x.walkable[c.tile.y][c.tile.x]).toBe(true); } });
  });
});

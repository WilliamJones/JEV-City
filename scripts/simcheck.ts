/** Dev check: run every scenario headless with the rules baseline and summarize what happened. */
import { rulesDecision } from '../src/sim/decisions';
import { SCENARIOS } from '../src/sim/types';
import { Simulation } from '../src/sim/world';

const TICKS = Number(process.argv[2] ?? 2400);
for (const sc of (process.argv[3] ? process.argv[3].split(',') : SCENARIOS) as typeof SCENARIOS) {
  const t0 = Date.now();
  const sim = new Simulation(sc, 2401);
  const eligible: Record<string, number> = {}, chosen: Record<string, number> = {};
  let reqs = 0, single = 0;
  while (sim.tick < TICKS) {
    for (const r of sim.outbox.splice(0)) {
      reqs++;
      for (const a of r.input.eligibleActionIds) eligible[a] = (eligible[a] ?? 0) + 1;
      const d = rulesDecision(r);
      chosen[d.enactedChoice] = (chosen[d.enactedChoice] ?? 0) + 1;
      sim.provide(r.key, d);
    }
    if (!sim.step()) throw new Error('stall');
  }
  single = sim.events.filter((e) => e.via === 'safety').length;
  const effects = sim.events.filter((e) => e.kind !== 'action').map((e) => `${e.tick} ${e.text}`);
  console.log(`\n== ${sc}: ${reqs} requests, ${single} safety events, ${Date.now() - t0}ms`);
  console.log(' eligible:', JSON.stringify(eligible));
  console.log(' chosen  :', JSON.stringify(chosen));
  console.log(effects.filter((e) => /power|Power|utility|substation|traffic|intersection|grid|crew|van/i.test(e)).slice(0, 40).join('\n'));
  const st = Object.entries(sim.traffic.stats).map(([k, v]) => `${k}:${v.queued}`).join(' ');
  console.log(' power:', sim.power.status, 'restoredTick', sim.power.restoredTick, 'work', sim.power.order?.workCompleted, ' queues@end', st);
}

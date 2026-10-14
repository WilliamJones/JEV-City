/**
 * Runs scenarios headless with LIVE JEV decisions and records them.
 *   npx tsx scripts/record.ts --ticks 2400 --out public/replays      (record replays)
 *   npx tsx scripts/record.ts --ticks 300 --phase0                    (Phase 0 spike report)
 * Reads TYPESAFE_API_KEY from .env.local. Never prints the key.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { callJev, estimateCostUsd } from '../src/jev/client';
import { PINNED_MODEL } from '../src/jev/contract';
import { jevDecision, rulesDecision } from '../src/sim/decisions';
import { Simulation, SCENARIO_META } from '../src/sim/world';
import { SCENARIOS, type DecisionResultV1, type ScenarioId } from '../src/sim/types';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) throw new Error('TYPESAFE_API_KEY missing in .env.local');

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const TICKS = Number(arg('ticks', '2400'));
const OUT = arg('out', '');
const SEED = Number(arg('seed', '2401'));
const ONLY = arg('scenario', '');
const PHASE0 = process.argv.includes('--phase0');

type Sample = { scenario: ScenarioId; ok: boolean; ms: number | null; errorClass?: string; inTok?: number; outTok?: number; model?: string; top?: string; maxP?: number };

async function runScenario(scenario: ScenarioId) {
  const sim = new Simulation(scenario, SEED);
  const decisions: DecisionResultV1[] = [];
  const samples: Sample[] = [];
  const inflight = new Map<string, Promise<void>>();
  const t0 = Date.now();
  while (sim.tick < TICKS) {
    for (const req of sim.outbox.splice(0)) {
      const p = callJev(req.input, { apiKey: apiKey!, model: PINNED_MODEL }).then((r) => {
        let d: DecisionResultV1;
        if (r.ok) {
          d = jevDecision(req, r.value, r.requestedModel, r.upstreamMs, estimateCostUsd(r.value.usage));
          const probs = Object.values(r.value.answers.next_action.probabilities);
          samples.push({ scenario, ok: true, ms: r.upstreamMs, inTok: r.value.usage.input_tokens, outTok: r.value.usage.output_tokens, model: r.value.model, top: r.value.answers.next_action.choice, maxP: Math.max(...probs) });
        } else {
          d = rulesDecision(req, 'fallback', r.errorClass);
          samples.push({ scenario, ok: false, ms: r.upstreamMs, errorClass: r.errorClass });
        }
        decisions.push(d);
        sim.provide(req.key, d);
        inflight.delete(req.key);
      });
      inflight.set(req.key, p);
    }
    if (!sim.step()) await Promise.race(inflight.values());
  }
  await Promise.all(inflight.values());
  console.log(`${scenario}: ${sim.tick} ticks, ${decisions.length} decisions in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { sim, decisions, samples };
}

const pct = (s: number[], p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];

async function main() {
  const scenarios = ONLY ? [ONLY as ScenarioId] : [...SCENARIOS];
  const all: Sample[] = [];
  for (const sc of scenarios) {
    const { decisions, samples } = await runScenario(sc);
    all.push(...samples);
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      const log = {
        format: 'jev-city-replay-v1',
        scenario: sc,
        title: SCENARIO_META[sc].title,
        seed: SEED,
        ticks: TICKS,
        recordedAt: new Date().toISOString(),
        requestedModel: PINNED_MODEL,
        decisions: decisions.sort((a, b) => a.id.localeCompare(b.id)),
      };
      writeFileSync(`${OUT}/${sc}.json`, JSON.stringify(log));
      console.log(`  wrote ${OUT}/${sc}.json (${decisions.length} decisions)`);
    }
  }
  const ok = all.filter((s) => s.ok);
  const ms = ok.map((s) => s.ms!).sort((a, b) => a - b);
  const errors: Record<string, number> = {};
  for (const s of all.filter((x) => !x.ok)) errors[s.errorClass!] = (errors[s.errorClass!] ?? 0) + 1;
  const tops: Record<string, number> = {};
  for (const s of ok) tops[s.top!] = (tops[s.top!] ?? 0) + 1;
  const decisive = ok.filter((s) => s.maxP! >= 0.95).length;
  const summary = {
    seed: SEED,
    ticksPerScenario: TICKS,
    requests: all.length,
    succeeded: ok.length,
    failed: all.length - ok.length,
    errors,
    resolvedModels: [...new Set(ok.map((s) => s.model))],
    upstreamMs: ms.length ? { n: ms.length, min: ms[0], p50: pct(ms, 50), p95: pct(ms, 95), max: ms[ms.length - 1] } : null,
    tokens: ok.length ? { meanInput: Math.round(ok.reduce((a, s) => a + s.inTok!, 0) / ok.length), meanOutput: Math.round(ok.reduce((a, s) => a + s.outTok!, 0) / ok.length) } : null,
    topChoiceCounts: tops,
    decisiveShare: ok.length ? Math.round((decisive / ok.length) * 100) / 100 : null,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (PHASE0) writeFileSync('docs/phase0-results.json', JSON.stringify({ capturedAt: new Date().toISOString(), note: 'Measured upstream round-trip from a developer laptop (concurrent requests); not browser time.', ...summary }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

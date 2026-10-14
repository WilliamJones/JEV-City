/**
 * JEV vs conventional LLMs vs rules on identical citizen snapshots.
 *   npx tsx scripts/benchmark.ts --trials 3
 * Writes public/benchmark/results.json (every call) and prints a summary.
 * Keys come from .env.local and are never printed.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ACTION_CRITERIA, buildJevRequest, PINNED_MODEL } from '../src/jev/contract';
import { rulesDecision } from '../src/sim/decisions';
import { argmax, ruleWeights } from '../src/sim/rules';
import { createRng } from '../src/sim/rng';
import { SCENARIOS, type CitizenDecisionInputV1 } from '../src/sim/types';
import { Simulation, SIM_VERSION, type DecisionRequest } from '../src/sim/world';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const TRIALS = Number(arg('trials', '3'));
const PER_SCENARIO = Number(arg('per-scenario', '20'));
const CONCURRENCY = Number(arg('concurrency', '4'));
const LLMS = arg('llms', 'openai/gpt-4o-mini,google/gemini-2.5-flash').split(',');
const JEV_PRICE_IN = 0.042; // USD per 1M input tokens, docs.typesafe.ai/models (2026-10-13); output free

// ---------- 1. Fixed snapshot suite (deterministic) ----------
function collectSnapshots(): CitizenDecisionInputV1[] {
  const out: CitizenDecisionInputV1[] = [];
  for (const sc of SCENARIOS) {
    const sim = new Simulation(sc, 2401);
    const pool: DecisionRequest[] = [];
    while (sim.tick < 1600) {
      for (const r of sim.outbox.splice(0)) { pool.push(r); sim.provide(r.key, rulesDecision(r)); }
      sim.step();
    }
    // Stratify: prefer incident-time snapshots with ≥3 eligible actions, spread across citizens and time.
    const rng = createRng(77 + sc.length);
    const interesting = pool.filter((r) => r.input.eligibleActionIds.length >= 3);
    const picked: DecisionRequest[] = [];
    const seen = new Set<string>();
    const shuffled = [...interesting].sort(() => rng.next() - 0.5);
    for (const r of shuffled) {
      if (picked.length >= PER_SCENARIO) break;
      const key = `${r.citizenId}`;
      if (seen.has(key) && picked.length < PER_SCENARIO * 0.8) continue;
      seen.add(key);
      picked.push(r);
    }
    out.push(...picked.sort((a, b) => a.requestTick - b.requestTick).map((r) => r.input));
  }
  return out;
}

// ---------- 2. Engines ----------
type Track = 'A' | 'B';
const TRACKS: Track[] = ['A', 'B'];
const TRACK_INFO = {
  A: 'Action selection: LLMs return only the chosen action (strict enum). JEV answers one Choice question.',
  B: 'Action + uncertainty: LLMs return the action and a probability for every eligible action (what the JEV City inspector needs). JEV answers one Choice question, whose distribution is native.',
};
type Outcome = {
  track: Track; engine: string; snapshot: number; trial: number; ok: boolean; errorClass?: string;
  ms: number | null; choice?: string; probabilities?: Record<string, number>; probabilitySource?: 'model-native' | 'model-reported' | 'heuristic';
  inputTokens?: number; outputTokens?: number; costUsd?: number | null; costSource?: string; resolvedModel?: string; at: string;
};

/** Same single task as the LLMs: one Choice question over the eligible actions. */
async function runJev(input: CitizenDecisionInputV1): Promise<Omit<Outcome, 'track' | 'engine' | 'snapshot' | 'trial' | 'at'>> {
  const full = buildJevRequest(input, PINNED_MODEL);
  const body = { model: full.model, state: full.state, questions: { next_action: full.questions.next_action } };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  const t0 = performance.now();
  try {
    const res = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) return { ok: false, errorClass: `http_${res.status}`, ms };
    const data = await res.json();
    const na = data?.answers?.next_action;
    const keys = Object.keys(na?.probabilities ?? {});
    const valid = na?.type === 'choice' && input.eligibleActionIds.includes(na.choice) && keys.length === input.eligibleActionIds.length
      && keys.every((k) => input.eligibleActionIds.includes(k as never)) && Object.values(na.probabilities as Record<string, number>).every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
    if (!valid) return { ok: false, errorClass: 'schema_violation', ms, resolvedModel: data?.model };
    const inTok = data.usage?.input_tokens ?? 0;
    return {
      ok: true, ms, choice: na.choice, probabilities: na.probabilities, probabilitySource: 'model-native',
      inputTokens: inTok, outputTokens: data.usage?.output_tokens, costUsd: (inTok * JEV_PRICE_IN) / 1e6,
      costSource: 'tokens × documented tariff ($0.042/M input, output free)', resolvedModel: data.model,
    };
  } catch (e) {
    return { ok: false, errorClass: e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'network_error', ms: null };
  } finally {
    clearTimeout(timer);
  }
}

function llmPrompt(input: CitizenDecisionInputV1, track: Track) {
  const options = input.eligibleActionIds.map((id) => `- ${id}: ${ACTION_CRITERIA[id]}`).join('\n');
  return `You are deciding the next action for a simulated citizen in a city simulation.\n\nCitizen state (JSON):\n${JSON.stringify(input)}\n\nWhich eligible next action best matches their current circumstances, needs, role and traits? Use only these eligible actions; do not assume unstated paths or capabilities:\n${options}\n\n${track === 'A' ? 'Return only the chosen action.' : 'Return the chosen action and your probability for every eligible action (probabilities sum to 1).'}`;
}

async function runLlm(model: string, input: CitizenDecisionInputV1, track: Track): Promise<Omit<Outcome, 'track' | 'engine' | 'snapshot' | 'trial' | 'at'>> {
  const props: Record<string, unknown> = {};
  for (const id of input.eligibleActionIds) props[id] = { type: 'number' };
  const body = {
    model,
    messages: [{ role: 'user', content: llmPrompt(input, track) }],
    temperature: 0.2,
    max_tokens: track === 'A' ? 60 : 300,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'decision', strict: true,
        schema: track === 'A'
          ? { type: 'object', additionalProperties: false, required: ['action'], properties: { action: { type: 'string', enum: input.eligibleActionIds } } }
          : {
              type: 'object', additionalProperties: false, required: ['action', 'probabilities'],
              properties: {
                action: { type: 'string', enum: input.eligibleActionIds },
                probabilities: { type: 'object', additionalProperties: false, required: input.eligibleActionIds, properties: props },
              },
            },
      },
    },
    provider: { require_parameters: true, allow_fallbacks: false },
    usage: { include: true },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  const t0 = performance.now();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'JEV City benchmark' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) return { ok: false, errorClass: `http_${res.status}`, ms };
    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? '';
    let parsed: { action?: string; probabilities?: Record<string, number> };
    try { parsed = JSON.parse(text); } catch { return { ok: false, errorClass: 'schema_violation: not JSON', ms, resolvedModel: data.model }; }
    if (track === 'A') {
      if (typeof parsed.action !== 'string' || !input.eligibleActionIds.includes(parsed.action as never)) return { ok: false, errorClass: 'schema_violation', ms, resolvedModel: data.model };
      return {
        ok: true, ms, choice: parsed.action, inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens,
        costUsd: typeof data.usage?.cost === 'number' ? data.usage.cost : null, costSource: 'OpenRouter-reported usage.cost', resolvedModel: data.model,
      };
    }
    const keys = Object.keys(parsed.probabilities ?? {});
    const valid = typeof parsed.action === 'string' && input.eligibleActionIds.includes(parsed.action as never)
      && keys.length === input.eligibleActionIds.length && keys.every((k) => input.eligibleActionIds.includes(k as never))
      && Object.values(parsed.probabilities!).every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
    const sum = Object.values(parsed.probabilities ?? {}).reduce((a, b) => a + b, 0);
    if (!valid) return { ok: false, errorClass: 'schema_violation', ms, resolvedModel: data.model };
    if (Math.abs(sum - 1) > 0.05) return { ok: false, errorClass: 'probabilities_do_not_sum_to_1', ms, resolvedModel: data.model };
    return {
      ok: true, ms, choice: parsed.action, probabilities: parsed.probabilities, probabilitySource: 'model-reported',
      inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens,
      costUsd: typeof data.usage?.cost === 'number' ? data.usage.cost : null, costSource: 'OpenRouter-reported usage.cost', resolvedModel: data.model,
    };
  } catch (e) {
    return { ok: false, errorClass: e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'network_error', ms: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Fixed seed per snapshot: the benchmark rules baseline is fully deterministic on identical inputs. */
function runRules(input: CitizenDecisionInputV1): Omit<Outcome, 'track' | 'engine' | 'snapshot' | 'trial' | 'at'> {
  const t0 = performance.now();
  const w = ruleWeights(input, 0);
  const ms = performance.now() - t0;
  return { ok: true, ms: Math.round(ms * 1000) / 1000, choice: argmax(w), probabilities: w, probabilitySource: 'heuristic', costUsd: 0, costSource: 'local compute' };
}

// ---------- 3. Run (randomized order, bounded concurrency) ----------
const pct = (s: number[], p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null);

async function main() {
  if (!process.env.TYPESAFE_API_KEY || !process.env.OPENROUTER_API_KEY) throw new Error('TYPESAFE_API_KEY and OPENROUTER_API_KEY required');
  const snapshots = collectSnapshots();
  const engines = ['jev', ...LLMS];
  const tasks: { track: Track; engine: string; snapshot: number; trial: number }[] = [];
  for (const track of TRACKS) for (let s = 0; s < snapshots.length; s++) for (let t = 0; t < TRIALS; t++) for (const e of engines) tasks.push({ track, engine: e, snapshot: s, trial: t });
  const rng = createRng(20261014);
  for (let i = tasks.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [tasks[i], tasks[j]] = [tasks[j], tasks[i]]; }

  console.log(`${TRACKS.length} tracks × ${snapshots.length} snapshots × ${TRIALS} trials × ${engines.length} remote engines = ${tasks.length} calls (+ rules locally)`);
  const outcomes: Outcome[] = [];
  let next = 0, done = 0;
  const startedAt = new Date().toISOString();
  async function worker() {
    while (next < tasks.length) {
      const t = tasks[next++];
      const input = snapshots[t.snapshot];
      const r = t.engine === 'jev' ? await runJev(input) : await runLlm(t.engine, input, t.track);
      outcomes.push({ ...t, ...r, at: new Date().toISOString() });
      if (++done % 50 === 0) console.log(`  ${done}/${tasks.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  for (const track of TRACKS) for (let s = 0; s < snapshots.length; s++) for (let t = 0; t < TRIALS; t++) outcomes.push({ track, engine: 'rules', snapshot: s, trial: t, ...runRules(snapshots[s]), at: new Date().toISOString() });

  const summarize = (track: Track) => ['jev', ...LLMS, 'rules'].map((engine) => {
    const rows = outcomes.filter((o) => o.track === track && o.engine === engine);
    const ok = rows.filter((o) => o.ok);
    const ms = ok.map((o) => o.ms!).sort((a, b) => a - b);
    // consistency: share of snapshots where all trials chose the same action
    let consistent = 0, counted = 0;
    for (let s = 0; s < snapshots.length; s++) {
      const choices = ok.filter((o) => o.snapshot === s).map((o) => o.choice);
      if (choices.length === TRIALS) { counted++; if (new Set(choices).size === 1) consistent++; }
    }
    const costs = ok.map((o) => o.costUsd).filter((c): c is number => typeof c === 'number');
    const errors: Record<string, number> = {};
    for (const o of rows.filter((x) => !x.ok)) errors[o.errorClass!] = (errors[o.errorClass!] ?? 0) + 1;
    return {
      engine,
      kind: engine === 'jev' ? 'TypeSafe JEV (direct API)' : engine === 'rules' ? 'Hand-written rules (local)' : 'Conventional LLM via OpenRouter',
      resolvedModels: [...new Set(ok.map((o) => o.resolvedModel).filter(Boolean))],
      attempted: rows.length,
      valid: ok.length,
      schemaCompliance: rows.length ? ok.length / rows.length : null,
      latencyMs: { n: ms.length, p50: pct(ms, 50), p95: pct(ms, 95), boundary: engine === 'rules' ? 'in-process function call (not comparable to network calls)' : 'HTTPS round-trip from the benchmark host' },
      consistency: counted ? consistent / counted : null,
      meanCostPerDecisionUsd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
      costSource: ok[0]?.costSource ?? null,
      meanInputTokens: ok.some((o) => o.inputTokens) ? Math.round(ok.reduce((a, o) => a + (o.inputTokens ?? 0), 0) / ok.length) : null,
      probabilitySource: ok[0]?.probabilitySource ?? (engine === 'jev' ? 'model-native' : 'none (action only)'),
      errors,
    };
  });

  // agreement with JEV's modal choice per snapshot (descriptive only — not a quality score)
  const modal = (track: Track, engine: string, s: number) => {
    const c = outcomes.filter((o) => o.track === track && o.engine === engine && o.snapshot === s && o.ok).map((o) => o.choice!);
    const counts = new Map<string, number>();
    for (const x of c) counts.set(x, (counts.get(x) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const agreementFor = (track: Track) => {
    const agreement: Record<string, number> = {};
    for (const e of [...LLMS, 'rules']) {
      let same = 0, n = 0;
      for (let s = 0; s < snapshots.length; s++) { const a = modal(track, 'jev', s), b = modal(track, e, s); if (a && b) { n++; if (a === b) same++; } }
      agreement[e] = n ? same / n : 0;
    }
    return agreement;
  };
  const tracks = Object.fromEntries(TRACKS.map((t) => [t, { description: TRACK_INFO[t], summary: summarize(t), agreementWithJevModalChoice: agreementFor(t) }]));

  const result = {
    format: 'jev-city-benchmark-v2',
    startedAt,
    finishedAt: new Date().toISOString(),
    environment: { host: 'developer laptop (macOS), residential network', node: process.version, concurrency: CONCURRENCY, simVersion: SIM_VERSION },
    method: {
      snapshots: snapshots.length, trialsPerSnapshot: TRIALS,
      order: 'all (track, engine, snapshot, trial) tasks shuffled together with a fixed seed, then run with bounded concurrency',
      sameInputs: 'every engine receives the identical citizen state and the identical eligible-action set',
      jev: `POST api.typesafe.ai/v1/systemone, model ${PINNED_MODEL}, one Choice question over the eligible actions (same task as the LLMs)`,
      llm: 'OpenRouter chat completions, strict JSON Schema (Track A: action enum only; Track B: action enum + probability per action), temperature 0.2, require_parameters, no provider fallbacks',
      rules: 'deterministic hand-written heuristic with a fixed seed per snapshot (the city itself uses seeded jitter for variety)',
      scope: 'Choice-only requests measured on fixed city snapshots, not full four-question JEV City transactions. Results depend on model, provider routing and benchmark environment.',
      caveats: [
        'LLM probabilities are model-reported estimates, not calibrated probabilities; JEV probabilities are native model output.',
        'Schema-valid is not the same as correct. Decision quality requires blind rating and is not yet evaluated.',
        'Rules latency is an in-process function call and is not comparable to network round-trips.',
        'Both engines get the same state JSON and the same action descriptions; the LLM additionally receives a natural-language instruction wrapper.',
        'Latency depends on network, region and provider load at the time of the run.',
      ],
    },
    tracks,
    snapshots,
    outcomes,
  };
  mkdirSync('public/benchmark', { recursive: true });
  writeFileSync('public/benchmark/results.json', JSON.stringify(result));
  for (const t of TRACKS) {
    console.log(`Track ${t}`);
    for (const r of tracks[t].summary) console.log(`  ${r.engine.padEnd(24)} valid ${r.valid}/${r.attempted}  p50 ${r.latencyMs.p50}  p95 ${r.latencyMs.p95}  consistency ${r.consistency?.toFixed(2)}  cost ${r.meanCostPerDecisionUsd}  errors ${JSON.stringify(r.errors)}`);
    console.log('  agreement', JSON.stringify(tracks[t].agreementWithJevModalChoice));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

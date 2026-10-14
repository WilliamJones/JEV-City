import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'JEV City benchmark — JEV vs conventional LLMs',
  description: 'The same 60 citizen decisions, three trials each: TypeSafe JEV vs gpt-4o-mini vs gemini-2.5-flash vs rules. Every call measured and published.',
};

type Summary = {
  engine: string;
  kind: string;
  resolvedModels: string[];
  attempted: number;
  valid: number;
  schemaCompliance: number | null;
  latencyMs: { n: number; p50: number | null; p95: number | null; boundary: string };
  consistency: number | null;
  meanCostPerDecisionUsd: number | null;
  costSource: string | null;
  meanInputTokens: number | null;
  probabilitySource: string | null;
  errors: Record<string, number>;
};
type Track = { description: string; summary: Summary[]; agreementWithJevModalChoice: Record<string, number> };
type Results = {
  startedAt: string;
  finishedAt: string;
  environment: Record<string, string | number>;
  method: { snapshots: number; trialsPerSnapshot: number; order: string; sameInputs: string; jev: string; llm: string; rules: string; scope: string; caveats: string[] };
  tracks: Record<'A' | 'B', Track>;
};

const LABEL: Record<string, string> = { jev: 'TypeSafe JEV', 'openai/gpt-4o-mini': 'gpt-4o-mini', 'google/gemini-2.5-flash': 'gemini-2.5-flash', rules: 'Rules baseline' };
const label = (e: string) => LABEL[e] ?? e;

function Bars({ title, unit, rows, format, note }: { title: string; unit: string; rows: { engine: string; value: number }[]; format: (v: number) => string; note?: string }) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <figure className="panel p-5">
      <figcaption className="mb-4">
        <h3 className="font-[family-name:var(--font-display)] text-base font-bold">{title}</h3>
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{unit}{note ? ` · ${note}` : ''}</p>
      </figcaption>
      <ul className="space-y-3">
        {rows.map((r) => {
          const jev = r.engine === 'jev';
          return (
            <li key={r.engine} className="grid grid-cols-[120px_1fr] items-center gap-3 text-sm" title={`${label(r.engine)}: ${format(r.value)}`}>
              <span className={jev ? 'font-bold' : ''} style={{ color: jev ? 'var(--ink)' : 'var(--ink-soft)' }}>{label(r.engine)}</span>
              <span className="flex items-center gap-2">
                <span className="block h-3 rounded-r" style={{ width: `${Math.max(0.6, (r.value / max) * 78)}%`, background: jev ? 'var(--teal)' : 'var(--ink-faint)', opacity: jev ? 1 : 0.55 }} />
                <span className="whitespace-nowrap font-[family-name:var(--font-mono)] text-xs tabular-nums" style={{ color: 'var(--ink)' }}>{format(r.value)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

export default async function BenchmarkPage({ searchParams }: { searchParams: Promise<{ track?: string }> }) {
  const data = JSON.parse(readFileSync(path.join(process.cwd(), 'public/benchmark/results.json'), 'utf8')) as Results;
  const trackId: 'A' | 'B' = (await searchParams).track === 'B' ? 'B' : 'A';
  const track = data.tracks[trackId];
  const summary = track.summary;
  const remote = summary.filter((s) => s.engine !== 'rules');
  const jev = summary.find((s) => s.engine === 'jev')!;
  const llms = remote.filter((s) => s.engine !== 'jev');
  const fastestLlmP50 = Math.min(...llms.map((s) => s.latencyMs.p50!));
  const cheapestLlm = Math.min(...llms.map((s) => s.meanCostPerDecisionUsd!));
  // ratio "N× faster" uses medians from this track only
  const total = (['A', 'B'] as const).reduce((a, t) => a + data.tracks[t].summary.reduce((b, s) => b + s.attempted, 0), 0);
  const ms = (v: number) => `${Math.round(v).toLocaleString()} ms`;
  const usd1k = (v: number) => `$${(v * 1000).toFixed(3)}`;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <main className="sky min-h-dvh px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">JEV<span style={{ color: 'var(--teal)' }}>·</span>CITY</Link>
          <a href="/benchmark/results.json" download className="chip px-3 py-1.5 text-xs font-semibold">Download every call (JSON)</a>
        </header>

        <section className="panel p-6 sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-faint)' }}>Benchmark · {new Date(data.startedAt).toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight sm:text-4xl">The same {data.method.snapshots} citizen decisions, asked {data.method.trialsPerSnapshot} times each.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            Every engine got the identical citizen state and the identical set of feasible actions from the JEV City simulation. {total.toLocaleString()} decisions across two tracks, all measured — nothing estimated from documentation.
          </p>
          <nav className="chip mt-5 inline-flex p-1" aria-label="Benchmark track">
            {(['A', 'B'] as const).map((t) => (
              <Link key={t} href={`/benchmark?track=${t}`} scroll={false} aria-current={t === trackId ? 'page' : undefined} className="rounded-full px-3 py-1 text-xs font-semibold" style={t === trackId ? { background: 'var(--panel-solid)', boxShadow: 'var(--shadow)' } : { color: 'var(--ink-soft)' }}>
                {t === 'A' ? 'Track A · action only' : 'Track B · action + probabilities'}
              </Link>
            ))}
          </nav>
          <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>{track.description}</p>
          <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              [`${(fastestLlmP50 / jev.latencyMs.p50!).toFixed(0)}× faster`, `JEV median ${ms(jev.latencyMs.p50!)} vs fastest LLM ${ms(fastestLlmP50)}`],
              [`${(cheapestLlm / jev.meanCostPerDecisionUsd!).toFixed(1)}× cheaper`, `per decision vs the cheapest LLM tested`],
              [`${jev.valid}/${jev.attempted} valid`, `JEV schema-valid answers in this track (per engine; LLM failures listed below)`],
            ].map(([big, small]) => (
              <div key={big} className="chip rounded-2xl px-4 py-3" style={{ borderRadius: 16 }}>
                <dt className="font-[family-name:var(--font-display)] text-2xl font-bold" style={{ color: 'var(--teal)' }}>{big}</dt>
                <dd className="text-xs" style={{ color: 'var(--ink-soft)' }}>{small}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
            Measured on {data.method.snapshots} fixed city snapshots × {data.method.trialsPerSnapshot} trials per engine. {data.method.scope}
          </p>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <Bars title="Median latency (p50)" unit="HTTPS round-trip from the benchmark host" rows={remote.map((s) => ({ engine: s.engine, value: s.latencyMs.p50! }))} format={ms} />
          <Bars title="Tail latency (p95)" unit="HTTPS round-trip from the benchmark host" rows={remote.map((s) => ({ engine: s.engine, value: s.latencyMs.p95! }))} format={ms} />
          <Bars title="Cost per 1,000 decisions" unit="USD" note="JEV: tokens × published tariff; LLMs: OpenRouter-reported cost" rows={remote.map((s) => ({ engine: s.engine, value: s.meanCostPerDecisionUsd! }))} format={usd1k} />
          <Bars title="Same answer on all 3 trials" unit="share of snapshots" note="higher = more repeatable; not a quality score" rows={summary.map((s) => ({ engine: s.engine, value: s.consistency ?? 0 }))} format={pct} />
        </div>

        <section className="panel overflow-x-auto p-5">
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-bold">All numbers</h2>
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead style={{ color: 'var(--ink-faint)' }}>
              <tr>{['Engine', 'Resolved model', 'Valid', 'p50', 'p95', 'Consistency', 'Cost / decision', 'Mean input tokens', 'Probabilities', 'Failures', 'Agrees with JEV'].map((h) => <th key={h} className="pb-2 pr-3 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="font-[family-name:var(--font-mono)] tabular-nums">
              {summary.map((s) => (
                <tr key={s.engine} style={{ borderTop: '1px solid var(--panel-border)' }}>
                  <td className="py-2 pr-3 font-[family-name:var(--font-inter)] font-semibold">{label(s.engine)}</td>
                  <td className="py-2 pr-3">{s.resolvedModels.join(', ') || '—'}</td>
                  <td className="py-2 pr-3">{s.valid}/{s.attempted}</td>
                  <td className="py-2 pr-3">{s.engine === 'rules' ? `${s.latencyMs.p50} ms*` : ms(s.latencyMs.p50!)}</td>
                  <td className="py-2 pr-3">{s.engine === 'rules' ? `${s.latencyMs.p95} ms*` : ms(s.latencyMs.p95!)}</td>
                  <td className="py-2 pr-3">{s.consistency !== null ? pct(s.consistency) : '—'}</td>
                  <td className="py-2 pr-3">{s.meanCostPerDecisionUsd !== null ? `$${s.meanCostPerDecisionUsd.toFixed(6)}` : '—'}</td>
                  <td className="py-2 pr-3">{s.meanInputTokens ?? '—'}</td>
                  <td className="py-2 pr-3 font-[family-name:var(--font-inter)]">{s.probabilitySource}</td>
                  <td className="py-2 pr-3">{Object.entries(s.errors).map(([k, v]) => `${k} ×${v}`).join(', ') || '0'}</td>
                  <td className="py-2 pr-3">{s.engine === 'jev' ? '—' : pct(track.agreementWithJevModalChoice[s.engine] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px]" style={{ color: 'var(--ink-faint)' }}>* Rules run in-process; their timing is a local function call and is not comparable to network round-trips. “Agrees with JEV” compares modal choices per snapshot — it describes similarity, not correctness.</p>
        </section>

        <section className="panel p-6">
          <h2 className="font-[family-name:var(--font-display)] text-base font-bold">What this does and doesn’t show</h2>
          <div className="mt-3 grid gap-6 text-sm md:grid-cols-2" style={{ color: 'var(--ink-soft)' }}>
            <div>
              <h3 className="mb-1 font-semibold" style={{ color: 'var(--ink)' }}>Method</h3>
              <ul className="list-disc space-y-1 pl-4">
                <li>{data.method.sameInputs.charAt(0).toUpperCase() + data.method.sameInputs.slice(1)}.</li>
                <li>JEV: {data.method.jev}.</li>
                <li>LLMs: {data.method.llm}.</li>
                <li>Rules: {data.method.rules}.</li>
                <li>Order: {data.method.order}; concurrency {String(data.environment.concurrency)}.</li>
                <li>Host: {String(data.environment.host)}, Node {String(data.environment.node)}.</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-1 font-semibold" style={{ color: 'var(--ink)' }}>Caveats</h3>
              <ul className="list-disc space-y-1 pl-4">
                {data.method.caveats.map((c) => <li key={c}>{c}</li>)}
                <li><b style={{ color: 'var(--ink)' }}>Decision quality: not yet evaluated.</b> A blind human rating against a behavioral rubric is pending; until then we make no claim about which engine decides “better”.</li>
              </ul>
            </div>
          </div>
        </section>

        <footer className="pb-6 text-center text-xs" style={{ color: 'var(--ink-faint)' }}>
          <Link href="/" className="underline">Back to the city</Link> · Reproduce with <code className="font-[family-name:var(--font-mono)]">npx tsx scripts/benchmark.ts --trials 3</code>
        </footer>
      </div>
    </main>
  );
}

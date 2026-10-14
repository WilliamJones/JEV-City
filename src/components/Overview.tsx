'use client';
import type { Controller } from '@/client/controller';
import { ACTION_COLOR, ACTION_LABEL, hex } from '@/client/palette';
import { ACTION_IDS } from '@/sim/types';
import { SCENARIO_META } from '@/sim/world';

const ms = (v: number | null) => (v === null ? 'Not measured' : `${v} ms`);

export function Overview({ ctrl }: { ctrl: Controller }) {
  const sim = ctrl.sim;
  const counts = Object.fromEntries(ACTION_IDS.map((a) => [a, 0])) as Record<string, number>;
  for (const c of sim.citizens) if (c.action && !c.needsHelp) counts[c.action]++;
  const needy = sim.citizens.filter((c) => c.needsHelp).length;
  const decided = sim.citizens.filter((c) => c.lastDecision).length;
  const total = sim.citizens.length;
  const live = ctrl.liveStats();
  const rep = ctrl.replayStats();

  return (
    <div>
      <div className="px-5 pb-3 pt-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">{SCENARIO_META[sim.scenario].title}</h2>
        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
          {SCENARIO_META[sim.scenario].blurb} 25 citizens each decide what to do next with JEV. Click anyone to see exactly what JEV returned.
        </p>
      </div>

      <section className="px-5 py-3" style={{ borderTop: '1px solid var(--panel-border)' }}>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>What the city is doing</h3>
        <div className="mb-2 flex h-3 overflow-hidden rounded-full" style={{ background: 'var(--track)' }} aria-hidden>
          {ACTION_IDS.map((a) => counts[a] > 0 && <div key={a} style={{ width: `${(counts[a] / total) * 100}%`, background: hex(ACTION_COLOR[a]) }} className="transition-all duration-500" />)}
          {needy > 0 && <div style={{ width: `${(needy / total) * 100}%`, background: 'repeating-linear-gradient(45deg,#f17961,#f17961 3px,#fff 3px,#fff 5px)' }} />}
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {ACTION_IDS.filter((a) => counts[a] > 0).map((a) => (
            <li key={a} className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: hex(ACTION_COLOR[a]) }} />{ACTION_LABEL[a]}<span className="ml-auto font-[family-name:var(--font-mono)] tabular-nums">{counts[a]}</span></li>
          ))}
          {needy > 0 && <li className="flex items-center gap-1.5" style={{ color: 'var(--coral)' }}><span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--coral)' }} />Needs help<span className="ml-auto font-[family-name:var(--font-mono)] tabular-nums">{needy}</span></li>}
        </ul>
        <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-faint)' }}>{decided}/{total} citizens have made at least one decision.</p>
      </section>

      <section className="px-5 py-3" style={{ borderTop: '1px solid var(--panel-border)' }}>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>Measured performance</h3>
        {ctrl.mode === 'live' || live.n > 0 ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Upstream p50" value={ms(live.upstreamP50)} />
            <Stat label="Upstream p95" value={ms(live.upstreamP95)} />
            <Stat label="Browser p50" value={ms(live.browserP50)} />
            <Stat label="Live calls (n)" value={String(live.n)} />
            <Stat label="Failures" value={String(live.failures)} />
            <Stat label="Est. cost" value={live.costUsd === null ? '—' : `$${live.costUsd.toFixed(5)}`} />
          </div>
        ) : rep ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Upstream p50" value={ms(rep.p50)} />
              <Stat label="Upstream p95" value={ms(rep.p95)} />
              <Stat label="Decisions (n)" value={String(rep.n)} />
            </div>
            <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
              Historical: real <span className="font-[family-name:var(--font-mono)]">{rep.model}</span> calls recorded {new Date(rep.recordedAt).toLocaleDateString()} from a server, not this browser. Whole recording: {rep.inputTokens.toLocaleString()} input tokens ≈ ${rep.costUsd.toFixed(4)} (token-based estimate). Replay makes no live calls.
            </p>
          </>
        ) : (
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Not measured — rules baseline runs locally with no model calls.</p>
        )}
      </section>

      <section className="px-5 py-3" style={{ borderTop: '1px solid var(--panel-border)' }}>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>Citizens</h3>
        <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {sim.citizens.map((c) => (
            <li key={c.id}>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-[var(--chip)]" onClick={() => { ctrl.selectedId = c.id; ctrl.notify(true); }}>
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: c.needsHelp ? 'var(--coral)' : c.action ? hex(ACTION_COLOR[c.action]) : 'var(--ink-faint)' }} />
                <span className="font-semibold">{c.name.split(' ')[0]}</span>
                <span className="truncate" style={{ color: 'var(--ink-faint)' }}>{c.needsHelp ? 'needs help' : c.inside ? `${c.actionLabel.toLowerCase()} · inside` : c.actionLabel.toLowerCase()}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="chip rounded-xl px-1 py-2" style={{ borderRadius: 12 }}>
      <div className="font-[family-name:var(--font-mono)] text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{label}</div>
    </div>
  );
}

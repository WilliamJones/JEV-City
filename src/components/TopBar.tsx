'use client';
import type { Controller, Mode } from '@/client/controller';
import { SCENARIOS, type ScenarioId } from '@/sim/types';
import { SCENARIO_META } from '@/sim/world';

export const MODE_BADGE: Record<Mode, { label: string; color: string }> = {
  replay: { label: 'RECORDED REPLAY', color: 'var(--teal)' },
  live: { label: 'LIVE JEV', color: 'var(--coral)' },
  rules: { label: 'RULES BASELINE', color: '#8a97a6' },
  fallback: { label: 'FALLBACK', color: 'var(--amber)' },
};

const fmtTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const SCENARIO_ICON: Record<ScenarioId, string> = { ordinary_morning: '☀︎', blackout: '⚡︎', meteor: '☄︎' };

export function TopBar({ ctrl, onScenario, onMode, liveAvailable }: { ctrl: Controller; onScenario: (s: ScenarioId) => void; onMode: (m: Mode) => void; liveAvailable: boolean }) {
  const badge = MODE_BADGE[ctrl.mode];
  return (
    <header className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
      <div className="flex items-baseline gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
          JEV<span style={{ color: 'var(--teal)' }}>·</span>CITY
        </h1>
        <span className="hidden text-xs xl:inline" style={{ color: 'var(--ink-soft)' }}>The little city with big decisions</span>
      </div>
      <a href="/benchmark" className="text-xs font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--teal)' }}>Benchmark →</a>

      <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wider text-white" style={{ background: badge.color }} role="status" aria-live="polite">
        <span className={`inline-block h-1.5 w-1.5 rounded-full bg-white ${ctrl.mode === 'live' ? 'live-dot' : ''}`} />
        {badge.label}
      </div>

      <nav className="chip flex p-1" aria-label="Scenario">
        {SCENARIOS.map((s) => (
          <button
            key={s}
            onClick={() => onScenario(s)}
            aria-pressed={ctrl.scenario === s}
            className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
            style={ctrl.scenario === s ? { background: 'var(--panel-solid)', color: 'var(--ink)', boxShadow: 'var(--shadow)' } : { color: 'var(--ink-soft)' }}
          >
            <span aria-hidden className="mr-1">{SCENARIO_ICON[s]}</span>
            {SCENARIO_META[s].title}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <span className="font-[family-name:var(--font-mono)] text-sm font-semibold tabular-nums" aria-label="Simulated time">
          {fmtTime(ctrl.sim.minute)}
        </span>
        {ctrl.sim.stalled && <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>awaiting JEV…</span>}
        <div className="chip flex p-1">
          <button className="rounded-full px-2.5 py-1 text-xs font-semibold" onClick={() => { ctrl.paused = !ctrl.paused; ctrl.notify(true); }} aria-label={ctrl.paused ? 'Play' : 'Pause'}>
            {ctrl.paused ? '▶ Play' : '❚❚ Pause'}
          </button>
          <button className="rounded-full px-2.5 py-1 text-xs font-semibold" onClick={() => onScenario(ctrl.scenario)}>↺ Reset</button>
          {[1, 2, 4].map((s) => (
            <button key={s} aria-pressed={ctrl.speed === s} className="rounded-full px-2 py-1 text-xs font-semibold tabular-nums" style={ctrl.speed === s ? { background: 'var(--panel-solid)' } : { color: 'var(--ink-soft)' }} onClick={() => { ctrl.speed = s; ctrl.notify(true); }}>
              {s}×
            </button>
          ))}
        </div>
        <button className="chip px-3 py-1.5 text-xs font-semibold" onClick={() => { ctrl.night = !ctrl.night; ctrl.notify(true); }} aria-pressed={ctrl.night}>
          {ctrl.night ? '☾ Night' : '☀︎ Day'}
        </button>
        <div className="chip flex p-1" aria-label="Decision engine">
          {(['replay', 'rules'] as Mode[]).map((m) => (
            <button key={m} aria-pressed={ctrl.mode === m} className="rounded-full px-2.5 py-1 text-xs font-semibold" style={ctrl.mode === m ? { background: 'var(--panel-solid)' } : { color: 'var(--ink-soft)' }} onClick={() => onMode(m)}>
              {m === 'replay' ? 'JEV replay' : 'Rules'}
            </button>
          ))}
          <button
            aria-pressed={ctrl.mode === 'live'}
            disabled={!liveAvailable}
            title={liveAvailable ? 'Run live JEV decisions (guarded)' : 'Live mode is disabled on this deployment'}
            className="rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-40"
            style={ctrl.mode === 'live' ? { background: 'var(--coral)', color: 'white' } : { color: 'var(--ink-soft)' }}
            onClick={() => onMode('live')}
          >
            Live JEV
          </button>
        </div>
      </div>
    </header>
  );
}

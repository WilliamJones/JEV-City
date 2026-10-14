'use client';
import type { Controller } from '@/client/controller';
import { scenarioPhase } from '@/client/phase';
import { InfoTip } from './InfoTip';

const TONE = { calm: 'var(--teal)', alert: 'var(--coral)', recovery: 'var(--amber)' } as const;

/** "What's happening now" narration for the current scenario phase. */
export function PhaseBanner({ ctrl, compact }: { ctrl: Controller; compact: boolean }) {
  const p = scenarioPhase(ctrl.sim);
  return (
    <div className="panel pointer-events-auto max-w-[min(92%,440px)] px-3.5 py-2" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-faint)' }}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: TONE[p.tone] }} />
        What’s happening now
        <InfoTip section="scenarios" label="Scenario timelines" />
      </div>
      <p className="mt-0.5 text-sm font-semibold">{p.label}</p>
      {!compact && <p className="text-xs leading-snug" style={{ color: 'var(--ink-soft)' }}>{p.detail}</p>}
    </div>
  );
}

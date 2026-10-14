'use client';
import type { Controller } from '@/client/controller';
import { ACTION_COLOR, ACTION_LABEL, hex } from '@/client/palette';
import type { ActionId } from '@/sim/types';

/** Caption card for the guided opener. Every number shown comes from a real recorded JEV response. */
export function TourCaption({ ctrl }: { ctrl: Controller }) {
  const beat = ctrl.currentBeat!;
  const c = ctrl.sim.citizens.find((x) => x.id === beat.citizenId);
  const d = c?.lastDecision;
  if (!c || !d?.answers) return null;
  const ranked = Object.entries(d.answers.next_action.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <div className="panel absolute left-1/2 top-3 w-[min(92%,520px)] -translate-x-1/2 px-4 py-3" role="status" aria-live="polite">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-faint)' }}>
        <span>Guided replay · real recorded JEV decision {ctrl.tour.index}/{ctrl.tour.beats.length}</span>
        <span className="flex gap-1">
          <button className="chip px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal" style={{ color: 'var(--ink)' }} onClick={() => { ctrl.paused = !ctrl.paused; ctrl.notify(true); }}>{ctrl.paused ? 'Resume' : 'Pause'}</button>
          <button className="chip px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal" style={{ color: 'var(--ink)' }} onClick={() => ctrl.stopTour()}>Skip tour</button>
        </span>
      </div>
      <p className="text-sm leading-snug">
        <b>{c.name.split(' ')[0]}</b>, {c.age}, {c.occupation.toLowerCase()} — JEV weighed {Object.keys(d.answers.next_action.probabilities).length} feasible actions:
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ranked.map(([id, p], i) => (
          <span key={id} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: i === 0 ? hex(ACTION_COLOR[id as ActionId]) : 'var(--chip)', color: i === 0 ? '#fff' : 'var(--ink)' }}>
            {ACTION_LABEL[id as ActionId]} <span className="font-[family-name:var(--font-mono)] tabular-nums">{Math.round(p * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

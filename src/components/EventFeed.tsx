'use client';
import { useState } from 'react';
import type { Controller } from '@/client/controller';

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const KIND_COLOR = { incident: 'var(--coral)', effect: 'var(--amber)', action: 'var(--teal)', safety: '#4f9d63' } as const;

export function EventFeed({ ctrl }: { ctrl: Controller }) {
  const [open, setOpen] = useState(true);
  const events = ctrl.sim.events.slice(-40).reverse();
  return (
    <div className="panel shrink-0">
      <button className="flex w-full items-center justify-between px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        Event feed <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ol className="scroll-thin max-h-44 overflow-y-auto px-4 pb-3 text-xs" aria-live="off">
          {events.map((e, i) => (
            <li key={`${e.tick}-${i}-${e.text}`} className="flex gap-2 py-0.5">
              <span className="font-[family-name:var(--font-mono)] tabular-nums" style={{ color: 'var(--ink-faint)' }}>{fmt(e.minute)}</span>
              <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[e.kind] }} />
              {e.citizenId ? (
                <button className="text-left hover:underline" style={{ fontWeight: e.kind === 'action' ? 400 : 600 }} onClick={() => { ctrl.selectedId = e.citizenId!; ctrl.notify(true); }}>{e.text}</button>
              ) : (
                <span className="font-semibold">{e.text}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

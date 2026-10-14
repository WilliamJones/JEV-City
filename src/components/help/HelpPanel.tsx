'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HELP } from './content';

/** Full help center: section list + content, searchable, deep-linkable by section id. */
export function HelpPanel({ section, onSection, onClose }: { section: string; onSection: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const current = HELP.find((h) => h.id === section) ?? HELP[0];
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? HELP.filter((h) => `${h.title} ${h.summary}`.toLowerCase().includes(s) || h.id.includes(s)) : HELP;
  }, [q]);

  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [section]);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const idx = HELP.findIndex((h) => h.id === current.id);
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/30 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={onClose}>
      <div className="panel flex w-full max-w-4xl flex-col overflow-hidden sm:rounded-2xl" style={{ background: 'var(--panel-solid)' }} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 border-b px-5 py-3" style={{ borderColor: 'var(--panel-border)' }}>
          <h2 id="help-title" className="font-[family-name:var(--font-display)] text-lg font-bold">Help</h2>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search help…"
            aria-label="Search help"
            className="ml-auto w-40 rounded-full px-3 py-1.5 text-sm sm:w-64"
            style={{ background: 'var(--chip)', border: '1px solid var(--panel-border)' }}
          />
          <button ref={closeRef} className="chip px-3 py-1.5 text-sm font-semibold" onClick={onClose} aria-label="Close help">✕</button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav className="scroll-thin flex shrink-0 gap-1 overflow-x-auto border-b p-2 sm:w-60 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r" style={{ borderColor: 'var(--panel-border)' }} aria-label="Help topics">
            {list.map((h) => (
              <button
                key={h.id}
                onClick={() => onSection(h.id)}
                aria-current={h.id === current.id ? 'page' : undefined}
                className="shrink-0 rounded-xl px-3 py-2 text-left"
                style={h.id === current.id ? { background: 'var(--chip)' } : undefined}
              >
                <div className="text-sm font-semibold">{h.title}</div>
                <div className="hidden text-[11px] leading-snug sm:block" style={{ color: 'var(--ink-faint)' }}>{h.summary}</div>
              </button>
            ))}
            {!list.length && <p className="p-3 text-sm" style={{ color: 'var(--ink-faint)' }}>No topics match “{q}”.</p>}
          </nav>
          <div ref={bodyRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold">{current.title}</h3>
            <p className="mb-4 text-sm" style={{ color: 'var(--ink-faint)' }}>{current.summary}</p>
            {current.body}
            <div className="mt-8 flex justify-between border-t pt-4 text-sm" style={{ borderColor: 'var(--panel-border)' }}>
              {idx > 0 ? <button className="font-semibold" style={{ color: 'var(--teal)' }} onClick={() => onSection(HELP[idx - 1].id)}>← {HELP[idx - 1].title}</button> : <span />}
              {idx < HELP.length - 1 && <button className="font-semibold" style={{ color: 'var(--teal)' }} onClick={() => onSection(HELP[idx + 1].id)}>{HELP[idx + 1].title} →</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { ActionGlyph } from './ActionGlyph';

const KEY = 'jev-city-welcomed-v2';

/** First-visit orientation card. Remembered per browser; works without storage too. */
export function Welcome({ onHelp, onTour, onVisible }: { onHelp: () => void; onTour: () => void; onVisible: (v: boolean) => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let v = true;
    try { v = localStorage.getItem(KEY) !== '1'; } catch { /* storage blocked: show it */ }
    setShow(v);
    onVisible(v);
  }, [onVisible]);
  const dismiss = () => {
    setShow(false);
    onVisible(false);
    try { localStorage.setItem(KEY, '1'); } catch { /* private mode: fine */ }
  };
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/25 p-4" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="panel w-full max-w-lg p-6" style={{ background: 'var(--panel-solid)' }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-faint)' }}>Welcome to</p>
        <h2 id="welcome-title" className="font-[family-name:var(--font-display)] text-2xl font-bold">JEV<span style={{ color: 'var(--teal)' }}>·</span>CITY</h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
          A tiny town of 25 people. Whenever someone decides what to do next, that decision comes from <b>JEV</b>, an AI decision model — and you can open up every single one to see what it considered and how sure it was.
        </p>
        <ul className="mt-4 space-y-2.5 text-sm">
          <li className="flex gap-3"><span className="mt-0.5 flex gap-0.5"><ActionGlyph action="help_neighbor" /><ActionGlyph action="go_home" /></span><span><b>Bubbles</b> pop up above people when they make a decision. Each icon is an action.</span></li>
          <li className="flex gap-3"><span className="grid h-[18px] w-[38px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: 'var(--teal)' }}>click</span><span><b>Click anyone</b> to see exactly what JEV returned: the options, their probabilities, and why.</span></li>
          <li className="flex gap-3"><span className="grid h-[18px] w-[38px] shrink-0 place-items-center rounded-full text-[10px] font-bold" style={{ background: 'var(--chip)' }}>♨︎ ☂︎</span><span><b>Switch scenarios</b> at the top — an office fire, a flash flood, a street festival, a meteor, a blackout or an ordinary morning. People warn each other, look for family, get treated at the clinic and join the festival.</span></li>
          <li className="flex gap-3"><span className="grid h-[18px] w-[38px] shrink-0 place-items-center rounded-full text-[10px] font-bold" style={{ background: 'var(--chip)' }}>?</span><span>Press <b>?</b> any time for the full guide, or <b>L</b> for the map legend.</span></li>
        </ul>
        <p className="mt-4 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--chip)', color: 'var(--ink-soft)' }}>
          You’re watching a <b>recorded replay</b> of real JEV decisions — no live AI calls are made while you browse.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className="chip px-4 py-2 text-sm font-semibold" onClick={() => { dismiss(); onHelp(); }}>Open the guide</button>
          <button className="rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ background: 'var(--teal)' }} onClick={() => { dismiss(); onTour(); }} autoFocus>
            Watch the guided intro
          </button>
        </div>
      </div>
    </div>
  );
}

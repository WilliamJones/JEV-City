'use client';
import { ACTION_LABEL } from '@/client/palette';
import { ACTION_IDS } from '@/sim/types';
import { ActionGlyph } from './ActionGlyph';
import { InfoTip } from './InfoTip';

/** Compact on-map legend (toggle with L). The full legend lives in Help → Map legend. */
export function LegendOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="panel absolute bottom-14 left-3 z-10 w-[260px] p-3 text-xs" role="region" aria-label="Map legend">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-faint)' }}>
          Map legend <InfoTip section="legend" label="Full map legend" />
        </span>
        <button className="chip px-2 py-0.5 font-semibold" onClick={onClose} aria-label="Close legend">✕</button>
      </div>
      <div className="grid grid-cols-1 gap-1">
        {ACTION_IDS.map((a) => (
          <div key={a} className="flex items-center gap-2"><ActionGlyph action={a} size={16} />{ACTION_LABEL[a]}</div>
        ))}
      </div>
      <div className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: 'var(--panel-border)', color: 'var(--ink-soft)' }}>
        <div><b style={{ color: 'var(--coral)' }}>!</b> needs help · <b>ring on ground</b> = destination</div>
        <div><b>white ring</b> = selected · <b>dashed line</b> = their route</div>
        <div><b style={{ color: 'var(--coral)' }}>coral dashed zone</b> = closed after impact</div>
        <div>Cars &amp; traffic lights are scenery, not AI.</div>
      </div>
    </div>
  );
}

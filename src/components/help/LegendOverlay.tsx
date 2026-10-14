'use client';
import { ACTION_LABEL } from '@/client/palette';
import { ACTION_IDS } from '@/sim/types';
import { ActionGlyph } from './ActionGlyph';
import { InfoTip } from './InfoTip';

/** Compact on-map legend (toggle with L). The full legend lives in Help → Map legend. */
export function LegendOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="panel absolute bottom-14 left-3 z-10 w-[min(380px,calc(100%-24px))] p-3 text-xs" role="region" aria-label="Map legend">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-faint)' }}>
          Map legend <InfoTip section="legend" label="Full map legend" />
        </span>
        <button className="chip px-2 py-0.5 font-semibold" onClick={onClose} aria-label="Close legend">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        {ACTION_IDS.map((a) => (
          <div key={a} className="flex items-center gap-2"><ActionGlyph action={a} size={16} />{ACTION_LABEL[a]}</div>
        ))}
      </div>
      <div className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: 'var(--panel-border)', color: 'var(--ink-soft)' }}>
        <div><b style={{ color: 'var(--coral)' }}>!</b> needs help · <b>ring on ground</b> = destination</div>
        <div><b>white ring</b> = selected · <b>dashed line</b> = their route</div>
        <div><b style={{ color: '#d94f86' }}>pink plaster</b> = injured · <b style={{ color: '#4f9d63' }}>green shield</b> = safety rule moved them</div>
        <div><b style={{ color: '#e9b824' }}>yellow rings</b> = passing on a warning · <b style={{ color: '#ff5c8a' }}>♥</b> = found family</div>
        <div><b style={{ color: 'var(--coral)' }}>coral dashed zone</b> = crater · <b>red/white tape</b> = fire cordon · <b style={{ color: '#4c86b5' }}>deep water</b> = closed</div>
        <div>Cars, traffic lights, the fire engine and grey festival visitors are scenery, not AI.</div>
      </div>
    </div>
  );
}

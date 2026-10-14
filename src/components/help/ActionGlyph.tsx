import { ACTION_COLOR, hex } from '@/client/palette';
import type { ActionId } from '@/sim/types';

/** SVG versions of the decision-bubble icons drawn on the map (see src/client/icons.ts). */
export function ActionGlyph({ action, size = 18 }: { action: ActionId; size?: number }) {
  const c = hex(ACTION_COLOR[action]);
  const body = {
    continue_routine: <><path d="M-4 0H3" stroke={c} strokeWidth="2" strokeLinecap="round" /><path d="M1-3.5L5 0L1 3.5Z" fill={c} /></>,
    go_home: <><path d="M-5 0L0-5L5 0Z" fill={c} /><rect x="-3.5" y="0" width="7" height="4.5" fill={c} /><rect x="-1" y="1.5" width="2" height="3" fill="#fff" /></>,
    seek_shelter: <path d="M-4.5-4.5H4.5V0.5L0 5L-4.5 0.5Z" fill={c} />,
    help_neighbor: <><circle cx="-2.2" cy="-1.5" r="2.6" fill={c} /><circle cx="2.2" cy="-1.5" r="2.6" fill={c} /><path d="M-4.7-0.6H4.7L0 4.6Z" fill={c} /></>,
    seek_supplies: <><path d="M0-5L5-2.5L0 0L-5-2.5Z" fill={c} /><path d="M-5-2.5L0 0V5.5L-5 3Z" fill={c} /><path d="M0 0L5-2.5V3L0 5.5Z" fill={c} /><path d="M-5-2.5L0 0L5-2.5M0 0V5.5" stroke="#fff" strokeWidth="1" fill="none" /></>,
    report_for_duty: <><rect x="-1.4" y="-4.5" width="2.8" height="9" fill={c} /><rect x="-4.5" y="-1.4" width="9" height="2.8" fill={c} /></>,
    wait: <><circle cx="-3.5" cy="0" r="1.4" fill={c} /><circle cx="0" cy="0" r="1.4" fill={c} /><circle cx="3.5" cy="0" r="1.4" fill={c} /></>,
  }[action];
  return (
    <svg width={size} height={size} viewBox="-9 -9 18 18" aria-hidden className="inline-block shrink-0">
      <circle r="8.5" fill="#fff" stroke="rgba(20,38,62,.18)" />
      {body}
    </svg>
  );
}

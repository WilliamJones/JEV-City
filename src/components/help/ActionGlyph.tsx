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
    seek_medical_care: <><rect x="-5.5" y="-2.4" width="11" height="4.8" rx="2.4" fill={c} /><rect x="-1.8" y="-2.4" width="3.6" height="4.8" fill="#fff" /></>,
    move_away_from_hazard: <><path d="M-5-4L-1.5 0L-5 4H-3L0.5 0L-3-4Z" fill={c} /><path d="M0-4L3.5 0L0 4H2L5.5 0L2-4Z" fill={c} /></>,
    check_on_family: <><circle cx="-2" cy="-3.2" r="1.9" fill={c} /><circle cx="2.8" cy="-0.8" r="1.5" fill={c} /><rect x="-4" y="-1" width="4" height="6" rx="1.6" fill={c} /><rect x="1.3" y="1" width="3" height="4" rx="1.2" fill={c} /></>,
    warn_others: <><path d="M-5-1.6H-1L4.5-4.5V4.5L-1 1.6H-5Z" fill={c} /><rect x="-3" y="1.6" width="1.8" height="2.6" fill={c} /></>,
    attend_festival: <><circle cx="-2.4" cy="3" r="2" fill={c} /><circle cx="3" cy="1.8" r="2" fill={c} /><rect x="-0.9" y="-4.5" width="1.4" height="7.5" fill={c} /><rect x="4.5" y="-5.7" width="1.4" height="7.5" fill={c} /><path d="M-0.9-4.5L5.9-5.7V-3.6L-0.9-2.4Z" fill={c} /></>,
  }[action];
  return (
    <svg width={size} height={size} viewBox="-9 -9 18 18" aria-hidden className="inline-block shrink-0">
      <circle r="8.5" fill="#fff" stroke="rgba(20,38,62,.18)" />
      {body}
    </svg>
  );
}

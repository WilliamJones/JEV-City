import type { ActionId } from '@/sim/types';

/** Visual direction tokens (docs/VISUAL-DIRECTION.md). */
export const PAL = {
  grass: [0xb5d595, 0xaed08d, 0xa8cb87],
  grassNight: 0x2b4a3f,
  sidewalk: 0xe5e8dc,
  plaza: 0xeee4cf,
  road: 0x647484,
  roadLine: 0xf4f1e6,
  curb: 0xc9cdc1,
  soilTop: 0x8a6a4b,
  soilSide: 0x6e5239,
  soilDark: 0x553f2c,
  trunk: 0x7a5a3c,
  leaf: [0x5f9e5a, 0x6fae63, 0x84bf6d],
  window: 0xffe1a3,
  windowDay: 0xbcd3df,
  teal: 0x2d8f91,
  coral: 0xf17961,
  responder: 0xd84d56,
  navy: 0x14263e,
};

export const SHIRTS = [0x3f7cac, 0xe07a5f, 0x81b29a, 0xf2cc8f, 0x9b72aa, 0x5c6b73, 0xe5989b, 0x52796f];
export const SKINS = [0xf6d5b8, 0xe8b894, 0xc98e66, 0x9c6a48, 0x6b4630];
export const HAIRS = [0x2b2118, 0x5a3c26, 0x8c5a2f, 0xd9b26a, 0x9a9a9a, 0x3b2a4a];

export const ACTION_COLOR: Record<ActionId, number> = {
  continue_routine: 0x2d8f91,
  go_home: 0x4f7cc9,
  seek_shelter: 0x8a6cc9,
  help_neighbor: 0xf17961,
  seek_supplies: 0xe0a83a,
  report_for_duty: 0xd84d56,
  wait: 0x8a97a6,
  seek_medical_care: 0xd94f86,
  move_away_from_hazard: 0x4f9d63,
  check_on_family: 0x9a6a4a,
  warn_others: 0xe9b824,
  attend_festival: 0x2fa9de,
  restore_power: 0xf28c28,
  direct_traffic: 0x5b6ee1,
};

export const ACTION_LABEL: Record<ActionId, string> = {
  continue_routine: 'Continue routine',
  go_home: 'Go home',
  seek_shelter: 'Seek shelter',
  help_neighbor: 'Help neighbor',
  seek_supplies: 'Seek supplies',
  report_for_duty: 'Report for duty',
  wait: 'Wait',
  seek_medical_care: 'Seek medical care',
  move_away_from_hazard: 'Move away from danger',
  check_on_family: 'Check on family',
  warn_others: 'Warn others',
  attend_festival: 'Attend festival',
  restore_power: 'Restore power',
  direct_traffic: 'Direct traffic',
};

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

import { Graphics } from 'pixi.js';
import type { ActionId } from '@/sim/types';

/** Tiny vector glyphs (≈10px) for decision bubbles. Drawn centered at 0,0. */
export function drawActionIcon(g: Graphics, a: ActionId, color: number) {
  switch (a) {
    case 'continue_routine':
      g.moveTo(-4, 0).lineTo(3, 0).stroke({ width: 2, color, cap: 'round' });
      g.poly([1, -3.5, 5, 0, 1, 3.5]).fill(color);
      break;
    case 'go_home':
      g.poly([-5, 0, 0, -5, 5, 0]).fill(color);
      g.rect(-3.5, 0, 7, 4.5).fill(color);
      g.rect(-1, 1.5, 2, 3).fill(0xffffff);
      break;
    case 'seek_shelter':
      g.poly([-4.5, -4.5, 4.5, -4.5, 4.5, 0.5, 0, 5, -4.5, 0.5]).fill(color);
      break;
    case 'help_neighbor':
      g.circle(-2.2, -1.5, 2.6).fill(color).circle(2.2, -1.5, 2.6).fill(color);
      g.poly([-4.7, -0.6, 4.7, -0.6, 0, 4.6]).fill(color);
      break;
    case 'seek_supplies':
      // a little parcel
      g.poly([0, -5, 5, -2.5, 0, 0, -5, -2.5]).fill(color);
      g.poly([-5, -2.5, 0, 0, 0, 5.5, -5, 3]).fill(color);
      g.poly([0, 0, 5, -2.5, 5, 3, 0, 5.5]).fill(color);
      g.moveTo(-5, -2.5).lineTo(0, 0).lineTo(5, -2.5).stroke({ width: 1, color: 0xffffff, alpha: 0.9 });
      g.moveTo(0, 0).lineTo(0, 5.5).stroke({ width: 1, color: 0xffffff, alpha: 0.9 });
      break;
    case 'report_for_duty':
      g.rect(-1.4, -4.5, 2.8, 9).fill(color);
      g.rect(-4.5, -1.4, 9, 2.8).fill(color);
      break;
    case 'wait':
      for (const x of [-3.5, 0, 3.5]) g.circle(x, 0, 1.4).fill(color);
      break;
    case 'seek_medical_care':
      // a plaster
      g.roundRect(-5.5, -2.4, 11, 4.8, 2.4).fill(color);
      g.rect(-1.8, -2.4, 3.6, 4.8).fill(0xffffff);
      for (const [x, y] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) g.circle(x, y, 0.45).fill(color);
      break;
    case 'move_away_from_hazard':
      // double chevron pointing away
      g.poly([-5, -4, -1.5, 0, -5, 4, -3, 4, 0.5, 0, -3, -4]).fill(color);
      g.poly([0, -4, 3.5, 0, 0, 4, 2, 4, 5.5, 0, 2, -4]).fill(color);
      break;
    case 'check_on_family':
      // adult + child
      g.circle(-2, -3.2, 1.9).fill(color).circle(2.8, -0.8, 1.5).fill(color);
      g.roundRect(-4, -1, 4, 6, 1.6).fill(color).roundRect(1.3, 1, 3, 4, 1.2).fill(color);
      break;
    case 'warn_others':
      // megaphone
      g.poly([-5, -1.6, -1, -1.6, 4.5, -4.5, 4.5, 4.5, -1, 1.6, -5, 1.6]).fill(color);
      g.rect(-3, 1.6, 1.8, 2.6).fill(color);
      break;
    case 'attend_festival':
      // music note
      g.circle(-2.4, 3, 2).fill(color).circle(3, 1.8, 2).fill(color);
      g.rect(-0.9, -4.5, 1.4, 7.5).fill(color).rect(4.5, -5.7, 1.4, 7.5).fill(color);
      g.poly([-0.9, -4.5, 5.9, -5.7, 5.9, -3.6, -0.9, -2.4]).fill(color);
      break;
  }
}

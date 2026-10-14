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
  }
}

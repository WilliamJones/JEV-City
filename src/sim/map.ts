export type Tile = { x: number; y: number };
export type BuildingKind =
  | 'house'
  | 'apartment'
  | 'office'
  | 'market'
  | 'clinic'
  | 'shelter'
  | 'shop'
  | 'firestation'
  | 'substation';

export type Building = {
  id: string;
  kind: BuildingKind;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floors: number;
  door: Tile;
  roof: number;
  wall: number;
};

/**
 * A city layout. Roads run along every row and column listed in `roads` (the grid is square-symmetric).
 * The standard 25-citizen district is `STANDARD_MAP`; the 100-citizen Big City has its own.
 */
export class CityMap {
  private byId: Map<string, Building>;
  constructor(
    readonly id: string,
    readonly w: number,
    readonly h: number,
    readonly buildings: Building[],
    readonly trees: Tile[],
    readonly streetlights: Tile[],
    readonly roads: number[],
    readonly decor: { plaza: { x0: number; x1: number; y0: number; y1: number } | null; fountain: Tile | null },
  ) {
    this.byId = new Map(buildings.map((b) => [b.id, b]));
  }

  building(id: string) {
    return this.byId.get(id)!;
  }
  ofKind(kind: BuildingKind) {
    return this.buildings.filter((b) => b.kind === kind);
  }
  /** Closest building of a kind to a tile (straight-line; ties by id). */
  nearest(kind: BuildingKind, from: Tile) {
    let best: Building | null = null, bestD = Infinity;
    for (const b of this.buildings) {
      if (b.kind !== kind) continue;
      const d = Math.hypot(b.door.x - from.x, b.door.y - from.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best!;
  }
  isRoad(x: number, y: number) {
    return this.roads.includes(x) || this.roads.includes(y);
  }
  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  /** Static walkability (true = walkable). Buildings and trees block. */
  baseWalkable(): boolean[][] {
    const grid = Array.from({ length: this.h }, () => Array<boolean>(this.w).fill(true));
    for (const b of this.buildings)
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) grid[y][x] = false;
    for (const t of this.trees) grid[t.y][t.x] = false;
    return grid;
  }
  /** Human-readable fixed map node id for the decision DTO. */
  locationIdFor(t: Tile): string {
    let best = 'street', bestD = 3.5;
    for (const b of this.buildings) {
      const d = Math.hypot(t.x - b.door.x, t.y - b.door.y);
      if (d < bestD) { bestD = d; best = `${b.id}-area`; }
    }
    if (best === 'street') return `street-${Math.floor(t.x / 6)}-${Math.floor(t.y / 6)}`;
    return best;
  }
  /** Plain-language name for a location id ("office-area" → "the office tower"). */
  placeLabel(id: string | null): string {
    if (!id) return 'somewhere unknown';
    const b = this.buildings.find((x) => `${x.id}-area` === id);
    if (b) return b.kind === 'house' ? `home ${b.id.split('-')[1]}` : `the ${b.label.toLowerCase()}`;
    return 'the street';
  }
}

const H = (id: string, x: number, y: number, roof: number, wall = 0xf3e2cc, floors = 1): Building => ({
  id, kind: 'house', label: 'Home', x, y, w: 2, h: 2, floors, door: { x: x + 1, y: y + 2 }, roof, wall,
});

export const STANDARD_MAP = new CityMap(
  'district-22',
  22,
  22,
  [
    H('home-1', 1, 1, 0xd9785f),
    H('home-2', 1, 7, 0x5f8fb0, 0xf1e7d6, 2),
    H('home-3', 7, 1, 0x8fae6b),
    H('home-4', 13, 1, 0xc9a24e, 0xf4e9d8, 2),
    H('home-5', 19, 1, 0xb46a8c),
    H('home-6', 1, 13, 0x6c9a8b),
    H('home-7', 1, 19, 0xd08b55, 0xf3e2cc, 2),
    H('home-8', 19, 19, 0x7f86c2),
    H('home-9', 7, 19, 0xcf6d6d),
    { id: 'office', kind: 'office', label: 'Office tower', x: 13, y: 7, w: 3, h: 3, floors: 4, door: { x: 14, y: 10 }, roof: 0x6f8396, wall: 0xdfe6ea },
    { id: 'market', kind: 'market', label: 'Market hall', x: 7, y: 7, w: 3, h: 2, floors: 1, door: { x: 8, y: 9 }, roof: 0xe0735e, wall: 0xf6e7cf },
    { id: 'clinic', kind: 'clinic', label: 'Clinic', x: 13, y: 13, w: 3, h: 3, floors: 2, door: { x: 14, y: 16 }, roof: 0xf2f5f4, wall: 0xe9f1ef },
    { id: 'shelter', kind: 'shelter', label: 'Community shelter', x: 19, y: 7, w: 2, h: 3, floors: 1, door: { x: 20, y: 10 }, roof: 0x2d8f91, wall: 0xe8efe6 },
    { id: 'shop', kind: 'shop', label: 'Corner store', x: 7, y: 13, w: 2, h: 2, floors: 1, door: { x: 8, y: 15 }, roof: 0xe6b54a, wall: 0xf6ead2 },
    { id: 'firestation', kind: 'firestation', label: 'Fire & rescue', x: 19, y: 13, w: 2, h: 3, floors: 2, door: { x: 20, y: 16 }, roof: 0xc8454f, wall: 0xf0dfd6 },
    { id: 'substation', kind: 'substation', label: 'Power substation', x: 13, y: 19, w: 2, h: 2, floors: 1, door: { x: 14, y: 21 }, roof: 0x8a96a3, wall: 0xc9d1d8 },
  ],
  [
    { x: 3, y: 3 }, { x: 4, y: 0 }, { x: 9, y: 3 }, { x: 15, y: 4 }, { x: 21, y: 4 }, { x: 0, y: 9 },
    { x: 3, y: 10 }, { x: 9, y: 15 }, { x: 4, y: 15 }, { x: 0, y: 16 }, { x: 3, y: 21 }, { x: 10, y: 20 },
    { x: 16, y: 20 }, { x: 21, y: 12 }, { x: 16, y: 9 }, { x: 18, y: 3 }, { x: 12, y: 3 }, { x: 6, y: 21 },
  ],
  [
    { x: 4, y: 4 }, { x: 10, y: 4 }, { x: 16, y: 4 }, { x: 4, y: 10 }, { x: 10, y: 10 }, { x: 16, y: 10 },
    { x: 4, y: 16 }, { x: 10, y: 16 }, { x: 16, y: 16 }, { x: 18, y: 18 }, { x: 6, y: 6 }, { x: 12, y: 12 },
  ],
  [5, 11, 17],
  { plaza: { x0: 6, x1: 10, y0: 9, y1: 10 }, fountain: { x: 3, y: 10 } },
);

// Standard-district aliases (used by scenario code that only runs on the standard map).
export const MAP_W = STANDARD_MAP.w;
export const MAP_H = STANDARD_MAP.h;
export const BUILDINGS = STANDARD_MAP.buildings;
export const TREES = STANDARD_MAP.trees;
export const STREETLIGHTS = STANDARD_MAP.streetlights;
export const buildingById = (id: string) => STANDARD_MAP.building(id);
export const isRoad = (x: number, y: number) => STANDARD_MAP.isRoad(x, y);
export const buildBaseWalkable = () => STANDARD_MAP.baseWalkable();
export const locationIdFor = (t: Tile) => STANDARD_MAP.locationIdFor(t);
export const placeLabel = (id: string | null) => STANDARD_MAP.placeLabel(id);

/** Breadth-first path on a 4-connected grid. Returns tiles excluding start, or null if unreachable. */
export function findPath(walkable: boolean[][], from: Tile, to: Tile): Tile[] | null {
  if (from.x === to.x && from.y === to.y) return [];
  if (!walkable[to.y]?.[to.x]) return null;
  const W = walkable[0].length, Hh = walkable.length;
  const key = (x: number, y: number) => y * W + x;
  const prev = new Int32Array(W * Hh).fill(-1);
  const seen = new Uint8Array(W * Hh);
  const queue: number[] = [key(from.x, from.y)];
  seen[queue[0]] = 1;
  const target = key(to.x, to.y);
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    if (k === target) break;
    const x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= Hh || !walkable[ny][nx]) continue;
      const nk = key(nx, ny);
      if (seen[nk]) continue;
      seen[nk] = 1;
      prev[nk] = k;
      queue.push(nk);
    }
  }
  if (!seen[target]) return null;
  const path: Tile[] = [];
  for (let k = target; k !== key(from.x, from.y); k = prev[k]) path.push({ x: k % W, y: (k / W) | 0 });
  return path.reverse();
}

/** BFS step distances from `from` to every tile (-1 = unreachable). One pass answers many reachability checks. */
export function reachMap(walkable: boolean[][], from: Tile): Int16Array {
  const W = walkable[0].length, Hh = walkable.length;
  const dist = new Int16Array(W * Hh).fill(-1);
  const start = from.y * W + from.x;
  dist[start] = 0;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    const x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= Hh || !walkable[ny][nx]) continue;
      const nk = ny * W + nx;
      if (dist[nk] >= 0) continue;
      dist[nk] = dist[k] + 1;
      queue.push(nk);
    }
  }
  return dist;
}

/** Ground height for the flash-flood scenario: a bowl whose lowest point is beside home 7, south-west of the market. */
export const FLOOD_BASIN = { x: 3, y: 19 };
export function elevation(x: number, y: number): number {
  return Math.hypot(x - FLOOD_BASIN.x, y - FLOOD_BASIN.y) / 17;
}

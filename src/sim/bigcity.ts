import type { CitizenSeed } from './citizens';
import { CityMap, type Building, type BuildingKind, type Tile } from './map';
import { createRng, round2 } from './rng';
import type { Role } from './types';

/**
 * Big City (sim v7): a 44×44 map with 100 citizens. Generated deterministically from a fixed block plan so the
 * same seed always yields the same city and population.
 */
const ROADS = [6, 14, 22, 30, 38];
const SIZE = 44;
const SPANS: [number, number][] = [[0, 5], [7, 13], [15, 21], [23, 29], [31, 37], [39, 43]];

// Block plan (row-major, 6×6). H houses · A apartment · O office · C clinic · M market · S shop · E shelter
// F fire station · T substation · P park.
const PLAN = [
  'HHOHHH',
  'HCMSPH',
  'HAFHEH',
  'HEHTAH',
  'HSACFH',
  'HHOHSH',
];

const ROOFS = [0xd9785f, 0x5f8fb0, 0x8fae6b, 0xc9a24e, 0xb46a8c, 0x6c9a8b, 0xd08b55, 0x7f86c2, 0xcf6d6d, 0x9a7fb8];
const VENUE: Record<string, { kind: BuildingKind; label: string; w: number; h: number; floors: number; roof: number; wall: number }> = {
  A: { kind: 'apartment', label: 'Apartments', w: 3, h: 3, floors: 4, roof: 0x8a6f5a, wall: 0xeadfce },
  O: { kind: 'office', label: 'Office tower', w: 3, h: 3, floors: 4, roof: 0x6f8396, wall: 0xdfe6ea },
  C: { kind: 'clinic', label: 'Clinic', w: 3, h: 3, floors: 2, roof: 0xf2f5f4, wall: 0xe9f1ef },
  M: { kind: 'market', label: 'Market hall', w: 3, h: 2, floors: 1, roof: 0xe0735e, wall: 0xf6e7cf },
  S: { kind: 'shop', label: 'Corner store', w: 2, h: 2, floors: 1, roof: 0xe6b54a, wall: 0xf6ead2 },
  E: { kind: 'shelter', label: 'Community shelter', w: 2, h: 3, floors: 1, roof: 0x2d8f91, wall: 0xe8efe6 },
  F: { kind: 'firestation', label: 'Fire & rescue', w: 2, h: 3, floors: 2, roof: 0xc8454f, wall: 0xf0dfd6 },
  T: { kind: 'substation', label: 'Power substation', w: 2, h: 2, floors: 1, roof: 0x8a96a3, wall: 0xc9d1d8 },
};

function buildMap(): CityMap {
  const buildings: Building[] = [];
  const trees: Tile[] = [];
  const counters: Record<string, number> = {};
  const id = (prefix: string) => `${prefix}-${(counters[prefix] = (counters[prefix] ?? 0) + 1)}`;
  const occupied = new Set<string>();
  const claim = (b: Building) => {
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) occupied.add(`${x},${y}`);
    occupied.add(`${b.door.x},${b.door.y}`);
    buildings.push(b);
  };
  const houses = (x0: number, x1: number, y0: number, y1: number, skipX = -1, skipY = -1) => {
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    for (let ty = y0 + (bh >= 7 ? 1 : 0); ty + 2 <= y1; ty += 3)
      for (let tx = x0 + (bw >= 7 ? 1 : 0); tx + 1 <= x1; tx += 3) {
        if (skipX >= 0 && tx + 1 >= skipX - 1 && tx <= skipX + 3 && ty + 2 >= skipY - 1 && ty <= skipY + 3) continue;
        const n = buildings.filter((b) => b.kind === 'house').length;
        claim({ id: id('home'), kind: 'house', label: 'Home', x: tx, y: ty, w: 2, h: 2, floors: n % 3 === 1 ? 2 : 1, door: { x: tx + 1, y: ty + 2 }, roof: ROOFS[n % ROOFS.length], wall: [0xf3e2cc, 0xf1e7d6, 0xf4e9d8][n % 3] });
      }
  };
  PLAN.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      const [x0, x1] = SPANS[i], [y0, y1] = SPANS[j];
      if (ch === 'H') { houses(x0, x1, y0, y1); return; }
      if (ch === 'P') {
        // park: a ring of trees around an open lawn
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x === x0 + 1 || x === x1 - 1 || y === y0 + 1 || y === y1 - 1) && (x + y) % 2 === 0) trees.push({ x, y });
        return;
      }
      const v = VENUE[ch];
      const x = x0 + Math.floor((x1 - x0 + 1 - v.w) / 2), y = y0 + 1;
      const prefix = { apartment: 'apt', office: 'office', clinic: 'clinic', market: 'market', shop: 'shop', shelter: 'shelter', firestation: 'firestation', substation: 'substation', house: 'home' }[v.kind];
      claim({ id: id(prefix), kind: v.kind, label: v.label, x, y, w: v.w, h: v.h, floors: v.floors, door: { x: x + Math.floor(v.w / 2), y: y + v.h }, roof: v.roof, wall: v.wall });
      if (v.w <= 2 && x1 - x0 >= 6) houses(x0, x1, y0, y1, x, y); // small venues share their block with houses
    }),
  );
  // scattered street trees on free grass, away from doors and road edges
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (ROADS.includes(x) || ROADS.includes(y) || occupied.has(`${x},${y}`)) continue;
      if (ROADS.some((r) => Math.abs(r - x) === 1 || Math.abs(r - y) === 1)) continue;
      if (buildings.some((b) => Math.abs(b.door.x - x) + Math.abs(b.door.y - y) <= 1)) continue;
      if ((x * 73 + y * 151) % 17 === 0) trees.push({ x, y });
    }
  const lights: Tile[] = [];
  for (const rx of ROADS) for (const ry of ROADS) lights.push({ x: rx - 1, y: ry - 1 });
  return new CityMap('big-city-44', SIZE, SIZE, buildings, trees.filter((t) => !occupied.has(`${t.x},${t.y}`)), lights, ROADS, { plaza: null, fountain: null });
}

export const BIG_CITY_MAP = buildMap();

const FIRST = ['Ava', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hal', 'Ida', 'Jay', 'Kai', 'Lia', 'Max', 'Nia', 'Oli', 'Pia', 'Quin', 'Ria', 'Sol', 'Tia', 'Uma', 'Vic', 'Wes', 'Xia', 'Yan', 'Zoe', 'Ana', 'Bo', 'Cam', 'Dee'];
const LAST = ['Abara', 'Berg', 'Costa', 'Dahl', 'Ekwu', 'Fujita', 'Grant', 'Hayes', 'Iqbal', 'Jensen', 'Kowal', 'Lund', 'Mbeki', 'Nunez', 'Oduya', 'Park', 'Quist', 'Rossi', 'Silva', 'Tanaka'];

/** 100 seeded citizens: 70 residents, 10 service, 8 healthcare, 8 responders, 4 utility. */
export function createBigPopulation(seed: number, map: CityMap): (CitizenSeed & { householdId: string })[] {
  const rng = createRng(seed ^ 0xb16c);
  const roles: Role[] = [...Array(70).fill('resident'), ...Array(10).fill('service'), ...Array(8).fill('healthcare'), ...Array(8).fill('responder'), ...Array(4).fill('utility')];
  // deterministic interleave so roles are spread across the city
  const order = roles.map((r, i) => ({ r, k: (i * 37) % 100 })).sort((a, b) => a.k - b.k).map((x) => x.r);
  const homes = map.ofKind('house').map((b) => b.id);
  const apts = map.ofKind('apartment').map((b) => b.id);
  const offices = map.ofKind('office').map((b) => b.id), shops = [...map.ofKind('shop'), ...map.ofKind('market')].map((b) => b.id);
  const clinics = map.ofKind('clinic').map((b) => b.id), stations = map.ofKind('firestation').map((b) => b.id), sub = map.ofKind('substation')[0].id;
  const used = new Set<string>();
  return order.map((role, i) => {
    let name = '';
    for (let k = 0; !name || used.has(name); k++) name = `${FIRST[(i * 7 + k) % FIRST.length]} ${LAST[(i * 3 + k * 5) % LAST.length]}`;
    used.add(name);
    // households of 2–3: houses first, then apartments (each apartment holds several households)
    const house = i < 72 ? homes[Math.floor(i / 2) % homes.length] : null;
    const aptIdx = i - 72;
    const homeId = house ?? apts[Math.floor(aptIdx / 7) % apts.length];
    const householdId = house ? homeId : `${homeId}#${Math.floor((aptIdx % 7) / 2)}`;
    const work = role === 'service' ? shops[i % shops.length] : role === 'healthcare' ? clinics[i % clinics.length] : role === 'responder' ? stations[i % stations.length] : role === 'utility' ? sub : i % 5 < 3 ? offices[i % offices.length] : null;
    const occupation = { resident: work ? ['Accountant', 'Designer', 'Engineer', 'Analyst', 'Teacher', 'Developer'][i % 6] : ['Retiree', 'Student', 'Artist', 'Writer', 'Parent at home'][i % 5], service: ['Shopkeeper', 'Barista', 'Clerk', 'Vendor'][i % 4], healthcare: ['Nurse', 'Doctor'][i % 2], responder: ['Firefighter', 'Paramedic'][i % 2], utility: ['Grid engineer', 'Line technician'][i % 2] }[role];
    const altruismBias = role === 'healthcare' || role === 'responder' ? 0.25 : 0;
    return {
      id: `citizen-${String(i + 1).padStart(3, '0')}`,
      name,
      age: Math.round(rng.range(19, 79)),
      role,
      occupation,
      homeId,
      householdId,
      workId: work,
      traits: {
        caution: round2(rng.range(0.1, 0.95)),
        altruism: round2(Math.min(1, rng.range(0.1, 0.8) + altruismBias)),
        sociability: round2(rng.range(0.1, 0.95)),
      },
      look: { shirt: rng.int(0, 8), skin: rng.int(0, 5), hair: rng.int(0, 6) },
    };
  });
}

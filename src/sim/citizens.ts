import { buildingById, BUILDINGS, type Tile } from './map';
import { createRng, round2 } from './rng';
import type { ActionId, DecisionResultV1, Needs, Plan, Role, Traits } from './types';

export type CitizenSeed = {
  id: string;
  name: string;
  age: number;
  role: Role;
  occupation: string;
  homeId: string;
  workId: string | null;
  traits: Traits;
  /** Palette indices for the sprite. */
  look: { shirt: number; skin: number; hair: number };
};

export type Citizen = CitizenSeed & {
  pos: { x: number; y: number };
  tile: Tile;
  path: Tile[];
  plan: Plan;
  needs: Needs;
  action: ActionId | null;
  actionLabel: string;
  /** Ticks until next routine decision. */
  cooldown: number;
  decisionSeq: number;
  pending: boolean;
  needsHelp: boolean;
  helpingId: string | null;
  helpProgress: number;
  inside: string | null;
  lastDecision: DecisionResultV1 | null;
  facing: 1 | -1;
};

const NAMES: [string, number][] = [
  ['Sarah Kim', 42], ['Marcus Reid', 35], ['Lena Ortiz', 29], ['Tomás Vega', 51], ['Priya Nair', 38],
  ['Owen Fletcher', 67], ['Aiko Tanaka', 24], ['Daniel Brooks', 46], ['Fatima Haddad', 33], ['Jonah Lee', 19],
  ['Rosa Medina', 72], ['Ethan Clarke', 27], ['Mei Chen', 55], ['Kwame Mensah', 40], ['Isla Morgan', 31],
  ['Noah Patel', 22], ['Grace Okafor', 61], ['Leo Rossi', 37], ['Hana Sato', 44], ['Samir Aziz', 30],
  ['Clara Novak', 26], ['Victor Hale', 58], ['Zoe Laurent', 34], ['Ben Carter', 49], ['Nadia Petrov', 39],
];

const ROLES: { role: Role; occupation: string; work: string | null }[] = [
  { role: 'healthcare', occupation: 'Nurse', work: 'clinic' },
  { role: 'responder', occupation: 'Firefighter', work: 'firestation' },
  { role: 'service', occupation: 'Market vendor', work: 'market' },
  { role: 'resident', occupation: 'Accountant', work: 'office' },
  { role: 'resident', occupation: 'Designer', work: 'office' },
  { role: 'resident', occupation: 'Retiree', work: null },
  { role: 'resident', occupation: 'Student', work: 'office' },
  { role: 'resident', occupation: 'Engineer', work: 'office' },
  { role: 'service', occupation: 'Shopkeeper', work: 'shop' },
  { role: 'resident', occupation: 'Courier', work: 'market' },
  { role: 'resident', occupation: 'Retiree', work: null },
  { role: 'responder', occupation: 'Paramedic', work: 'firestation' },
  { role: 'healthcare', occupation: 'Doctor', work: 'clinic' },
  { role: 'resident', occupation: 'Teacher', work: 'office' },
  { role: 'service', occupation: 'Barista', work: 'market' },
  { role: 'resident', occupation: 'Developer', work: 'office' },
  { role: 'resident', occupation: 'Parent at home', work: null },
  { role: 'resident', occupation: 'Analyst', work: 'office' },
  { role: 'resident', occupation: 'Artist', work: null },
  { role: 'service', occupation: 'Store clerk', work: 'shop' },
  { role: 'resident', occupation: 'Lawyer', work: 'office' },
  { role: 'resident', occupation: 'Retiree', work: null },
  { role: 'resident', occupation: 'Writer', work: null },
  { role: 'resident', occupation: 'Electrician', work: 'office' },
  { role: 'resident', occupation: 'Nurse student', work: 'office' },
];

const HOMES = BUILDINGS.filter((b) => b.kind === 'house').map((b) => b.id);

/** 25 seeded citizens: same seed → same population (PRD F01). */
export function createPopulation(seed: number): CitizenSeed[] {
  const rng = createRng(seed ^ 0x51ed);
  return NAMES.map(([name, age], i) => {
    const r = ROLES[i];
    const altruismBias = r.role === 'healthcare' || r.role === 'responder' ? 0.25 : 0;
    return {
      id: `citizen-${String(i + 1).padStart(2, '0')}`,
      name,
      age,
      role: r.role,
      occupation: r.occupation,
      homeId: HOMES[i % HOMES.length],
      workId: r.work,
      traits: {
        caution: round2(rng.range(0.1, 0.95)),
        altruism: round2(Math.min(1, rng.range(0.1, 0.8) + altruismBias)),
        sociability: round2(rng.range(0.1, 0.95)),
      },
      look: { shirt: rng.int(0, 8), skin: rng.int(0, 5), hair: rng.int(0, 6) },
    };
  });
}

export function spawnCitizen(s: CitizenSeed, start: Tile, plan: Plan, needs: Needs): Citizen {
  return {
    ...s,
    pos: { x: start.x, y: start.y },
    tile: { ...start },
    path: [],
    plan,
    needs,
    action: null,
    actionLabel: 'Getting started',
    cooldown: 0,
    decisionSeq: 0,
    pending: false,
    needsHelp: false,
    helpingId: null,
    helpProgress: 0,
    inside: null,
    lastDecision: null,
    facing: 1,
  };
}

export const homeDoor = (c: CitizenSeed) => buildingById(c.homeId).door;
export const workDoor = (c: CitizenSeed) => (c.workId ? buildingById(c.workId).door : null);

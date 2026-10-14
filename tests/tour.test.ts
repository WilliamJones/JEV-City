import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pickTourBeats, type ReplayLog } from '@/client/controller';

describe('guided opener', () => {
  it('uses only real recorded decisions with split distributions, distinct citizens and actions', () => {
    const log = JSON.parse(readFileSync('public/replays/meteor.json', 'utf8')) as ReplayLog;
    const beats = pickTourBeats(log, 12 * 60 + 39);
    expect(beats.length).toBeGreaterThanOrEqual(3);
    const byId = new Map(log.decisions.map((d) => [d.id, d]));
    const minutes: number[] = [];
    for (const b of beats) {
      const d = byId.get(b.decisionId)!;
      expect(d.provenance).toBe('live');
      const top = Math.max(...Object.values(d.answers!.next_action.probabilities));
      expect(top).toBeLessThanOrEqual(0.85);
      minutes.push(d.simulatedAtMinute);
    }
    expect(new Set(beats.map((b) => b.citizenId)).size).toBe(beats.length);
    expect(new Set(beats.map((b) => byId.get(b.decisionId)!.enactedChoice)).size).toBe(beats.length);
    for (let i = 1; i < minutes.length; i++) expect(minutes[i] - minutes[i - 1]).toBeGreaterThanOrEqual(6);
  });
});

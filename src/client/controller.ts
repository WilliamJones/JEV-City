'use client';
import { asReplayed, rulesDecision } from '@/sim/decisions';
import type { DecisionResultV1, JevAnswers, ScenarioId } from '@/sim/types';
import { SIM_VERSION, Simulation, TICK_MS, type DecisionRequest } from '@/sim/world';

export type Mode = 'replay' | 'live' | 'rules' | 'fallback';

export type ReplayLog = {
  format: 'jev-city-replay-v1';
  scenario: ScenarioId;
  seed: number;
  ticks: number;
  recordedAt: string;
  requestedModel: string;
  decisions: DecisionResultV1[];
};

export type LiveSample = { upstreamMs: number; browserMs: number; inputTokens: number; costUsd: number | null };

export const DEFAULT_SEED = 2401;

export type TourBeat = { decisionId: string; citizenId: string; caption: string };

/**
 * Pick a handful of genuinely interesting recorded decisions for the guided opener:
 * split distributions (not near-certain), different actions, different citizens, after the incident.
 */
export function pickTourBeats(log: ReplayLog, afterMinute: number, count = 4): TourBeat[] {
  const used = new Set<string>(), actions = new Set<string>();
  const out: TourBeat[] = [];
  const candidates = log.decisions
    .filter((d) => d.answers && d.simulatedAtMinute >= afterMinute && d.simulatedAtMinute <= afterMinute + 40)
    .map((d) => ({ d, top: Math.max(...Object.values(d.answers!.next_action.probabilities)) }))
    .filter((x) => x.top >= 0.45 && x.top <= 0.85)
    .sort((a, b) => a.d.simulatedAtMinute - b.d.simulatedAtMinute || a.d.id.localeCompare(b.d.id));
  let lastMinute = -Infinity;
  for (const { d } of candidates) {
    if (used.has(d.citizenId) || actions.has(d.enactedChoice) || d.simulatedAtMinute < lastMinute + 6) continue;
    lastMinute = d.simulatedAtMinute;
    used.add(d.citizenId);
    actions.add(d.enactedChoice);
    out.push({ decisionId: d.id, citizenId: d.citizenId, caption: '' });
    if (out.length === count) break;
  }
  return out;
}

export function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export class Controller {
  sim: Simulation;
  mode: Mode = 'replay';
  speed = 1;
  paused = false;
  night = false;
  selectedId: string | null = null;
  replay: ReplayLog | null = null;
  /** True while a recording is being fetched; the sim does not advance (no silent fallbacks). */
  loading = false;
  replayIndex = new Map<string, DecisionResultV1>();
  liveSamples: LiveSample[] = [];
  liveFailures: Record<string, number> = {};
  fallbackReason: string | null = null;
  remainingToday: number | null = null;
  tour: { beats: TourBeat[]; index: number; active: boolean; endsAt: number | null } = { beats: [], index: 0, active: false, endsAt: null };
  onTourBeat: (citizenId: string | null) => void = () => {};
  /** Bumped whenever UI-visible state changes. */
  version = 0;
  private listeners = new Set<() => void>();
  private acc = 0;
  private last = 0;
  private raf = 0;
  private lastNotify = 0;
  private inflight = 0;

  constructor(public scenario: ScenarioId) {
    this.sim = new Simulation(scenario, DEFAULT_SEED);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  notify(force = false) {
    const now = performance.now();
    if (!force && now - this.lastNotify < 150) return;
    this.lastNotify = now;
    this.version++;
    this.listeners.forEach((l) => l());
  }

  async loadReplay(scenario: ScenarioId) {
    try {
      // Versioned URL: a new sim version never pairs with a stale cached recording.
      const res = await fetch(`/replays/${scenario}.json?v=${SIM_VERSION}`);
      if (!res.ok) throw new Error(String(res.status));
      const log = (await res.json()) as ReplayLog & { simVersion?: number };
      if (log.simVersion !== SIM_VERSION) throw new Error('stale recording');
      this.replay = log;
      this.replayIndex = new Map(log.decisions.map((d) => [d.id, d]));
    } catch {
      this.replay = null;
      this.replayIndex.clear();
    }
  }

  async reset(scenario = this.scenario, mode: Mode = this.mode === 'fallback' ? 'replay' : this.mode) {
    this.scenario = scenario;
    this.mode = mode;
    this.fallbackReason = null;
    this.sim = new Simulation(scenario, DEFAULT_SEED);
    this.night = this.sim.scenario === 'blackout';
    this.selectedId = null;
    if (mode === 'replay') {
      this.loading = true;
      this.notify(true);
      await this.loadReplay(scenario);
      this.loading = false;
    }
    if (mode === 'replay' && !this.replay) {
      this.mode = 'rules';
      this.fallbackReason = 'No recording available for this scenario';
    }
    this.notify(true);
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(250, now - this.last);
      this.last = now;
      if (this.paused || this.loading) return;
      this.acc += dt * this.speed;
      let steps = 0;
      while (this.acc >= TICK_MS && steps < 40) {
        this.dispatch();
        if (!this.sim.step()) { this.acc = Math.min(this.acc, TICK_MS); break; }
        this.acc -= TICK_MS;
        steps++;
      }
      this.dispatch();
      this.advanceTour();
      this.notify();
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    cancelAnimationFrame(this.raf);
  }

  private dispatch() {
    for (const req of this.sim.outbox.splice(0)) {
      if (this.mode === 'replay') {
        const d = this.replayIndex.get(req.key);
        this.sim.provide(req.key, d ? asReplayed(d) : rulesDecision(req, 'fallback', 'missing_recording'));
      } else if (this.mode === 'live') {
        void this.live(req);
      } else {
        this.sim.provide(req.key, rulesDecision(req, this.mode === 'fallback' ? 'fallback' : 'rules', this.fallbackReason ?? undefined));
      }
    }
  }

  private async live(req: DecisionRequest) {
    this.inflight++;
    const t0 = performance.now();
    try {
      const res = await fetch('/api/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.input),
      });
      const browserMs = Math.round(performance.now() - t0);
      const body = await res.json().catch(() => ({ ok: false, errorClass: 'malformed_response' }));
      if (!body.ok) throw Object.assign(new Error(body.errorClass), { errorClass: body.errorClass as string, status: res.status });
      const answers = body.answers as JevAnswers;
      const top = answers.next_action.choice as DecisionResultV1['enactedChoice'];
      this.liveSamples.push({ upstreamMs: body.upstreamMs, browserMs, inputTokens: body.usage.input_tokens, costUsd: body.estimatedApiCostUsd });
      if (typeof body.remainingToday === 'number') this.remainingToday = body.remainingToday;
      this.sim.provide(req.key, {
        id: req.key,
        contractVersion: 'jev-city-decision-v1',
        scenario: req.input.scenario,
        citizenId: req.citizenId,
        simulatedAtMinute: req.input.simulationMinute,
        engine: 'jev',
        provenance: 'live',
        requestedModel: body.requestedModel,
        resolvedModel: body.model,
        modelTopChoice: top,
        enactedChoice: top,
        samplingPolicy: 'argmax',
        answers,
        metrics: {
          upstreamRoundTripMs: body.upstreamMs,
          browserRoundTripMs: browserMs,
          inputTokens: body.usage.input_tokens,
          outputTokens: body.usage.output_tokens,
          estimatedApiCostUsd: body.estimatedApiCostUsd,
          status: 'success',
          capturedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      const errorClass = (e as { errorClass?: string }).errorClass ?? 'network_error';
      this.liveFailures[errorClass] = (this.liveFailures[errorClass] ?? 0) + 1;
      this.sim.provide(req.key, rulesDecision(req, 'fallback', errorClass));
      const fatal = ['live_disabled', 'session_required', 'session_cap', 'global_daily_cap', 'ip_daily_cap', 'budget_store_unavailable', 'bad_origin'];
      if (fatal.includes(errorClass) && this.mode === 'live') {
        this.mode = 'fallback';
        this.fallbackReason = `Live JEV stopped: ${errorClass.replaceAll('_', ' ')}. Showing rules fallback.`;
        this.notify(true);
      }
    } finally {
      this.inflight--;
    }
  }

  /** Exchange the passcode for an HttpOnly live-session cookie. */
  async openLiveSession(passcode: string): Promise<string | null> {
    try {
      const res = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode }) });
      const body = await res.json();
      return body.ok ? null : (body.errorClass as string);
    } catch {
      return 'network_error';
    }
  }

  startTour(afterMinute: number) {
    if (!this.replay) return;
    const beats = pickTourBeats(this.replay, afterMinute);
    this.tour = { beats, index: 0, active: beats.length > 0, endsAt: null };
  }

  stopTour() {
    if (!this.tour.active) return;
    this.tour = { ...this.tour, active: false };
    this.onTourBeat(null);
    this.notify(true);
  }

  private advanceTour() {
    const t = this.tour;
    if (!t.active) return;
    if (t.endsAt !== null && this.sim.tick >= t.endsAt) { this.stopTour(); return; }
    const beat = t.beats[t.index];
    if (!beat) return;
    const c = this.sim.citizens.find((x) => x.id === beat.citizenId);
    if (c?.lastDecision?.id === beat.decisionId) {
      this.selectedId = c.id;
      t.index++;
      if (t.index >= t.beats.length) t.endsAt = this.sim.tick + 120;
      this.onTourBeat(c.id);
      this.notify(true);
    }
  }

  get currentBeat() {
    return this.tour.active && this.tour.index > 0 ? this.tour.beats[this.tour.index - 1] : null;
  }

  get selected() {
    return this.sim.citizens.find((c) => c.id === this.selectedId) ?? null;
  }

  liveStats() {
    const up = this.liveSamples.map((s) => s.upstreamMs).sort((a, b) => a - b);
    const br = this.liveSamples.map((s) => s.browserMs).sort((a, b) => a - b);
    const cost = this.liveSamples.reduce((a, s) => a + (s.costUsd ?? 0), 0);
    return {
      n: up.length,
      upstreamP50: percentile(up, 50),
      upstreamP95: percentile(up, 95),
      browserP50: percentile(br, 50),
      browserP95: percentile(br, 95),
      failures: Object.values(this.liveFailures).reduce((a, b) => a + b, 0),
      costUsd: this.liveSamples.some((s) => s.costUsd !== null) ? cost : null,
    };
  }

  replayStats() {
    if (!this.replay) return null;
    const live = this.replay.decisions.filter((d) => d.metrics.status === 'success' && d.metrics.upstreamRoundTripMs !== null);
    const up = live.map((d) => d.metrics.upstreamRoundTripMs!).sort((a, b) => a - b);
    return {
      n: up.length,
      total: this.replay.decisions.length,
      p50: percentile(up, 50),
      p95: percentile(up, 95),
      recordedAt: this.replay.recordedAt,
      model: live[0]?.resolvedModel ?? this.replay.requestedModel,
      costUsd: live.reduce((a, d) => a + (d.metrics.estimatedApiCostUsd ?? 0), 0),
      inputTokens: live.reduce((a, d) => a + (d.metrics.inputTokens ?? 0), 0),
    };
  }
}

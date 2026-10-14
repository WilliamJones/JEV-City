'use client';
import type { Controller } from '@/client/controller';
import { ACTION_COLOR, ACTION_LABEL, hex, SHIRTS } from '@/client/palette';
import type { Citizen } from '@/sim/citizens';
import type { ActionId, DecisionResultV1, ScoreAnswer } from '@/sim/types';
import { MODE_BADGE } from './TopBar';
import { InfoTip } from './help/InfoTip';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const FALLBACK_REASON: Record<string, string> = {
  missing_recording: 'not in the recording',
  timeout: 'live call timed out',
  network_error: 'network error',
  budget_exhausted: 'live budget used up',
  global_daily_cap: 'daily live budget used up',
  session_required: 'live session expired',
};
const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const PROV: Record<DecisionResultV1['provenance'], { label: string; color: string; note: string }> = {
  live: { label: 'LIVE JEV', color: MODE_BADGE.live.color, note: 'Measured just now from the TypeSafe API.' },
  recorded: { label: 'RECORDED JEV', color: MODE_BADGE.replay.color, note: 'Real JEV output captured earlier and replayed. No live call was made.' },
  rules: { label: 'RULES', color: MODE_BADGE.rules.color, note: 'Developer heuristic. Not model output.' },
  fallback: { label: 'FALLBACK', color: MODE_BADGE.fallback.color, note: 'JEV unavailable; rules fallback used. No model probabilities shown.' },
};

function Section({ title, aside, help, children }: { title: string; aside?: React.ReactNode; help?: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-3.5" style={{ borderTop: '1px solid var(--panel-border)' }}>
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>{title}{help && <InfoTip section={help} label={`About: ${title}`} />}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ChoiceBars({ probs, top, enacted }: { probs: Record<string, number>; top: string | null; enacted: string }) {
  const rows = Object.entries(probs).sort((a, b) => b[1] - a[1]);
  return (
    <ul className="space-y-2">
      {rows.map(([id, p]) => {
        const color = hex(ACTION_COLOR[id as ActionId]);
        return (
          <li key={id}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[13px]">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
                {ACTION_LABEL[id as ActionId]}
                {id === top && <span className="rounded px-1 py-px text-[10px] font-bold text-white" style={{ background: 'var(--teal)' }}>TOP CHOICE</span>}
                {id === enacted && <span className="rounded px-1 py-px text-[10px] font-bold" style={{ border: '1px solid var(--ink)', color: 'var(--ink)' }}>ENACTED</span>}
              </span>
              <span className="font-[family-name:var(--font-mono)] text-xs font-semibold tabular-nums">{pct(p)}</span>
            </div>
            <div className="bar-track h-2"><div className="bar-fill" style={{ width: `${Math.max(1.5, p * 100)}%`, background: color }} /></div>
          </li>
        );
      })}
    </ul>
  );
}

function ScoreDist({ s, accent }: { s: ScoreAnswer; accent: string }) {
  const levels = ['0', '1', '2', '3'];
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-[family-name:var(--font-mono)] text-2xl font-semibold tabular-nums">{s.score.toFixed(2)}</span>
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>/ 3 · confidence {pct(s.confidence)}</span>
      </div>
      <div className="flex h-10 items-end gap-1">
        {levels.map((l) => (
          <div key={l} className="flex h-full flex-1 flex-col justify-end" title={s.legend[l]}>
            <div className="w-full rounded-t" style={{ height: `${Math.max(4, (s.probabilities[l] ?? 0) * 100)}%`, background: accent, opacity: 0.35 + (s.probabilities[l] ?? 0) * 0.65 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-center text-[10px] tabular-nums" style={{ color: 'var(--ink-faint)' }}>
        {levels.map((l) => <span key={l} className="flex-1">{l} · {pct(s.probabilities[l] ?? 0)}</span>)}
      </div>
      <p className="mt-1.5 text-xs" style={{ color: 'var(--ink-soft)' }}>{s.legend[String(Math.round(s.score))]}</p>
    </div>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0" style={{ color: 'var(--ink-soft)' }}>{label}</span>
      <div className="bar-track h-1.5 flex-1"><div className="bar-fill" style={{ width: `${value * 100}%`, background: color }} /></div>
      <span className="w-8 text-right font-[family-name:var(--font-mono)] tabular-nums">{value.toFixed(2)}</span>
    </div>
  );
}

export function Inspector({ ctrl, citizen: c }: { ctrl: Controller; citizen: Citizen }) {
  const d = c.lastDecision;
  const prov = d ? PROV[d.provenance] : null;
  const a = d?.answers;
  return (
    <div>
      <div className="flex items-start gap-3 px-5 pb-3.5 pt-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: c.role === 'responder' ? '#d84d56' : c.role === 'healthcare' ? '#2d8f91' : hex(SHIRTS[c.look.shirt]) }}>
          {c.name.split(' ').map((n) => n[0]).join('')}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold leading-tight">{c.name}, {c.age}</h2>
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{c.occupation} · {c.role}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold">
            {c.needsHelp ? <span style={{ color: 'var(--coral)' }}>● Needs help — waiting for a neighbor</span> : <>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.action ? hex(ACTION_COLOR[c.action]) : 'var(--ink-faint)' }} />
              {c.actionLabel}
            </>}
          </p>
        </div>
        <button className="chip px-2.5 py-1 text-xs font-semibold" onClick={() => { ctrl.selectedId = null; ctrl.notify(true); }} aria-label="Close inspector">✕</button>
      </div>

      {!d && <p className="px-5 pb-4 text-sm" style={{ color: 'var(--ink-soft)' }}>{c.pending ? 'Deciding…' : 'No decision yet — this citizen will decide shortly.'}</p>}

      {d && prov && (
        <>
          <Section
            title={`Decision #${d.id.split('#')[1]} · ${fmtMin(d.simulatedAtMinute)}`}
            help="inspector"
            aside={<span className="flex items-center"><span className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider text-white" style={{ background: prov.color }}>{prov.label}</span><InfoTip section="modes" label="What this label means" /></span>}
          >
            {a ? (
              <>
                <p className="mb-2.5 text-xs" style={{ color: 'var(--ink-soft)' }}>JEV <b>choice</b> over the {Object.keys(a.next_action.probabilities).length} actions that were feasible right now · confidence {pct(a.next_action.confidence)}</p>
                <ChoiceBars probs={a.next_action.probabilities} top={d.modelTopChoice} enacted={d.enactedChoice} />
              </>
            ) : d.ruleWeights ? (
              <>
                <p className="mb-2.5 text-xs" style={{ color: 'var(--ink-soft)' }}>{d.provenance === 'fallback' ? `No JEV answer for this decision (${FALLBACK_REASON[d.metrics.errorClass ?? ''] ?? d.metrics.errorClass ?? 'unknown reason'}) — rules fallback weights` : 'Rules baseline weights'} (developer heuristic, <b>not</b> model probabilities).</p>
                <ChoiceBars probs={d.ruleWeights} top={null} enacted={d.enactedChoice} />
              </>
            ) : null}
            {d.overrideReason && (
              <p className="mt-3 rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'var(--chip)' }}>
                <b>Guardrail:</b> enacted “{ACTION_LABEL[d.enactedChoice]}” — {d.overrideReason}.
              </p>
            )}
            <p className="mt-2 text-[10px]" style={{ color: 'var(--ink-faint)' }}>Percentages rounded. Enacted = model top choice (argmax) unless a labeled guardrail applies.</p>
          </Section>

          {a && (
            <>
              <Section title="Perceived risk · JEV score" help="inspector">
                <ScoreDist s={a.perceived_risk} accent="var(--coral)" />
              </Section>
              <Section title="Duty pressure · JEV score" help="inspector">
                <ScoreDist s={a.duty_pressure} accent="var(--teal)" />
              </Section>
              <Section title="Would interrupt routine · JEV noul" help="glossary">
                <div className="flex items-center gap-3">
                  <span className="font-[family-name:var(--font-mono)] text-2xl font-semibold tabular-nums">{pct(a.would_interrupt_routine.noul)}</span>
                  <div className="bar-track h-2.5 flex-1"><div className="bar-fill" style={{ width: pct(a.would_interrupt_routine.noul), background: 'var(--amber)' }} /></div>
                </div>
                <p className="mt-1.5 text-[11px]" style={{ color: 'var(--ink-faint)' }}>Independent judgment on the same state. It does not causally drive the choice above.</p>
              </Section>
            </>
          )}
        </>
      )}

      <Section title="What JEV saw" help="inspector">
        <div className="space-y-1.5">
          <Meter label="Caution" value={c.traits.caution} color="#4f7cc9" />
          <Meter label="Altruism" value={c.traits.altruism} color="var(--coral)" />
          <Meter label="Sociability" value={c.traits.sociability} color="var(--teal)" />
          <Meter label="Fatigue" value={c.needs.fatigue} color="#8a97a6" />
          <Meter label="Supply need" value={c.needs.supplies} color="var(--amber)" />
        </div>
        {d && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            {(() => {
              const req = d;
              const facts: string[] = [];
              const s = ctrl.sim;
              if (s.blackout) facts.push('Blackout');
              const hz = s.hazardLevelAt(c.tile);
              if (hz !== 'none') facts.push(`Hazard: ${hz}`);
              if (req.answers?.duty_pressure && (c.role === 'healthcare' || c.role === 'responder') && s.incidentActive) facts.push('On duty');
              facts.push(`Plan: ${c.plan.replaceAll('_', ' ')}`);
              return facts.map((f) => <span key={f} className="chip px-2 py-0.5">{f}</span>);
            })()}
          </div>
        )}
      </Section>

      {d && (
        <Section title="Provenance" help="performance">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <dt style={{ color: 'var(--ink-faint)' }}>Source</dt><dd>{prov?.note}</dd>
            <dt style={{ color: 'var(--ink-faint)' }}>Model</dt><dd className="font-[family-name:var(--font-mono)]">{d.resolvedModel ?? '—'}</dd>
            <dt style={{ color: 'var(--ink-faint)' }}>Upstream round-trip</dt>
            <dd className="font-[family-name:var(--font-mono)]">{d.metrics.upstreamRoundTripMs !== null ? `${d.metrics.upstreamRoundTripMs} ms${d.provenance === 'recorded' ? ' (historical)' : ''}` : 'Not measured'}</dd>
            {d.metrics.browserRoundTripMs !== null && <><dt style={{ color: 'var(--ink-faint)' }}>Browser round-trip</dt><dd className="font-[family-name:var(--font-mono)]">{d.metrics.browserRoundTripMs} ms</dd></>}
            <dt style={{ color: 'var(--ink-faint)' }}>Tokens</dt><dd className="font-[family-name:var(--font-mono)]">{d.metrics.inputTokens !== null ? `${d.metrics.inputTokens} in · ${d.metrics.outputTokens} out` : '—'}</dd>
            <dt style={{ color: 'var(--ink-faint)' }}>Est. API cost</dt><dd className="font-[family-name:var(--font-mono)]">{d.metrics.estimatedApiCostUsd !== null ? `$${d.metrics.estimatedApiCostUsd.toFixed(7)}` : '—'}</dd>
            {d.metrics.capturedAt && <><dt style={{ color: 'var(--ink-faint)' }}>Captured</dt><dd>{new Date(d.metrics.capturedAt).toLocaleString()}</dd></>}
            {d.metrics.errorClass && <><dt style={{ color: 'var(--ink-faint)' }}>Fallback reason</dt><dd>{d.metrics.errorClass}</dd></>}
          </dl>
          <p className="mt-2 text-[10px]" style={{ color: 'var(--ink-faint)' }}>Cost is a token-based estimate (input $0.042/M tokens, output free), not a billed amount.</p>
        </Section>
      )}
    </div>
  );
}

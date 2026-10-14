'use client';
import { Fragment, useState } from 'react';
import type { Citizen } from '@/sim/citizens';
import type { Controller } from '@/client/controller';
import { ACTION_COLOR, ACTION_LABEL, hex } from '@/client/palette';
import { ACTION_IDS } from '@/sim/types';
import { SCENARIO_META } from '@/sim/world';
import { InfoTip } from './help/InfoTip';

const ms = (v: number | null) => (v === null ? 'Not measured' : `${v} ms`);

export function Overview({ ctrl }: { ctrl: Controller }) {
  const sim = ctrl.sim;
  const counts = Object.fromEntries(ACTION_IDS.map((a) => [a, 0])) as Record<string, number>;
  for (const c of sim.citizens) if (c.action && !c.needsHelp) counts[c.action]++;
  const needy = sim.citizens.filter((c) => c.needsHelp).length;
  const decided = sim.citizens.filter((c) => c.lastDecision).length;
  const total = sim.citizens.length;
  const live = ctrl.liveStats();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const STATUS: Record<string, (c: Citizen) => boolean> = {
    all: () => true,
    help: (c) => c.needsHelp,
    injured: (c) => c.injury !== 'none',
    working: (c) => !!c.utility || !!c.trafficJob || (c.action === 'report_for_duty' && !c.path.length),
    unaware: (c) => c.alert === 'none',
  };
  const shown = sim.citizens.filter((c) => (role === 'all' || c.role === role) && STATUS[status](c) && (!q || `${c.name} ${c.occupation} ${c.actionLabel}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 60);
  const rep = ctrl.replayStats();

  return (
    <div>
      <div className="px-5 pb-3 pt-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">{SCENARIO_META[sim.scenario].title}</h2>
        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
          {SCENARIO_META[sim.scenario].blurb} {sim.citizens.length} citizens each decide what to do next with JEV. Click anyone to see exactly what JEV returned.
        </p>
      </div>

      <section className="px-5 py-3" style={{ borderTop: '1px solid var(--panel-border)' }}>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>What the city is doing<InfoTip section="legend" label="Action colors" /></h3>
        <div className="mb-2 flex h-3 overflow-hidden rounded-full" style={{ background: 'var(--track)' }} aria-hidden>
          {ACTION_IDS.map((a) => counts[a] > 0 && <div key={a} style={{ width: `${(counts[a] / total) * 100}%`, background: hex(ACTION_COLOR[a]) }} className="transition-all duration-500" />)}
          {needy > 0 && <div style={{ width: `${(needy / total) * 100}%`, background: 'repeating-linear-gradient(45deg,#f17961,#f17961 3px,#fff 3px,#fff 5px)' }} />}
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {ACTION_IDS.filter((a) => counts[a] > 0).map((a) => (
            <li key={a} className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: hex(ACTION_COLOR[a]) }} />{ACTION_LABEL[a]}<span className="ml-auto font-[family-name:var(--font-mono)] tabular-nums">{counts[a]}</span></li>
          ))}
          {needy > 0 && <li className="flex items-center gap-1.5" style={{ color: 'var(--coral)' }}><span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--coral)' }} />Needs help<span className="ml-auto font-[family-name:var(--font-mono)] tabular-nums">{needy}</span></li>}
        </ul>
        <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-faint)' }}>{decided}/{total} citizens have made at least one decision.</p>
      </section>

      <CityStatus ctrl={ctrl} />

      <section className="px-5 py-3" style={{ borderTop: '1px solid var(--panel-border)' }}>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>Measured performance<InfoTip section="performance" label="What these numbers mean" /></h3>
        {ctrl.mode === 'live' || live.n > 0 ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Upstream p50" value={ms(live.upstreamP50)} />
            <Stat label="Upstream p95" value={ms(live.upstreamP95)} />
            <Stat label="Browser p50" value={ms(live.browserP50)} />
            <Stat label="Live calls (n)" value={String(live.n)} />
            <Stat label="Failures" value={String(live.failures)} />
            <Stat label="Est. cost" value={live.costUsd === null ? '—' : `$${live.costUsd.toFixed(5)}`} />
          </div>
        ) : rep ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Upstream p50" value={ms(rep.p50)} />
              <Stat label="Upstream p95" value={ms(rep.p95)} />
              <Stat label="Decisions (n)" value={String(rep.n)} />
            </div>
            <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
              Historical: real <span className="font-[family-name:var(--font-mono)]">{rep.model}</span> calls recorded {new Date(rep.recordedAt).toLocaleDateString()} from a server, not this browser. Whole recording: {rep.inputTokens.toLocaleString()} input tokens ≈ ${rep.costUsd.toFixed(4)} (token-based estimate). Replay makes no live calls.
            </p>
          </>
        ) : (
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Not measured — rules baseline runs locally with no model calls.</p>
        )}
      </section>

      <section className="px-5 py-3" style={{ borderTop: '1px solid var(--panel-border)' }}>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>Citizens<InfoTip section="inspector" label="How to inspect a citizen" /></h3>
        {sim.citizens.length > 30 && <CitizenFilters q={q} setQ={setQ} role={role} setRole={setRole} status={status} setStatus={setStatus} shown={shown.length} total={sim.citizens.length} />}
        <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {shown.map((c) => (
            <li key={c.id}>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-[var(--chip)]" onClick={() => { ctrl.selectedId = c.id; ctrl.notify(true); }}>
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: c.needsHelp ? 'var(--coral)' : c.action ? hex(ACTION_COLOR[c.action]) : 'var(--ink-faint)' }} />
                <span className="font-semibold">{c.name.split(' ')[0]}</span>
                <span className="truncate" style={{ color: 'var(--ink-faint)' }}>{c.needsHelp ? 'needs help' : c.inside ? `${c.actionLabel.toLowerCase()} · inside` : c.actionLabel.toLowerCase()}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Live facts from the simulation state (never estimates): injuries, clinic, awareness, fire/flood/festival progress. */
function CityStatus({ ctrl }: { ctrl: Controller }) {
  const sim = ctrl.sim;
  const rows: [string, string][] = [];
  const injured = sim.citizens.filter((c) => c.injury !== 'none').length;
  const clinic = sim.clinicLoad();
  if (injured || clinic.treating || clinic.queued) rows.push(['Injured', `${injured}${clinic.treating || clinic.queued ? ` · clinic: ${clinic.treating} treating, ${clinic.queued} waiting (${clinic.capacity} beds)` : ''}`]);
  if (sim.fireActive || sim.floodActive) rows.push(['Know about it', `${sim.citizens.filter((c) => c.alert !== 'none').length} of ${sim.citizens.length}`]);
  if (sim.scenario === 'building_fire' && sim.fire.phase !== 'none') {
    const f = sim.fire;
    rows.push(['Fire', f.phase === 'suppression' ? `being fought · ${Math.round(f.progress * 100)}% · ${f.respondersOnSite} responder${f.respondersOnSite === 1 ? '' : 's'} on site` : f.phase === 'reopened' ? 'out · streets reopened' : f.phase === 'contained' ? 'out · cooling' : f.engine.dispatched ? `${f.phase} · engine on the way` : f.phase]);
  }
  if (sim.scenario === 'flash_flood' && sim.flood.phase !== 'none') rows.push(['Flooded tiles', `${sim.flood.depth.filter((d) => d > 0).length} (${sim.flood.phase})`]);
  const o = sim.power.order;
  if (o) {
    const crew = sim.citizens.filter((c) => c.utility?.stage === 'working').map((c) => c.name.split(' ')[0]);
    rows.push(['Power', sim.power.status === 'restored' ? 'restored' : `${sim.power.status} · repair ${Math.round((o.workCompleted / o.workRequired) * 100)}%${crew.length ? ` · on site: ${crew.join(', ')}` : ''}${o.contractor.stage === 'working' ? ' + backup crew' : o.contractor.stage === 'driving' ? ' · backup crew driving in' : ''}`]);
  }
  if (sim.blackout) {
    const tr = sim.traffic;
    const dark = tr.intersections.filter((i) => tr.control[i.id].mode !== 'signals').length;
    const directed = tr.intersections.filter((i) => tr.control[i.id].mode === 'responder_directed').length;
    const queued = tr.intersections.reduce((a, i) => a + tr.stats[i.id].queued, 0);
    rows.push(['Traffic', `${dark}/${tr.intersections.length} signals dark · ${directed} directed by responders · ${queued} cars queued`]);
  }
  if (sim.scenario === 'street_festival') rows.push(['Festival', `${sim.festival.phase} · ${sim.festivalCrowd()} attending`]);
  const reunions = sim.events.filter((e) => / found .* — /.test(e.text)).length;
  const warnings = sim.events.filter((e) => / warned /.test(e.text)).length;
  if (reunions || warnings) rows.push(['Chains', `${warnings} warning${warnings === 1 ? '' : 's'} passed on · ${reunions} famil${reunions === 1 ? 'y' : 'ies'} reunited`]);
  if (!rows.length) return null;
  return (
    <section className="px-5 py-3" style={{ borderTop: '1px solid var(--panel-border)' }}>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>City status<InfoTip section="scenarios" label="Scenario timelines" /></h3>
      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([k, v]) => <Fragment key={k}><dt style={{ color: 'var(--ink-faint)' }}>{k}</dt><dd>{v}</dd></Fragment>)}
      </dl>
    </section>
  );
}

function CitizenFilters(p: { q: string; setQ: (v: string) => void; role: string; setRole: (v: string) => void; status: string; setStatus: (v: string) => void; shown: number; total: number }) {
  return (
    <div className="mb-2 space-y-1.5">
      <input value={p.q} onChange={(e) => p.setQ(e.target.value)} placeholder="Search name, job or what they’re doing…" aria-label="Search citizens" className="chip w-full px-3 py-1.5 text-xs outline-none" />
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by role">
        {['all', 'resident', 'service', 'healthcare', 'responder', 'utility'].map((r) => (
          <button key={r} aria-pressed={p.role === r} onClick={() => p.setRole(r)} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={p.role === r ? { background: 'var(--teal)', color: '#fff' } : { background: 'var(--chip)', color: 'var(--ink-soft)' }}>{r}</button>
        ))}
        <select value={p.status} onChange={(e) => p.setStatus(e.target.value)} aria-label="Filter by status" className="chip ml-auto px-2 py-0.5 text-[11px]">
          <option value="all">any status</option><option value="help">needs help</option><option value="injured">injured</option><option value="working">on a job</option><option value="unaware">hasn’t heard</option>
        </select>
      </div>
      <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>Showing {p.shown}{p.shown === 60 ? '+' : ''} of {p.total}. Or click anyone on the map.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="chip rounded-xl px-1 py-2" style={{ borderRadius: 12 }}>
      <div className="font-[family-name:var(--font-mono)] text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{label}</div>
    </div>
  );
}

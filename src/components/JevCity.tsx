'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Controller, type Mode } from '@/client/controller';
import type { CityRenderer } from '@/client/renderer';
import type { ScenarioId } from '@/sim/types';
import { TopBar } from './TopBar';
import { Inspector } from './Inspector';
import { Overview } from './Overview';
import { EventFeed } from './EventFeed';
import { LiveDialog } from './LiveDialog';
import { TourCaption } from './TourCaption';

export default function JevCity() {
  const ctrlRef = useRef<Controller | null>(null);
  if (!ctrlRef.current) ctrlRef.current = new Controller('meteor');
  const ctrl = ctrlRef.current;
  useSyncExternalStore(ctrl.subscribe, ctrl.getVersion, () => 0);

  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveInfo, setLiveInfo] = useState<{ liveEnabled: boolean; passcodeRequired: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderer: CityRenderer | null = null;
    void (async () => {
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __jev: Controller }).__jev = ctrl;
      await ctrl.reset('meteor', 'replay');
      const { CityRenderer } = await import('@/client/renderer');
      if (cancelled || !canvasRef.current) return;
      renderer = new CityRenderer();
      rendererRef.current = renderer;
      renderer.onSelect = (id) => { ctrl.stopTour(); ctrl.selectedId = id; ctrl.notify(true); };
      renderer.onUserCamera = () => ctrl.stopTour();
      ctrl.onTourBeat = (id) => renderer?.focusCitizen(id ? ctrl.sim.citizens.find((c) => c.id === id) ?? null : null);
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __jevR: CityRenderer }).__jevR = renderer;
      await renderer.init(canvasRef.current, ctrl);
      ctrl.startTour(12 * 60 + 39);
      ctrl.start();
    })();
    fetch('/api/decision').then((r) => r.json()).then(setLiveInfo).catch(() => setLiveInfo({ liveEnabled: false, passcodeRequired: true }));
    return () => {
      cancelled = true;
      ctrl.stop();
      renderer?.destroy();
    };
  }, [ctrl]);

  useEffect(() => {
    document.documentElement.dataset.theme = ctrl.night ? 'night' : 'day';
  }, [ctrl.night]);

  const changeScenario = useCallback((s: ScenarioId) => { ctrl.stopTour(); void ctrl.reset(s, ctrl.mode === 'live' ? 'live' : 'replay'); }, [ctrl]);
  const changeMode = useCallback((m: Mode) => {
    ctrl.stopTour();
    if (m === 'live') { setLiveOpen(true); return; }
    void ctrl.reset(ctrl.scenario, m);
  }, [ctrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === ' ') { e.preventDefault(); ctrl.paused = !ctrl.paused; ctrl.notify(true); }
      if (e.key === 'Escape') { ctrl.stopTour(); ctrl.selectedId = null; ctrl.notify(true); }
      if (e.key === 'n') { ctrl.night = !ctrl.night; ctrl.notify(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctrl]);

  const selected = ctrl.selected;

  return (
    <div className="sky flex h-dvh flex-col gap-3 p-3 lg:p-4">
      <TopBar ctrl={ctrl} onScenario={changeScenario} onMode={changeMode} liveAvailable={!!liveInfo?.liveEnabled} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-2xl">
          <div ref={canvasRef} className="absolute inset-0" aria-label="Isometric city simulation. Use the citizen list in the side panel for keyboard access." role="img" />
          <div className="vignette pointer-events-none absolute inset-0" aria-hidden />
          {ctrl.currentBeat && <TourCaption ctrl={ctrl} />}
          {ctrl.fallbackReason && (
            <div className="panel absolute left-3 top-3 max-w-md px-3 py-2 text-xs font-medium" role="status">
              <span className="mr-1 font-bold" style={{ color: 'var(--coral)' }}>FALLBACK</span>
              {ctrl.fallbackReason}
            </div>
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 hidden text-[11px] font-medium sm:block" style={{ color: 'var(--ink-soft)' }}>
            Click a citizen to inspect · drag to pan · scroll to zoom · space to pause · N for night
          </div>
          <button
            className="panel absolute bottom-3 right-3 px-3 py-1.5 text-xs font-semibold"
            onClick={() => rendererRef.current?.resetCamera()}
          >
            Recenter
          </button>
        </div>
        <aside className="flex min-h-0 w-full flex-col gap-3 lg:w-[400px] xl:w-[440px]">
          <div className="panel scroll-thin min-h-0 flex-1 overflow-y-auto">
            {selected ? <Inspector ctrl={ctrl} citizen={selected} /> : <Overview ctrl={ctrl} />}
          </div>
          <EventFeed ctrl={ctrl} />
        </aside>
      </div>
      {liveOpen && (
        <LiveDialog
          passcodeRequired={liveInfo?.passcodeRequired ?? true}
          onCancel={() => setLiveOpen(false)}
          onStart={async (code) => {
            const error = await ctrl.openLiveSession(code);
            if (error) return error;
            ctrl.liveSamples = [];
            ctrl.liveFailures = {};
            setLiveOpen(false);
            void ctrl.reset(ctrl.scenario, 'live');
            return null;
          }}
        />
      )}
    </div>
  );
}

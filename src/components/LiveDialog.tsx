'use client';
import { useState } from 'react';

const ERRORS: Record<string, string> = {
  passcode_required: 'That passcode is not right.',
  live_disabled: 'Live mode is switched off on this deployment.',
  passcode_not_configured: 'Live mode is not configured on this deployment.',
  session_secret_not_configured: 'Live mode is not configured on this deployment.',
};

export function LiveDialog({ passcodeRequired, onStart, onCancel }: { passcodeRequired: boolean; onStart: (code: string) => Promise<string | null>; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-labelledby="live-title" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <form
        className="panel w-full max-w-sm p-5"
        style={{ background: 'var(--panel-solid)' }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const err = await onStart(code);
          setBusy(false);
          if (err) setError(ERRORS[err] ?? `Could not start live mode (${err}).`);
        }}
      >
        <h2 id="live-title" className="font-[family-name:var(--font-display)] text-lg font-bold">Run live JEV</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Every citizen decision becomes a real call to TypeSafe JEV (<span className="font-[family-name:var(--font-mono)]">jev-1.13.0</span>) through a guarded server proxy. Timings shown are measured, not simulated. Usage is capped; if the cap is hit the city falls back to rules and says so.
        </p>
        {passcodeRequired && (
          <label className="mt-4 block text-xs font-semibold">
            Demo passcode
            <input autoFocus type="password" value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--chip)', border: '1px solid var(--panel-border)' }} />
          </label>
        )}
        {error && <p className="mt-3 text-sm font-medium" style={{ color: 'var(--coral)' }} role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="chip px-4 py-2 text-sm font-semibold" onClick={onCancel}>Cancel</button>
          <button type="submit" className="rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ background: 'var(--coral)' }} disabled={busy}>{busy ? 'Starting…' : 'Start live run'}</button>
        </div>
      </form>
    </div>
  );
}

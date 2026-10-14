import { buildJevRequest, PINNED_MODEL, validateJevResponse, type ValidatedJevResponse } from './contract';
import type { CitizenDecisionInput } from '@/sim/types';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

export type JevCallResult =
  | { ok: true; value: ValidatedJevResponse; upstreamMs: number; attempts: number; requestedModel: string }
  | { ok: false; errorClass: string; upstreamMs: number | null; attempts: number };

/**
 * Calls the official TypeSafe System One endpoint. Server-only: reads the key from the caller.
 * Retries 429/529 at most once; every attempt counts toward the caller's budget via onAttempt.
 */
export async function callJev(
  input: CitizenDecisionInput,
  opts: { apiKey: string; model?: string; timeoutMs?: number; onAttempt?: () => Promise<boolean> },
): Promise<JevCallResult> {
  const model = opts.model ?? PINNED_MODEL;
  const body = JSON.stringify(buildJevRequest(input, model));
  let attempts = 0;
  for (;;) {
    if (opts.onAttempt && !(await opts.onAttempt())) return { ok: false, errorClass: 'budget_exhausted', upstreamMs: null, attempts };
    attempts++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 6000);
    const t0 = performance.now();
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal: ctrl.signal,
      });
      const upstreamMs = Math.round(performance.now() - t0);
      if ((res.status === 429 || res.status === 529) && attempts < 2) {
        const ra = Number(res.headers.get('retry-after'));
        await new Promise((r) => setTimeout(r, Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 2000) : 400));
        continue;
      }
      if (!res.ok) return { ok: false, errorClass: `http_${res.status}`, upstreamMs, attempts };
      const raw = await res.json().catch(() => null);
      const v = validateJevResponse(raw, input.eligibleActionIds);
      if (!v.ok) return { ok: false, errorClass: `contract_violation: ${v.error}`, upstreamMs, attempts };
      return { ok: true, value: v.value, upstreamMs, attempts, requestedModel: model };
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      return { ok: false, errorClass: aborted ? 'timeout' : 'network_error', upstreamMs: null, attempts };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Token-based estimate only, from a documented tariff set in env. Null when no tariff is configured. */
export function estimateCostUsd(usage: { input_tokens: number; output_tokens: number }): number | null {
  const inP = Number(process.env.JEV_PRICE_INPUT_PER_MTOK);
  const outP = Number(process.env.JEV_PRICE_OUTPUT_PER_MTOK);
  if (!Number.isFinite(inP) || !Number.isFinite(outP) || !process.env.JEV_PRICE_INPUT_PER_MTOK) return null;
  return (usage.input_tokens * inP + usage.output_tokens * outP) / 1_000_000;
}

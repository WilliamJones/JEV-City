import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getBudget } from '@/jev/budget';
import { callJev, estimateCostUsd } from '@/jev/client';
import { CitizenDecisionInputSchema, PINNED_MODEL } from '@/jev/contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 4096;

function liveConfig() {
  const enabled = process.env.JEV_LIVE_ENABLED === 'true' && !!process.env.TYPESAFE_API_KEY;
  const passcode = process.env.JEV_LIVE_PASSCODE ?? '';
  return { enabled, passcodeRequired: passcode.length > 0 || process.env.NODE_ENV === 'production', passcode };
}

function passcodeOk(given: string | null, expected: string) {
  if (!expected) return process.env.NODE_ENV !== 'production';
  if (!given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const err = (status: number, errorClass: string) => NextResponse.json({ ok: false, errorClass }, { status });

export async function GET() {
  const c = liveConfig();
  return NextResponse.json({ liveEnabled: c.enabled, passcodeRequired: c.passcodeRequired, model: PINNED_MODEL });
}

export async function POST(req: NextRequest) {
  const cfg = liveConfig();
  if (!cfg.enabled) return err(503, 'live_disabled');

  // Same-origin only (CSRF defense for a spend-triggering endpoint).
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) return err(403, 'bad_origin');

  if (!passcodeOk(req.headers.get('x-live-passcode'), cfg.passcode)) return err(401, 'passcode_required');

  const text = await req.text();
  if (text.length > MAX_BODY) return err(413, 'body_too_large');
  let json: unknown;
  try { json = JSON.parse(text); } catch { return err(400, 'invalid_json'); }
  const parsed = CitizenDecisionInputSchema.safeParse(json);
  if (!parsed.success) return err(422, 'invalid_input');

  const budget = getBudget();
  if (!budget) return err(503, 'budget_store_unavailable');
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  let remainingToday: number | undefined;
  let budgetReason: string | undefined;

  const r = await callJev(parsed.data, {
    apiKey: process.env.TYPESAFE_API_KEY!,
    model: PINNED_MODEL,
    timeoutMs: 5000,
    onAttempt: async () => {
      const b = await budget.reserve(ip);
      remainingToday = b.remainingToday;
      budgetReason = b.reason;
      return b.ok;
    },
  });

  if (!r.ok) {
    const status = r.errorClass === 'budget_exhausted' ? 429 : 502;
    return NextResponse.json({ ok: false, errorClass: budgetReason ?? r.errorClass, upstreamMs: r.upstreamMs }, { status });
  }
  return NextResponse.json({
    ok: true,
    requestedModel: r.requestedModel,
    model: r.value.model,
    answers: r.value.answers,
    usage: r.value.usage,
    upstreamMs: r.upstreamMs,
    estimatedApiCostUsd: estimateCostUsd(r.value.usage),
    remainingToday,
  });
}

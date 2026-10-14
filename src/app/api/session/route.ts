import { NextResponse, type NextRequest } from 'next/server';
import { createSession, passcodeMatches, SESSION_COOKIE, SESSION_TTL_S } from '@/jev/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const err = (status: number, errorClass: string) => NextResponse.json({ ok: false, errorClass }, { status });

/** Exchange the demo passcode for a short-lived live session cookie. */
export async function POST(req: NextRequest) {
  if (process.env.JEV_LIVE_ENABLED !== 'true' || !process.env.TYPESAFE_API_KEY) return err(503, 'live_disabled');
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) return err(403, 'bad_origin');

  const expected = process.env.JEV_LIVE_PASSCODE ?? '';
  let given = '';
  try {
    const body = (await req.json()) as { passcode?: unknown };
    given = typeof body.passcode === 'string' ? body.passcode.slice(0, 200) : '';
  } catch {
    return err(400, 'invalid_json');
  }
  if (expected) {
    if (!passcodeMatches(given, expected)) return err(401, 'passcode_required');
  } else if (process.env.NODE_ENV === 'production') {
    return err(503, 'passcode_not_configured');
  }

  const s = createSession();
  if (!s) return err(503, 'session_secret_not_configured');
  const res = NextResponse.json({ ok: true, expiresAt: s.exp });
  res.cookies.set(SESSION_COOKIE, s.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
    maxAge: SESSION_TTL_S,
  });
  return res;
}

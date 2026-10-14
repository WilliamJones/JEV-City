import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Live-mode sessions: a passcode is exchanged once for a short-lived, HMAC-signed,
 * HttpOnly cookie. The decision route only accepts requests carrying a valid session.
 */
export const SESSION_COOKIE = 'jev_live';
export const SESSION_TTL_S = 20 * 60;

const devSecret = randomBytes(32).toString('hex');

function secret(): string | null {
  const s = process.env.JEV_SESSION_SECRET;
  if (s && s.length >= 32) return s;
  return process.env.NODE_ENV === 'production' ? null : devSecret;
}

const sign = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url');

export function createSession(now = Date.now()): { token: string; sid: string; exp: number } | null {
  const key = secret();
  if (!key) return null;
  const sid = randomBytes(12).toString('base64url');
  const exp = Math.floor(now / 1000) + SESSION_TTL_S;
  const payload = `${sid}.${exp}`;
  return { token: `${payload}.${sign(payload, key)}`, sid, exp };
}

export function verifySession(token: string | undefined, now = Date.now()): { sid: string } | null {
  const key = secret();
  if (!key || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [sid, expStr, mac] = parts;
  const expected = Buffer.from(sign(`${sid}.${expStr}`, key));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (!/^\d+$/.test(expStr) || Number(expStr) < Math.floor(now / 1000)) return null;
  return { sid };
}

export function passcodeMatches(given: string, expected: string) {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

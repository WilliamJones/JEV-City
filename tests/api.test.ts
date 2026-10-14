import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const reqFixture = JSON.parse(readFileSync('docs/fixtures/jev-request.example.json', 'utf8'));
const resFixture = JSON.parse(readFileSync('docs/fixtures/jev-response.synthetic.json', 'utf8'));
const realFetch = globalThis.fetch;

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/decision', {
    method: 'POST',
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function load() {
  vi.resetModules();
  const route = await import('@/app/api/decision/route');
  const session = await import('@/jev/session');
  const s = session.createSession()!;
  const ok = { cookie: `${session.SESSION_COOKIE}=${s.token}` };
  return { ...route, ok, session };
}

describe('F07/F12 guarded decision proxy', () => {
  beforeEach(() => {
    vi.stubEnv('JEV_LIVE_ENABLED', 'true');
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key-not-real');
    vi.stubEnv('JEV_LIVE_PASSCODE', 'open-sesame');
    vi.stubEnv('JEV_PRICE_INPUT_PER_MTOK', '0.042');
    vi.stubEnv('JEV_PRICE_OUTPUT_PER_MTOK', '0');
    vi.stubEnv('JEV_SESSION_SECRET', 'test-secret-test-secret-test-secret-0123');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = realFetch;
  });

  const upstream = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it('kill switch disables live calls', async () => {
    vi.stubEnv('JEV_LIVE_ENABLED', 'false');
    const { POST, ok } = await load();
    const f = (globalThis.fetch = upstream(200, resFixture));
    expect((await POST(post(reqFixture.state, ok))).status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });

  it('rejects cross-origin, missing passcode, oversized and invalid bodies without calling upstream', async () => {
    const { POST, ok } = await load();
    const f = (globalThis.fetch = upstream(200, resFixture));
    expect((await POST(post(reqFixture.state, { ...ok, origin: 'https://evil.example' }))).status).toBe(403);
    expect((await POST(post(reqFixture.state))).status).toBe(401);
    expect((await POST(post(reqFixture.state, { cookie: 'jev_live=abc.123.forged' }))).status).toBe(401);
    expect((await POST(post('x'.repeat(5000), ok))).status).toBe(413);
    expect((await POST(post({ ...reqFixture.state, questions: {} }, ok))).status).toBe(422);
    expect(f).not.toHaveBeenCalled();
  });

  it('returns validated answers and never echoes the key', async () => {
    const { POST, ok } = await load();
    const f = (globalThis.fetch = upstream(200, resFixture));
    const res = await POST(post(reqFixture.state, ok));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain('test-key-not-real');
    const body = JSON.parse(text);
    expect(body.ok).toBe(true);
    expect(body.answers.next_action.choice).toBe('help_neighbor');
    expect(body.estimatedApiCostUsd).toBeCloseTo((420 * 0.042) / 1e6, 12);
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.model).toBe('jev-1.13.0');
    expect(Object.keys(sent.questions.next_action.criteria)).toEqual(reqFixture.state.eligibleActionIds);
  });

  it.each([
    [401, 'http_401'],
    [422, 'http_422'],
  ])('upstream %i becomes a labeled failure', async (status, cls) => {
    const { POST, ok } = await load();
    globalThis.fetch = upstream(status, { error: 'x' });
    const body = await (await POST(post(reqFixture.state, ok))).json();
    expect(body).toMatchObject({ ok: false, errorClass: cls });
  });

  it('retries 429/529 once, counting both attempts', async () => {
    const { POST, ok } = await load();
    const f = (globalThis.fetch = upstream(529, {}));
    const body = await (await POST(post(reqFixture.state, ok))).json();
    expect(f).toHaveBeenCalledTimes(2);
    expect(body.errorClass).toBe('http_529');
  });

  it('malformed 200 is a contract violation, not a decision', async () => {
    const { POST, ok } = await load();
    globalThis.fetch = upstream(200, { ...resFixture, answers: { ...resFixture.answers, next_action: { ...resFixture.answers.next_action, choice: 'teleport' } } });
    const body = await (await POST(post(reqFixture.state, ok))).json();
    expect(body.ok).toBe(false);
    expect(body.errorClass).toMatch(/^contract_violation/);
  });

  it('timeout is reported as a timeout', async () => {
    const { POST, ok } = await load();
    globalThis.fetch = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    vi.useFakeTimers();
    const p = POST(post(reqFixture.state, ok));
    await vi.advanceTimersByTimeAsync(6000);
    vi.useRealTimers();
    expect((await (await p).json()).errorClass).toBe('timeout');
  });

  it('budget exhaustion fails closed before calling upstream', async () => {
    vi.stubEnv('JEV_DAILY_CAP', '1');
    const { POST, ok } = await load();
    const f = (globalThis.fetch = upstream(200, resFixture));
    expect((await POST(post(reqFixture.state, ok))).status).toBe(200);
    const res = await POST(post(reqFixture.state, ok));
    expect(res.status).toBe(429);
    expect((await res.json()).errorClass).toBe('global_daily_cap');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('production without a shared budget store fails closed', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('KV_REST_API_URL', '');
    const { POST, ok } = await load();
    const f = (globalThis.fetch = upstream(200, resFixture));
    const res = await POST(post(reqFixture.state, ok));
    expect(res.status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });

  it('20 simultaneous requests at the quota boundary never exceed the global cap', async () => {
    vi.stubEnv('JEV_DAILY_CAP', '5');
    const { POST, ok } = await load();
    const f = (globalThis.fetch = upstream(200, resFixture));
    const results = await Promise.all(Array.from({ length: 20 }, () => POST(post(reqFixture.state, ok))));
    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect(f).toHaveBeenCalledTimes(5);
  });

  it('budget store unavailable: no JEV request is made', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://budget.example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'x');
    const { POST, ok } = await load();
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (u: unknown) => {
      calls.push(String(u));
      if (String(u).includes('upstash')) throw new Error('ECONNREFUSED');
      return new Response(JSON.stringify(resFixture), { status: 200 });
    }) as typeof fetch;
    const res = await POST(post(reqFixture.state, ok));
    expect((await res.json()).errorClass).toBe('budget_store_unavailable');
    expect(calls.some((u) => u.includes('typesafe'))).toBe(false);
  });

  it('expired or tampered sessions are rejected before the provider', async () => {
    const { POST, session } = await load();
    const f = (globalThis.fetch = upstream(200, resFixture));
    const old = session.createSession(Date.now() - 2 * session.SESSION_TTL_S * 1000)!;
    expect((await POST(post(reqFixture.state, { cookie: `${session.SESSION_COOKIE}=${old.token}` }))).status).toBe(401);
    const fresh = session.createSession()!;
    const [sid, , mac] = fresh.token.split('.');
    const extended = `${sid}.${fresh.exp + 99999}.${mac}`;
    expect((await POST(post(reqFixture.state, { cookie: `${session.SESSION_COOKIE}=${extended}` }))).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it('a valid session cannot bypass the origin check', async () => {
    const { POST, ok } = await load();
    const f = (globalThis.fetch = upstream(200, resFixture));
    expect((await POST(post(reqFixture.state, { ...ok, origin: 'https://evil.example' }))).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it('per-session cap stops a single session', async () => {
    vi.stubEnv('JEV_SESSION_CAP', '2');
    const { POST, ok } = await load();
    globalThis.fetch = upstream(200, resFixture);
    for (let i = 0; i < 2; i++) expect((await POST(post(reqFixture.state, ok))).status).toBe(200);
    expect((await (await POST(post(reqFixture.state, ok))).json()).errorClass).toBe('session_cap');
  });
});

describe('live session exchange', () => {
  afterEach(() => vi.unstubAllEnvs());
  const sessionPost = (body: unknown, origin = 'http://localhost:3000') =>
    new NextRequest('http://localhost:3000/api/session', { method: 'POST', headers: { host: 'localhost:3000', origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('wrong passcode is rejected; right passcode sets an HttpOnly cookie', async () => {
    vi.stubEnv('JEV_LIVE_ENABLED', 'true');
    vi.stubEnv('TYPESAFE_API_KEY', 'k');
    vi.stubEnv('JEV_LIVE_PASSCODE', 'open-sesame');
    vi.resetModules();
    const { POST } = await import('@/app/api/session/route');
    expect((await POST(sessionPost({ passcode: 'nope' }))).status).toBe(401);
    expect((await POST(sessionPost({ passcode: 'open-sesame' }, 'https://evil.example'))).status).toBe(403);
    const res = await POST(sessionPost({ passcode: 'open-sesame' }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/jev_live=/);
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=strict');
  });

  it('production requires a configured passcode and session secret', async () => {
    vi.stubEnv('JEV_LIVE_ENABLED', 'true');
    vi.stubEnv('TYPESAFE_API_KEY', 'k');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JEV_LIVE_PASSCODE', '');
    vi.resetModules();
    const { POST } = await import('@/app/api/session/route');
    expect((await POST(sessionPost({ passcode: '' }))).status).toBe(503);
    vi.stubEnv('JEV_LIVE_PASSCODE', 'open-sesame');
    vi.stubEnv('JEV_SESSION_SECRET', '');
    vi.resetModules();
    const r2 = await import('@/app/api/session/route');
    expect((await r2.POST(sessionPost({ passcode: 'open-sesame' }))).status).toBe(503);
  });
});

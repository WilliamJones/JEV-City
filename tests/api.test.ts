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
  return import('@/app/api/decision/route');
}

describe('F07/F12 guarded decision proxy', () => {
  beforeEach(() => {
    vi.stubEnv('JEV_LIVE_ENABLED', 'true');
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key-not-real');
    vi.stubEnv('JEV_LIVE_PASSCODE', 'open-sesame');
    vi.stubEnv('JEV_PRICE_INPUT_PER_MTOK', '0.042');
    vi.stubEnv('JEV_PRICE_OUTPUT_PER_MTOK', '0');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = realFetch;
  });

  const ok = { 'x-live-passcode': 'open-sesame' };
  const upstream = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it('kill switch disables live calls', async () => {
    vi.stubEnv('JEV_LIVE_ENABLED', 'false');
    const { POST } = await load();
    const f = (globalThis.fetch = upstream(200, resFixture));
    expect((await POST(post(reqFixture.state, ok))).status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });

  it('rejects cross-origin, missing passcode, oversized and invalid bodies without calling upstream', async () => {
    const { POST } = await load();
    const f = (globalThis.fetch = upstream(200, resFixture));
    expect((await POST(post(reqFixture.state, { ...ok, origin: 'https://evil.example' }))).status).toBe(403);
    expect((await POST(post(reqFixture.state))).status).toBe(401);
    expect((await POST(post('x'.repeat(5000), ok))).status).toBe(413);
    expect((await POST(post({ ...reqFixture.state, questions: {} }, ok))).status).toBe(422);
    expect(f).not.toHaveBeenCalled();
  });

  it('returns validated answers and never echoes the key', async () => {
    const { POST } = await load();
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
    const { POST } = await load();
    globalThis.fetch = upstream(status, { error: 'x' });
    const body = await (await POST(post(reqFixture.state, ok))).json();
    expect(body).toMatchObject({ ok: false, errorClass: cls });
  });

  it('retries 429/529 once, counting both attempts', async () => {
    const { POST } = await load();
    const f = (globalThis.fetch = upstream(529, {}));
    const body = await (await POST(post(reqFixture.state, ok))).json();
    expect(f).toHaveBeenCalledTimes(2);
    expect(body.errorClass).toBe('http_529');
  });

  it('malformed 200 is a contract violation, not a decision', async () => {
    const { POST } = await load();
    globalThis.fetch = upstream(200, { ...resFixture, answers: { ...resFixture.answers, next_action: { ...resFixture.answers.next_action, choice: 'teleport' } } });
    const body = await (await POST(post(reqFixture.state, ok))).json();
    expect(body.ok).toBe(false);
    expect(body.errorClass).toMatch(/^contract_violation/);
  });

  it('timeout is reported as a timeout', async () => {
    const { POST } = await load();
    globalThis.fetch = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    vi.useFakeTimers();
    const p = POST(post(reqFixture.state, ok));
    await vi.advanceTimersByTimeAsync(6000);
    vi.useRealTimers();
    expect((await (await p).json()).errorClass).toBe('timeout');
  });

  it('budget exhaustion fails closed before calling upstream', async () => {
    vi.stubEnv('JEV_DAILY_CAP', '1');
    const { POST } = await load();
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
    const { POST } = await load();
    const f = (globalThis.fetch = upstream(200, resFixture));
    const res = await POST(post(reqFixture.state, ok));
    expect(res.status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });
});

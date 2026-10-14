import { Redis } from '@upstash/redis';

/**
 * Shared atomic budget (PRD §8). Upstash Redis when configured (works across Vercel functions);
 * in-memory only for local development. In production without Redis, live mode fails closed.
 */
export type Budget = { reserve(ip: string, sid: string): Promise<{ ok: boolean; reason?: string; remainingToday?: number }> };

const DAILY_CAP = Number(process.env.JEV_DAILY_CAP ?? 3000);
const IP_PER_MIN = Number(process.env.JEV_IP_PER_MINUTE ?? 180);
const IP_PER_DAY = Number(process.env.JEV_IP_PER_DAY ?? 1500);
const PER_SESSION = Number(process.env.JEV_SESSION_CAP ?? 800);

const day = () => new Date().toISOString().slice(0, 10);
const minute = () => Math.floor(Date.now() / 60000);

function redisFromEnv(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

const mem = new Map<string, number>();
const memIncr = (k: string) => {
  const v = (mem.get(k) ?? 0) + 1;
  mem.set(k, v);
  return v;
};

export function getBudget(): Budget | null {
  const redis = redisFromEnv();
  if (!redis && process.env.NODE_ENV === 'production') return null; // fail closed
  return {
    async reserve(ip, sid) {
      const keys = [`jev:day:${day()}`, `jev:ip:${ip}:${day()}`, `jev:ipm:${ip}:${minute()}`, `jev:sess:${sid}`];
      let counts: number[];
      try {
        if (redis) {
          const p = redis.pipeline();
          p.incr(keys[0]); p.expire(keys[0], 172800);
          p.incr(keys[1]); p.expire(keys[1], 172800);
          p.incr(keys[2]); p.expire(keys[2], 120);
          p.incr(keys[3]); p.expire(keys[3], 3600);
          const r = (await p.exec()) as number[];
          counts = [r[0], r[2], r[4], r[6]];
        } else {
          counts = keys.map(memIncr);
        }
      } catch {
        return { ok: false, reason: 'budget_store_unavailable' };
      }
      if (counts[0] > DAILY_CAP) return { ok: false, reason: 'global_daily_cap' };
      if (counts[1] > IP_PER_DAY) return { ok: false, reason: 'ip_daily_cap' };
      if (counts[2] > IP_PER_MIN) return { ok: false, reason: 'ip_rate_limited' };
      if (counts[3] > PER_SESSION) return { ok: false, reason: 'session_cap' };
      return { ok: true, remainingToday: DAILY_CAP - counts[0] };
    },
  };
}

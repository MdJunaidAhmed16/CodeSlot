// Upstash Redis-backed rate limiting & frequency capping (REST API, no SDK).
//
// Redis holds abuse counters only - never a source of truth for money. It is
// also the least durable dependency we have: a free-tier database is reclaimed
// after a long idle period, and when that happened every call here threw, which
// surfaced as an uncaught 500 and took serve-ad / track-event / redeem-credits
// down completely. An outage in a counter store must never do that again.
//
// So the primitives report three outcomes and let each caller pick a policy:
//   "allowed"     - under the limit, proceed.
//   "limited"     - over the limit, refuse.
//   "unavailable" - Redis is configured but not answering. The caller decides:
//                   degrade OPEN where the worst case is scraping public data,
//                   degrade CLOSED on every path that moves money, because the
//                   anti-fraud caps live here and nowhere else.
//
// All keys are namespaced by device_id or user id.

const REDIS_URL = Deno.env.get("UPSTASH_REDIS_REST_URL");
const REDIS_TOKEN = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

export const redisConfigured = Boolean(REDIS_URL && REDIS_TOKEN);

/** Outcome of a limiter check. See the policy note above. */
export type LimitOutcome = "allowed" | "limited" | "unavailable";

async function redis(command: (string | number)[]): Promise<unknown> {
  if (!redisConfigured) {
    throw new Error("redis not configured");
  }
  const res = await fetch(REDIS_URL!, {
    method: "POST",
    headers: {
      authorization: `Bearer ${REDIS_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    throw new Error(`redis error ${res.status}`);
  }
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) {
    throw new Error(data.error);
  }
  return data.result;
}

/** Runs a limiter op, turning any Redis failure into "unavailable" + a log
 *  line. Never throws, so a dead counter store cannot 500 a function. */
async function guarded(
  key: string,
  op: () => Promise<LimitOutcome>
): Promise<LimitOutcome> {
  try {
    return await op();
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    console.error(`ratelimit: redis unavailable for "${key}": ${cause}`);
    return "unavailable";
  }
}

/**
 * Fixed-window limiter: allow at most `limit` hits per `windowSec`.
 */
export async function checkLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<LimitOutcome> {
  if (!redisConfigured) {
    return "allowed"; // no limiter deployed; caller decides whether that's ok
  }
  return await guarded(key, async () => {
    const count = (await redis(["INCR", key])) as number;
    if (count === 1) {
      await redis(["EXPIRE", key, windowSec]);
    }
    return count <= limit ? "allowed" : "limited";
  });
}

/**
 * Frequency cap: "allowed" if this is the first call within `cooldownSec` for
 * the key, "limited" if still in cooldown.
 */
export async function checkFirstWithin(
  key: string,
  cooldownSec: number
): Promise<LimitOutcome> {
  if (!redisConfigured) {
    return "allowed";
  }
  return await guarded(key, async () => {
    // SET key 1 NX EX cooldown -> returns "OK" only if it was newly set.
    const result = await redis(["SET", key, "1", "NX", "EX", cooldownSec]);
    return result === "OK" ? "allowed" : "limited";
  });
}

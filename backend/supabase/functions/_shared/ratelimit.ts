// Upstash Redis-backed rate limiting & frequency capping (REST API, no SDK).
//
// All keys are namespaced by device_id. If Redis is not configured the limiter
// "fails closed" only for abuse-sensitive paths by the caller's choice; here we
// expose primitives and let each function decide.

const REDIS_URL = Deno.env.get("UPSTASH_REDIS_REST_URL");
const REDIS_TOKEN = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

export const redisConfigured = Boolean(REDIS_URL && REDIS_TOKEN);

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

/**
 * Sliding-ish fixed-window limiter: allow at most `limit` hits per `windowSec`.
 * Returns true if the action is allowed.
 */
export async function allow(
  key: string,
  limit: number,
  windowSec: number
): Promise<boolean> {
  if (!redisConfigured) {
    return true; // no limiter available; caller decides whether that's ok
  }
  const count = (await redis(["INCR", key])) as number;
  if (count === 1) {
    await redis(["EXPIRE", key, windowSec]);
  }
  return count <= limit;
}

/**
 * Frequency cap: returns true if this is the first call within `cooldownSec`
 * for the key (i.e. the action may proceed), false if still in cooldown.
 */
export async function firstWithin(
  key: string,
  cooldownSec: number
): Promise<boolean> {
  if (!redisConfigured) {
    return true;
  }
  // SET key 1 NX EX cooldown → returns "OK" only if it was newly set.
  const result = await redis(["SET", key, "1", "NX", "EX", cooldownSec]);
  return result === "OK";
}

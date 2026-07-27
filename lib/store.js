import { Redis } from "@upstash/redis";

const SNAPSHOT_KEY = "psx:stocks:snapshot";

// Redis.fromEnv() already falls back from Upstash's own env var names to
// the legacy Vercel KV names (KV_REST_API_URL/KV_REST_API_TOKEN), which is
// what Vercel's Upstash Marketplace integration actually injects — so this
// works regardless of how the database was connected.
export const isRedisConfigured = Boolean(
  (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
);

const redis = isRedisConfigured ? Redis.fromEnv() : null;

console.log(
  isRedisConfigured
    ? "[store] Redis configured — using shared cache backend"
    : "[store] No Redis credentials found (checked UPSTASH_REDIS_REST_URL/TOKEN and KV_REST_API_URL/TOKEN) — falling back to per-instance in-memory cache (does not work correctly across multiple serverless instances)"
);

/**
 * Reads the last fully-computed snapshot `{ stocks, updatedAt, totalCount,
 * failedSymbols }` written by the cron refresh, or `null` if none exists
 * yet (e.g. before the first cron run has completed).
 */
export async function readSnapshot() {
  if (!redis) return null;
  return redis.get(SNAPSHOT_KEY);
}

export async function writeSnapshot(snapshot) {
  if (!redis) return;
  await redis.set(SNAPSHOT_KEY, snapshot);
}

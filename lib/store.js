import { Redis } from "@upstash/redis";

const SNAPSHOT_KEY = "psx:stocks:snapshot";

export const isRedisConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const redis = isRedisConfigured ? Redis.fromEnv() : null;

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

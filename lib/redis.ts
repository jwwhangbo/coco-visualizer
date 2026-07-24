import IORedis, { type Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

declare global {
  // eslint-disable-next-line no-var
  var __cocoRedis: Redis | undefined;
}

/**
 * Shared IORedis connection for BullMQ, created lazily so nothing connects at
 * import/build time. `maxRetriesPerRequest: null` is required by BullMQ's
 * blocking operations; `lazyConnect` defers the socket until first use. Cached
 * on `globalThis` so Next dev HMR doesn't leak connections.
 */
export function getRedis(): Redis {
  if (!globalThis.__cocoRedis) {
    globalThis.__cocoRedis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
  return globalThis.__cocoRedis;
}

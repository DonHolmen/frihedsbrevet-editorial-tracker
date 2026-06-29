import { Redis } from '@upstash/redis'

/**
 * Shared Upstash Redis REST client.
 *
 * 100% HTTP — the same endpoint powers Upstash Realtime (Redis Streams + SSE)
 * and our presence roster. No native TLS socket / ioredis anymore.
 *
 * Null when the env vars are absent so the app still boots for a zero-config
 * local run (realtime + presence degrade to no-ops).
 */
const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

export const redis = url && token ? new Redis({ url, token }) : null

/** True when Upstash REST credentials are configured. */
export const isRealtimeEnabled = redis !== null

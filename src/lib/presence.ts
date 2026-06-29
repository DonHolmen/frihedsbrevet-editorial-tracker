import { redis } from './redis'
import type { PresentUser } from './realtime-schema'

/**
 * Presence roster, stored in a single Redis hash (field = userId, value =
 * `{ name, at }`). This is the source of truth that lets a newly-opened board
 * learn who is *already* present — something pub/sub alone can't provide, since
 * it has no history.
 *
 * Liveness is timestamp-based: clients heartbeat periodically, and anyone we
 * haven't heard from within `STALE_MS` is pruned on the next read. That way a
 * crashed/closed tab disappears even if its `leave` never arrived.
 */
const ROSTER_KEY = 'frihedsbrevet:presence'
const STALE_MS = 30_000

type Entry = { name: string; at: number }

/** Current fresh roster; opportunistically prunes stale members. */
export async function readRoster(): Promise<PresentUser[]> {
  if (!redis) return []
  const all = (await redis.hgetall<Record<string, Entry>>(ROSTER_KEY)) ?? {}
  const now = Date.now()
  const fresh: PresentUser[] = []
  const stale: string[] = []
  for (const [id, entry] of Object.entries(all)) {
    if (entry && now - entry.at < STALE_MS) fresh.push({ id, name: entry.name })
    else stale.push(id)
  }
  if (stale.length) await redis.hdel(ROSTER_KEY, ...stale)
  return fresh
}

/** Mark a user present (join / heartbeat); returns the fresh roster. */
export async function upsertPresence(user: PresentUser): Promise<PresentUser[]> {
  if (!redis) return []
  await redis.hset(ROSTER_KEY, { [String(user.id)]: { name: user.name, at: Date.now() } satisfies Entry })
  return readRoster()
}

/** Remove a user (leave); returns the fresh roster. */
export async function removePresence(id: PresentUser['id']): Promise<PresentUser[]> {
  if (!redis) return []
  await redis.hdel(ROSTER_KEY, String(id))
  return readRoster()
}

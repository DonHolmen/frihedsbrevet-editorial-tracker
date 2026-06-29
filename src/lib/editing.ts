import { redis } from './redis'
import type { BoardLock } from './realtime-schema'

/**
 * Board edit soft-locks, stored in a Redis hash (field = itemId, value =
 * `{ id, name, at }` of the editor). Mirrors the presence pattern so a newly
 * opened board immediately learns which cards are already being edited.
 *
 * Liveness is timestamp-based: the editing client re-asserts its lock on a
 * heartbeat, and any lock we haven't heard from within `STALE_MS` is pruned —
 * so a crashed/closed editor releases its lock on its own.
 */
const EDIT_KEY = 'frihedsbrevet:editing'
const STALE_MS = 20_000

type Entry = { id: string | number; name: string; at: number }

/** Current fresh locks; opportunistically prunes stale ones. */
export async function readEditing(): Promise<BoardLock[]> {
  if (!redis) return []
  const all = (await redis.hgetall<Record<string, Entry>>(EDIT_KEY)) ?? {}
  const now = Date.now()
  const fresh: BoardLock[] = []
  const stale: string[] = []
  for (const [itemId, e] of Object.entries(all)) {
    if (e && now - e.at < STALE_MS) fresh.push({ itemId, by: { id: e.id, name: e.name } })
    else stale.push(itemId)
  }
  if (stale.length) await redis.hdel(EDIT_KEY, ...stale)
  return fresh
}

/** Acquire / refresh a lock for `itemId`; returns the fresh lock set. */
export async function startEditing(itemId: BoardLock['itemId'], user: BoardLock['by']): Promise<BoardLock[]> {
  if (!redis) return []
  await redis.hset(EDIT_KEY, {
    [String(itemId)]: { id: user.id, name: user.name, at: Date.now() } satisfies Entry,
  })
  return readEditing()
}

/** Release a lock for `itemId`; returns the fresh lock set. */
export async function stopEditing(itemId: BoardLock['itemId']): Promise<BoardLock[]> {
  if (!redis) return []
  await redis.hdel(EDIT_KEY, String(itemId))
  return readEditing()
}

/** Who (if anyone) currently holds a fresh board lock on `itemId`. */
export async function lockHolder(itemId: BoardLock['itemId']): Promise<BoardLock['by'] | null> {
  const locks = await readEditing()
  return locks.find((l) => String(l.itemId) === String(itemId))?.by ?? null
}

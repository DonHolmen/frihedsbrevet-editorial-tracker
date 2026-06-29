import { redis } from './redis'
import type { BoardLock } from './realtime-schema'

/**
 * Drag-locks: a card currently being dragged on the board. Stored in a Redis
 * hash (field = itemId, value = `{ id, name, at }` of the dragger) so a freshly
 * opened board immediately sees in-flight drags.
 *
 * Liveness is timestamp-based: a crashed/closed dragger releases its lock on its
 * own once the entry passes `STALE_MS` (a backstop — drags normally release on
 * dragend). This is intentionally short, since a drag lasts only seconds.
 */
const LOCK_KEY = 'frihedsbrevet:drag-locks'
const STALE_MS = 15_000

type Entry = { id: string | number; name: string; at: number }

/** Current fresh drag-locks; opportunistically prunes stale ones. */
export async function readDragLocks(): Promise<BoardLock[]> {
  if (!redis) return []
  const all = (await redis.hgetall<Record<string, Entry>>(LOCK_KEY)) ?? {}
  const now = Date.now()
  const fresh: BoardLock[] = []
  const stale: string[] = []
  for (const [itemId, e] of Object.entries(all)) {
    if (e && now - e.at < STALE_MS) fresh.push({ itemId, by: { id: e.id, name: e.name } })
    else stale.push(itemId)
  }
  if (stale.length) await redis.hdel(LOCK_KEY, ...stale)
  return fresh
}

/** Acquire / refresh the drag-lock for `itemId`; returns the fresh lock set. */
export async function acquireDragLock(itemId: BoardLock['itemId'], user: BoardLock['by']): Promise<BoardLock[]> {
  if (!redis) return []
  await redis.hset(LOCK_KEY, {
    [String(itemId)]: { id: user.id, name: user.name, at: Date.now() } satisfies Entry,
  })
  return readDragLocks()
}

/** Release the drag-lock for `itemId`; returns the fresh lock set. */
export async function releaseDragLock(itemId: BoardLock['itemId']): Promise<BoardLock[]> {
  if (!redis) return []
  await redis.hdel(LOCK_KEY, String(itemId))
  return readDragLocks()
}

/** Who (if anyone) currently holds a fresh drag-lock on `itemId`. */
export async function dragLockHolder(itemId: BoardLock['itemId']): Promise<BoardLock['by'] | null> {
  const locks = await readDragLocks()
  return locks.find((l) => String(l.itemId) === String(itemId))?.by ?? null
}

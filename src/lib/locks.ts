import { redis } from './redis'
import type { BoardLock } from './realtime-schema'

/**
 * Card locks — our own mechanism, shared by both surfaces:
 *   • `drag`  — a card being dragged on the board (acquired on dragstart)
 *   • `admin` — a post open in the Payload edit view (acquired by a UI field
 *               component mounted on the edit form)
 *
 * Stored in one Redis hash (field = itemId, value = `{ id, name, at, kind }`) and
 * broadcast over realtime, so every open board reflects a lock instantly — no
 * dependency on Payload's internal `payload-locked-documents`.
 *
 * Liveness is timestamp-based: holders heartbeat while active, and any lock we
 * haven't heard from within `STALE_MS` is pruned, so a crashed/closed holder
 * releases on its own.
 */
const LOCK_KEY = 'frihedsbrevet:locks'
const STALE_MS = 20_000

type Kind = BoardLock['kind']
type Entry = { id: string | number; name: string; at: number; kind: Kind }

/** Current fresh locks; opportunistically prunes stale ones. */
export async function readLocks(): Promise<BoardLock[]> {
  if (!redis) return []
  const all = (await redis.hgetall<Record<string, Entry>>(LOCK_KEY)) ?? {}
  const now = Date.now()
  const fresh: BoardLock[] = []
  const stale: string[] = []
  for (const [itemId, e] of Object.entries(all)) {
    if (e && now - e.at < STALE_MS) fresh.push({ itemId, by: { id: e.id, name: e.name }, kind: e.kind })
    else stale.push(itemId)
  }
  if (stale.length) await redis.hdel(LOCK_KEY, ...stale)
  return fresh
}

/** Acquire / refresh a lock for `itemId`; returns the fresh lock set. */
export async function acquireLock(
  itemId: BoardLock['itemId'],
  user: BoardLock['by'],
  kind: Kind,
): Promise<BoardLock[]> {
  if (!redis) return []
  await redis.hset(LOCK_KEY, {
    [String(itemId)]: { id: user.id, name: user.name, at: Date.now(), kind } satisfies Entry,
  })
  return readLocks()
}

/**
 * Release a lock for `itemId` — only if `userId` is the current holder, so a
 * second viewer closing their tab can't drop someone else's lock. Returns the
 * fresh lock set.
 */
export async function releaseLock(itemId: BoardLock['itemId'], userId: BoardLock['by']['id']): Promise<BoardLock[]> {
  if (!redis) return []
  const all = (await redis.hgetall<Record<string, Entry>>(LOCK_KEY)) ?? {}
  const entry = all[String(itemId)]
  if (entry && String(entry.id) === String(userId)) await redis.hdel(LOCK_KEY, String(itemId))
  return readLocks()
}

/** Who (if anyone) currently holds a fresh lock on `itemId`. */
export async function lockHolder(itemId: BoardLock['itemId']): Promise<BoardLock['by'] | null> {
  const locks = await readLocks()
  return locks.find((l) => String(l.itemId) === String(itemId))?.by ?? null
}

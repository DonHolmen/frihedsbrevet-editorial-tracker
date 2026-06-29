import { Realtime } from '@upstash/realtime'

import { redis } from './redis'
import { boardSchema, type BoardItem, type BoardLock, type PresentUser } from './realtime-schema'

/**
 * Server-side realtime instance — Upstash Realtime (Redis Streams + SSE).
 *
 * Null when Upstash isn't configured; every emit then becomes a no-op so a
 * realtime outage can never fail the underlying Payload write. History is
 * capped so the stream can't grow unbounded.
 */
export const realtime = redis
  ? new Realtime({ schema: boardSchema, redis, history: { maxLength: 200, expireAfterSecs: 86_400 } })
  : null

/** Broadcast an item create/update to every open board. */
export async function emitItem(item: BoardItem): Promise<void> {
  await realtime?.emit('board.item', item)
}

/** Broadcast a hard-delete to every open board. */
export async function emitDeleted(id: BoardItem['id']): Promise<void> {
  await realtime?.emit('board.deleted', { id })
}

/** Broadcast the authoritative presence roster to every open board. */
export async function emitPresence(roster: PresentUser[]): Promise<void> {
  await realtime?.emit('board.presence', roster)
}

/** Broadcast the current set of drag-locks to every open board. */
export async function emitLocks(locks: BoardLock[]): Promise<void> {
  await realtime?.emit('board.locks', locks)
}

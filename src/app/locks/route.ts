import config from '@payload-config'
import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'

import { acquireLock, lockHolder, readLocks, releaseLock } from '@/lib/locks'
import { emitLocks } from '@/lib/realtime'
import type { BoardLock } from '@/lib/realtime-schema'

/**
 * Card-lock signaling — our own mechanism, used by both the board (drag) and the
 * Payload admin edit view (admin). One Redis-backed lock set, broadcast live.
 *
 * GET  → { locks } so a board can seed + poll.
 * POST → { itemId, active, kind } to acquire (active:true) / release a lock.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  return Response.json({ locks: await readLocks() })
}

export async function POST(req: Request): Promise<Response> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let body: { itemId?: string | number; active?: boolean; kind?: BoardLock['kind'] } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body is fine */
  }
  if (body.itemId == null) return Response.json({ error: 'bad_request' }, { status: 400 })

  const kind: BoardLock['kind'] = body.kind === 'admin' ? 'admin' : 'drag'
  const me = { id: user.id, name: (user as { name?: string }).name ?? user.email ?? 'Someone' }

  if (body.active) {
    // Nobody can steal a lock someone else already holds (first come, first served).
    // Refreshing your own lock is fine.
    const holder = await lockHolder(body.itemId)
    if (holder && String(holder.id) !== String(user.id)) {
      return Response.json({ error: 'locked', by: holder, locks: await readLocks() }, { status: 409 })
    }
    const locks = await acquireLock(body.itemId, me, kind)
    await emitLocks(locks)
    return Response.json({ locks })
  }

  const locks = await releaseLock(body.itemId, user.id)
  await emitLocks(locks)
  return Response.json({ locks })
}

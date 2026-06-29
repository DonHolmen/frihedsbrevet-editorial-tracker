import config from '@payload-config'
import { headers as nextHeaders } from 'next/headers'
import { getPayload, type Payload } from 'payload'

import { acquireDragLock, dragLockHolder, readDragLocks, releaseDragLock } from '@/lib/locks'
import { emitLocks } from '@/lib/realtime'
import type { BoardLock } from '@/lib/realtime-schema'

/**
 * Card-lock signaling for the board. Two lock sources are surfaced here:
 *   • drag-locks  — someone is dragging a card right now (Redis, broadcast live)
 *   • admin locks — someone has the doc open in /admin (Payload's native
 *                   `payload-locked-documents`, mirrored read-only)
 *
 * GET  → { drag, admin } so a board can seed + poll the full lock state.
 * POST → { itemId, active } to acquire (active:true) / release a drag-lock.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Must match `lockDocuments.duration` (300s) on the ContentItems collection. */
const LOCK_DURATION_MS = 300_000

/** Mirror Payload's admin document locks for content-items (non-expired only). */
async function readAdminLocks(payload: Payload): Promise<BoardLock[]> {
  const res = await payload.find({
    collection: 'payload-locked-documents',
    depth: 1, // resolve `user` to read their name; `document` stays an id (maxDepth 0)
    limit: 200,
    pagination: false,
    overrideAccess: true,
  })

  const now = Date.now()
  const locks: BoardLock[] = []
  for (const d of res.docs) {
    const doc = d.document
    if (!doc || doc.relationTo !== 'content-items') continue
    if (now - new Date(d.updatedAt).getTime() > LOCK_DURATION_MS) continue // expired
    const itemId = typeof doc.value === 'object' ? doc.value.id : doc.value
    const u = d.user?.value
    const by =
      typeof u === 'object' && u
        ? { id: u.id, name: u.name ?? u.email ?? 'Someone' }
        : { id: u, name: 'Someone' }
    locks.push({ itemId, by })
  }
  return locks
}

export async function GET(): Promise<Response> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const [drag, admin] = await Promise.all([readDragLocks(), readAdminLocks(payload)])
  return Response.json({ drag, admin })
}

export async function POST(req: Request): Promise<Response> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let body: { itemId?: string | number; active?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body is fine */
  }
  if (body.itemId == null) return Response.json({ error: 'bad_request' }, { status: 400 })

  const me = { id: user.id, name: (user as { name?: string }).name ?? user.email ?? 'Someone' }

  if (body.active) {
    // Don't let two people drag the same card at once.
    const holder = await dragLockHolder(body.itemId)
    if (holder && String(holder.id) !== String(user.id)) {
      return Response.json({ error: 'locked', by: holder, drag: await readDragLocks() }, { status: 409 })
    }
    const drag = await acquireDragLock(body.itemId, me)
    await emitLocks(drag)
    return Response.json({ drag })
  }

  const drag = await releaseDragLock(body.itemId)
  await emitLocks(drag)
  return Response.json({ drag })
}

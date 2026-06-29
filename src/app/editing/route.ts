import config from '@payload-config'
import { headers as nextHeaders } from 'next/headers'
import { getPayload, type Payload } from 'payload'

import { lockHolder, readEditing, startEditing, stopEditing } from '@/lib/editing'
import { emitEditing } from '@/lib/realtime'
import type { BoardLock } from '@/lib/realtime-schema'

/**
 * Edit-lock signaling for the board.
 *
 * Two lock sources are surfaced here:
 *   • board soft-locks — someone editing a card inline (Redis, broadcast live)
 *   • admin locks       — someone has the doc open in /admin (Payload's native
 *                         `payload-locked-documents`, mirrored read-only)
 *
 * GET  → { board, admin } so a board can seed + poll the full lock state.
 * POST → { itemId, active } to acquire/refresh (active:true) or release a soft-lock.
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

  const [board, admin] = await Promise.all([readEditing(), readAdminLocks(payload)])
  return Response.json({ board, admin })
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
    // Don't let two people grab the same card.
    const holder = await lockHolder(body.itemId)
    if (holder && String(holder.id) !== String(user.id)) {
      return Response.json({ error: 'locked', by: holder, board: await readEditing() }, { status: 409 })
    }
    const board = await startEditing(body.itemId, me)
    await emitEditing(board)
    return Response.json({ board })
  }

  const board = await stopEditing(body.itemId)
  await emitEditing(board)
  return Response.json({ board })
}

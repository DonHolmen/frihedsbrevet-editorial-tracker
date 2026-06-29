import config from '@payload-config'
import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'

import { removePresence, upsertPresence } from '@/lib/presence'
import { emitPresence } from '@/lib/realtime'

/**
 * Presence signaling.
 *
 * Clients POST `{ type }` where type is one of: join | heartbeat | leave.
 * The acting user is taken from the Payload session — never trusted from the
 * body. We keep an authoritative roster in Redis (so newcomers immediately see
 * who's already here) and broadcast the fresh roster to every open board.
 */
export const runtime = 'nodejs'

const ALLOWED = new Set(['join', 'heartbeat', 'leave'])

export async function POST(req: Request): Promise<Response> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let body: { type?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body is fine */
  }

  const type = body.type ?? 'join'
  if (!ALLOWED.has(type)) return Response.json({ error: 'bad_type' }, { status: 400 })

  const me = { id: user.id, name: (user as { name?: string }).name ?? user.email ?? 'Someone' }
  const roster = type === 'leave' ? await removePresence(user.id) : await upsertPresence(me)

  // Push the authoritative roster to everyone live, and seed the caller too.
  await emitPresence(roster)
  return Response.json({ roster })
}

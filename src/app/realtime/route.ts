import config from '@payload-config'
import { handle } from '@upstash/realtime'
import { getPayload } from 'payload'

import { realtime } from '@/lib/realtime'

/**
 * Realtime SSE bridge — Upstash Realtime's route handler.
 *
 * Lives at `/realtime` (NOT under `/api`) to avoid colliding with Payload's
 * `/api/[...slug]` catch-all. Node runtime: it holds a long-lived stream.
 *
 * Access is gated on a valid Payload session via middleware — the board itself
 * is behind auth, so the event stream is too.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Minimal stream for the zero-config (no Upstash) local run. */
const disabled = (): Response =>
  new Response('event: ready\ndata: {"realtime":false}\n\n', {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' },
  })

export const GET = realtime
  ? handle({
      realtime,
      middleware: async ({ request }) => {
        const payload = await getPayload({ config })
        const { user } = await payload.auth({ headers: request.headers })
        if (!user) return new Response('Unauthorized', { status: 401 })
      },
    })
  : disabled

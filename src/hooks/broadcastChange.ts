import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { emitDeleted, emitItem } from '@/lib/realtime'

/**
 * Realtime fan-out. After a ContentItem is committed we emit a compact event on
 * the board channel; every open board upserts it live (see src/lib/realtime.ts).
 *
 * Best-effort: a realtime outage (or missing Upstash config) must never fail the
 * underlying write, so errors are swallowed and logged.
 */
export const broadcastChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  try {
    await emitItem({
      id: doc.id,
      title: doc.title,
      status: doc.status,
      type: doc.type,
      deadline: doc.deadline ?? null,
      isArchived: Boolean(doc.isArchived),
    })
  } catch (err) {
    req.payload.logger.error({ err }, 'broadcastChange: failed to emit board.item')
  }

  return doc
}

/** Mirror hard-deletes to every open board. */
export const broadcastDelete: CollectionAfterDeleteHook = async ({ doc, id, req }) => {
  try {
    await emitDeleted(id ?? doc?.id)
  } catch (err) {
    req.payload.logger.error({ err }, 'broadcastDelete: failed to emit board.deleted')
  }

  return doc
}

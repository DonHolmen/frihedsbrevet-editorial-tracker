import type { CollectionBeforeChangeHook } from 'payload'

import { APIError } from 'payload'

import { lockHolder } from '@/lib/locks'

/**
 * Hard mutual-exclusion: reject a save when someone else currently holds the
 * edit lock on this item. This is the real enforcement behind the board/admin
 * lock UI — it blocks the actual write (admin save, REST, GraphQL) regardless of
 * what the client shows, so two people can't clobber each other.
 *
 * The lock holder themselves can always save. System writes (no `req.user`,
 * e.g. the seed) and creates are never blocked. Degrades to a no-op when Redis
 * isn't configured (`lockHolder` returns null).
 */
export const enforceEditLock: CollectionBeforeChangeHook = async ({ operation, originalDoc, req }) => {
  if (operation !== 'update' || !req.user || !originalDoc?.id) return

  const holder = await lockHolder(originalDoc.id)
  if (holder && String(holder.id) !== String(req.user.id)) {
    throw new APIError(
      `"${originalDoc.title ?? 'This item'}" is being edited by ${holder.name}. Try again once they're done.`,
      423, // Locked
      undefined,
      true, // public — surface the message to the client
    )
  }
}

import type { CollectionBeforeChangeHook } from 'payload'

import { APIError } from 'payload'

/**
 * Status state machine for ContentItems.
 *
 * Implemented as a `beforeChange` hook so the rule is enforced *once* and
 * applies uniformly across REST, GraphQL, the Local API and the admin UI.
 * Throwing `APIError` surfaces a clean HTTP status + message to every client.
 */

const EDITOR_ONLY_STATUSES = ['published', 'archived'] as const

/** Legal transitions. A status may always "stay" on itself (no-op edits). */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  idea: ['idea', 'draft'],
  draft: ['draft', 'review', 'idea'],
  review: ['review', 'draft', 'published'],
  published: ['published', 'archived', 'review'],
  archived: ['archived', 'draft'],
}

export const enforceStatusStateMachine: CollectionBeforeChangeHook = ({
  data,
  req,
  originalDoc,
}) => {
  const user = req.user
  const next = data?.status as string | undefined
  const prev = originalDoc?.status as string | undefined // undefined on create

  // No authenticated user => trusted system write (seed / migration / internal).
  // Real unauthenticated API writes are already rejected by access control
  // before this hook runs, so it is safe to skip the role gate here.
  if (!user) return data

  // Only police an *actual* status change.
  if (next && next !== prev) {
    // (a) Role gate — only Editors may move an item to a terminal status.
    if (EDITOR_ONLY_STATUSES.includes(next as (typeof EDITOR_ONLY_STATUSES)[number]) && user?.role !== 'editor') {
      throw new APIError(
        `Only Editors can move an item to "${next}". Contributors may advance items up to "Review".`,
        403,
      )
    }

    // (b) Legality gate — block nonsensical jumps (e.g. idea -> published).
    if (prev && !ALLOWED_TRANSITIONS[prev]?.includes(next)) {
      throw new APIError(`Illegal status transition "${prev}" → "${next}".`, 400)
    }
  }

  return data
}

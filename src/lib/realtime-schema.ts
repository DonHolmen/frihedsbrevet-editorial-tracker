import { z } from 'zod/v4'

/**
 * Realtime event schema (shared by server emit + typed client hook).
 *
 * Isomorphic on purpose — zod only, no server imports — so it can be pulled
 * into client bundles safely. The namespace is `board`; each key is an event.
 */
const id = z.union([z.string(), z.number()])

export const boardSchema = {
  board: {
    /** An item was created or updated. Clients upsert; archived items drop off. */
    item: z.object({
      id,
      title: z.string(),
      status: z.string(),
      type: z.string().optional(),
      deadline: z.string().nullable().optional(),
      isArchived: z.boolean().optional(),
    }),
    /** An item was hard-deleted. */
    deleted: z.object({ id }),
    /** Authoritative roster of everyone currently on the board. */
    presence: z.array(z.object({ id, name: z.string() })),
    /** Items currently being edited on the board (soft-locks). */
    editing: z.array(z.object({ itemId: id, by: z.object({ id, name: z.string() }) })),
  },
}

/** Event map consumed by the typed client hook (`createRealtime`). */
export type RealtimeEvents = typeof boardSchema
export type BoardItem = z.infer<typeof boardSchema.board.item>
export type PresentUser = z.infer<typeof boardSchema.board.presence>[number]
export type BoardLock = z.infer<typeof boardSchema.board.editing>[number]

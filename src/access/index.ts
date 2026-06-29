import type { Access, FieldAccess } from 'payload'

/**
 * Reusable access helpers.
 *
 * The core Payload idiom: an access function returns `true` / `false` OR a
 * `Where` query. Returning a query makes Payload transparently *filter* the
 * rows a user can touch — this is the engine behind row-level RBAC. We never
 * hand-write SQL for "own documents only"; we return a constraint and Payload
 * applies it on read, update and delete alike.
 */

/** Editors only. */
export const isEditor: Access = ({ req: { user } }) => user?.role === 'editor'

/** Any authenticated user (used for `create`, where both roles are allowed). */
export const isAuthenticated: Access = ({ req: { user } }) => Boolean(user)

/**
 * Field-level guard: only Editors may write the field this is attached to.
 * Used on `Users.role` (no self-promotion) and `ContentItems.isArchived`.
 */
export const isEditorFieldLevel: FieldAccess = ({ req: { user } }) => user?.role === 'editor'

/**
 * Editors -> every user row. Contributors -> only their own user row,
 * expressed as a `Where` constraint so Payload filters automatically.
 */
export const isEditorOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'editor') return true
  return { id: { equals: user.id } }
}

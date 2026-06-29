import type { Access } from 'payload'

import { isAuthenticated, isEditor } from './index'

/**
 * Editors -> everything.
 * Contributors -> only documents where they appear in the `authors` array.
 *
 * `{ authors: { in: [user.id] } }` is membership against a hasMany relationship:
 * Payload returns docs whose `authors` contains the current user's id. The same
 * constraint is reused for both `read` and `update`, so a Contributor can never
 * see or mutate a document they don't author — enforced on every API surface
 * (REST, GraphQL, Local API, admin UI) by Payload itself.
 */
const editorAllOrOwnAuthored: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'editor') return true
  return { authors: { in: [user.id] } }
}

/** read: Editors see everything; Contributors see only their authored items. */
export const canReadContentItems: Access = editorAllOrOwnAuthored

/** update: Editors update anything; Contributors update only their authored items. */
export const canUpdateContentItems: Access = editorAllOrOwnAuthored

/** create: allowed for both roles (any authenticated user). */
export const canCreateContentItems: Access = isAuthenticated

/** delete: Editors only — prefer the soft-delete `isArchived` flag for everyone else. */
export const canDeleteContentItems: Access = isEditor

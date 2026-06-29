import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Automated audit logging.
 *
 * On every write we (1) stamp `updatedBy` with the acting user and (2) append a
 * capped, append-only entry to `auditLog` capturing who did what, when, and the
 * resulting status. Because it lives in `beforeChange`, the trail is maintained
 * for admin edits, REST/GraphQL calls and Local API writes alike — no client
 * has to remember to record anything.
 */
export const stampAudit: CollectionBeforeChangeHook = ({ data, req, operation, originalDoc }) => {
  data.updatedBy = req.user?.id ?? null

  const entry = {
    user: req.user?.id ?? null,
    action: operation, // 'create' | 'update'
    status: data?.status ?? null,
    at: new Date().toISOString(),
  }

  const previous = Array.isArray(originalDoc?.auditLog) ? originalDoc.auditLog : []
  // Keep the last 25 entries so the document never grows unbounded.
  data.auditLog = [...previous, entry].slice(-25)

  return data
}

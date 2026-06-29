'use client'

import { useAuth, useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type State = { status: 'acquiring' | 'held' | 'locked'; by?: string }

/**
 * UI field rendered on the ContentItems edit form. While someone has a post open
 * in the admin, it tries to acquire an `admin` lock in our shared lock store
 * (Redis + realtime) and heartbeats to keep it alive — so every open board shows
 * that card as 🔒 locked, and (via the enforceEditLock hook) nobody else can
 * save it. Released on unmount / tab close.
 *
 * If someone else already holds the lock, we don't steal it: this viewer is
 * read-only and is told who holds it. The heartbeat keeps retrying, so the lock
 * hands over automatically once the holder leaves.
 */
export function AdminEditLock() {
  const { id } = useDocumentInfo()
  const { user } = useAuth()
  const [state, setState] = useState<State>({ status: 'acquiring' })

  useEffect(() => {
    if (id == null || !user) return
    let active = true

    const acquire = () =>
      fetch('/locks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify({ itemId: id, active: true, kind: 'admin' }),
      })
        .then(async (r) => {
          if (!active) return
          if (r.status === 409) {
            const b = await r.json().catch(() => ({}))
            setState({ status: 'locked', by: b?.by?.name ?? 'someone' })
          } else if (r.ok) {
            setState({ status: 'held' })
          }
        })
        .catch(() => {})

    void acquire()
    // Heartbeat keeps our lock alive and retries a takeover once it frees up.
    const heartbeat = setInterval(acquire, 8_000)
    const release = () =>
      fetch('/locks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify({ itemId: id, active: false }),
      }).catch(() => {})
    window.addEventListener('beforeunload', release)

    return () => {
      active = false
      clearInterval(heartbeat)
      window.removeEventListener('beforeunload', release)
      void release()
    }
  }, [id, user])

  if (id == null) return null

  const locked = state.status === 'locked'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        marginBottom: 12,
        borderRadius: 6,
        background: locked ? '#fee2e2' : state.status === 'held' ? '#fef3c7' : '#f1f5f9',
        color: locked ? '#b91c1c' : state.status === 'held' ? '#b45309' : '#64748b',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {locked
        ? `🔒 Being edited by ${state.by} — read-only. Your changes won't be saved until they're done.`
        : state.status === 'held'
          ? '🔒 You hold the edit lock — this post is locked for everyone else.'
          : 'Acquiring edit lock…'}
    </div>
  )
}

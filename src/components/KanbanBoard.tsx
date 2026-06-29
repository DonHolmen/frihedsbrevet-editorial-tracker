'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useRealtime } from '@/lib/realtime-client'
import type { PresentUser } from '@/lib/realtime-schema'

import { DeadlineBadge } from './DeadlineBadge'

type Status = 'idea' | 'draft' | 'review' | 'published' | 'archived'

type Item = {
  id: string | number
  title: string
  status: Status
  type?: string
  deadline?: string | null
  isArchived?: boolean
}

type CurrentUser = { id: string | number; name: string; role: string }

const COLUMNS: { key: Status; label: string }[] = [
  { key: 'idea', label: 'Idea' },
  { key: 'draft', label: 'Draft' },
  { key: 'review', label: 'Review' },
  { key: 'published', label: 'Published' },
]

const TERMINAL: Status[] = ['published', 'archived']

export function KanbanBoard({
  initialItems,
  currentUser,
}: {
  initialItems: Item[]
  currentUser: CurrentUser
}) {
  const [items, setItems] = useState<Item[]>(initialItems)
  const [present, setPresent] = useState<Record<string, { name: string }>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | number | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // ---- Realtime: typed subscription via the Upstash Realtime SDK ----------
  const seedPresence = useCallback(
    (roster: PresentUser[]) => {
      const next: Record<string, { name: string }> = {}
      for (const u of roster) {
        if (String(u.id) !== String(currentUser.id)) next[String(u.id)] = { name: u.name }
      }
      setPresent(next)
    },
    [currentUser.id],
  )

  useRealtime({
    events: ['board.item', 'board.deleted', 'board.presence'],
    onData({ event, data }) {
      if (event === 'board.item') {
        setItems((prev) => {
          const rest = prev.filter((i) => String(i.id) !== String(data.id))
          // archived items leave the board entirely
          return data.isArchived ? rest : [...rest, data as Item]
        })
      } else if (event === 'board.deleted') {
        setItems((prev) => prev.filter((i) => String(i.id) !== String(data.id)))
      } else if (event === 'board.presence') {
        // Authoritative roster — replace local state wholesale.
        seedPresence(data)
      }
    },
  })

  // ---- Presence: announce + heartbeat; seed from the authoritative roster --
  useEffect(() => {
    let active = true

    const post = (type: 'join' | 'heartbeat' | 'leave') =>
      fetch('/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
        keepalive: true,
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ roster?: PresentUser[] }>) : null))
        .catch(() => null)

    // Join, then seed our roster so we immediately see who's already here
    // (the live broadcast only covers people who join *after* us).
    void post('join').then((res) => {
      if (active && res?.roster) seedPresence(res.roster)
    })

    const heartbeat = setInterval(() => void post('heartbeat'), 15_000)
    const onUnload = () => void post('leave')
    window.addEventListener('beforeunload', onUnload)

    return () => {
      active = false
      clearInterval(heartbeat)
      window.removeEventListener('beforeunload', onUnload)
      void post('leave')
    }
  }, [seedPresence])

  // ---- Move a card: optimistic update -> PATCH -> rollback on failure ----
  const move = useCallback(
    async (id: string | number, status: Status) => {
      const before = items
      const target = items.find((i) => String(i.id) === String(id))
      if (!target || target.status === status) return

      // Client-side hint: contributors can't reach terminal statuses.
      if (currentUser.role !== 'editor' && TERMINAL.includes(status)) {
        flash(`Only Editors can move items to "${status}".`)
        return
      }

      setItems((prev) => prev.map((i) => (String(i.id) === String(id) ? { ...i, status } : i)))

      try {
        const res = await fetch(`/api/content-items/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ status }),
        })
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          const msg = payload?.errors?.[0]?.message ?? `Update failed (${res.status})`
          setItems(before) // rollback
          flash(msg)
        }
        // success: the afterChange broadcast will reconcile every board (incl. ours)
      } catch {
        setItems(before)
        flash('Network error — change rolled back.')
      }
    },
    [items, currentUser.role, flash],
  )

  const byStatus = useMemo(() => {
    const map: Record<Status, Item[]> = { idea: [], draft: [], review: [], published: [], archived: [] }
    for (const it of items) (map[it.status] ?? map.idea).push(it)
    return map
  }, [items])

  const others = Object.entries(present)

  return (
    <div className="p-6">
      {/* presence bar */}
      <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <span className="font-medium text-slate-700">Live:</span>
        <span className="inline-flex h-7 items-center rounded-full bg-emerald-100 px-3 text-xs font-semibold text-emerald-700">
          {currentUser.name} (you)
        </span>
        {others.map(([id, u]) => (
          <span
            key={id}
            className="inline-flex h-7 items-center rounded-full bg-slate-200 px-3 text-xs font-medium text-slate-700"
          >
            {u.name}
          </span>
        ))}
        {others.length === 0 && <span className="text-xs text-slate-400">no one else here</span>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId != null) void move(dragId, col.key)
              setDragId(null)
            }}
            className="flex min-h-[60vh] flex-col rounded-xl bg-slate-200/60 p-3"
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{col.label}</h2>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">
                {byStatus[col.key].length}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-2">
              {byStatus[col.key].map((item) => (
                <article
                  key={item.id}
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragEnd={() => setDragId(null)}
                  className="cursor-grab rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md active:cursor-grabbing"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold leading-snug text-slate-800">{item.title}</h3>
                    <DeadlineBadge deadline={item.deadline} />
                  </div>
                  {item.type && (
                    <span className="mt-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {item.type}
                    </span>
                  )}
                </article>
              ))}
              {byStatus[col.key].length === 0 && (
                <p className="px-1 py-6 text-center text-xs text-slate-400">Drop items here</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

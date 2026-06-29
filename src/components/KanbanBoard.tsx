'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useRealtime } from '@/lib/realtime-client'
import type { BoardLock, PresentUser } from '@/lib/realtime-schema'

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

/** Turn a lock array into an itemId → editor map. */
const toLockMap = (locks: BoardLock[]): Record<string, { id: string | number; name: string }> => {
  const m: Record<string, { id: string | number; name: string }> = {}
  for (const l of locks) m[String(l.itemId)] = l.by
  return m
}

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
  // Edit locks: who is editing each card. `boardLocks` = inline board edits
  // (live via realtime + poll); `adminLocks` = docs open in /admin (polled).
  const [boardLocks, setBoardLocks] = useState<Record<string, { id: string | number; name: string }>>({})
  const [adminLocks, setAdminLocks] = useState<Record<string, { id: string | number; name: string }>>({})
  const [editingId, setEditingId] = useState<string | number | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editBeat = useRef<ReturnType<typeof setInterval> | null>(null)
  const editingRef = useRef<string | number | null>(null)

  const flash = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // Who is locking `itemId` for me (board soft-lock beats admin lock); null if
  // it's free or the lock is my own.
  const lockedBy = useCallback(
    (itemId: string | number): { name: string } | null => {
      const key = String(itemId)
      const b = boardLocks[key]
      if (b && String(b.id) !== String(currentUser.id)) return b
      const a = adminLocks[key]
      if (a && String(a.id) !== String(currentUser.id)) return a
      return null
    },
    [boardLocks, adminLocks, currentUser.id],
  )

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
    events: ['board.item', 'board.deleted', 'board.presence', 'board.editing'],
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
      } else if (event === 'board.editing') {
        // Authoritative board soft-locks — replace local state wholesale.
        setBoardLocks(toLockMap(data))
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

  const postEdit = useCallback(
    (itemId: string | number, isActive: boolean) =>
      fetch('/editing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify({ itemId, active: isActive }),
      }),
    [],
  )

  // ---- Edit locks: seed + poll merged lock state (board + admin) ----------
  useEffect(() => {
    let active = true
    const refresh = () =>
      fetch('/editing', { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ board?: BoardLock[]; admin?: BoardLock[] }>) : null))
        .then((res) => {
          if (!active || !res) return
          if (res.board) setBoardLocks(toLockMap(res.board))
          if (res.admin) setAdminLocks(toLockMap(res.admin))
        })
        .catch(() => {})

    void refresh()
    const poll = setInterval(refresh, 10_000)
    return () => {
      active = false
      clearInterval(poll)
    }
  }, [])

  // Release my lock if I close the tab or unmount mid-edit.
  useEffect(() => {
    editingRef.current = editingId
  }, [editingId])
  useEffect(() => {
    const release = () => {
      if (editingRef.current != null) void postEdit(editingRef.current, false)
    }
    window.addEventListener('beforeunload', release)
    return () => {
      window.removeEventListener('beforeunload', release)
      if (editBeat.current) clearInterval(editBeat.current)
      release()
    }
  }, [postEdit])

  const stopEditing = useCallback(
    (itemId: string | number) => {
      if (editBeat.current) {
        clearInterval(editBeat.current)
        editBeat.current = null
      }
      setEditingId(null)
      setDraftTitle('')
      void postEdit(itemId, false)
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => res?.board && setBoardLocks(toLockMap(res.board)))
        .catch(() => {})
    },
    [postEdit],
  )

  const startEdit = useCallback(
    async (item: Item) => {
      const held = lockedBy(item.id)
      if (held) {
        flash(`"${item.title}" is being edited by ${held.name}.`)
        return
      }
      const res = await postEdit(item.id, true).catch(() => null)
      if (!res) {
        flash('Network error — could not start editing.')
        return
      }
      const body = await res.json().catch(() => ({}))
      if (body?.board) setBoardLocks(toLockMap(body.board))
      if (res.status === 409) {
        flash(`"${item.title}" was just locked by ${body?.by?.name ?? 'someone'}.`)
        return
      }
      setEditingId(item.id)
      setDraftTitle(item.title)
      // Keep the lock alive while the editor is open.
      editBeat.current = setInterval(() => void postEdit(item.id, true), 8_000)
    },
    [lockedBy, postEdit, flash],
  )

  const saveEdit = useCallback(
    async (item: Item) => {
      const title = draftTitle.trim()
      if (!title || title === item.title) {
        stopEditing(item.id)
        return
      }
      try {
        const res = await fetch(`/api/content-items/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ title }),
        })
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          flash(payload?.errors?.[0]?.message ?? `Update failed (${res.status})`)
          return // keep editing so the user can retry
        }
        // success: afterChange broadcast reconciles every board; update ours now
        setItems((prev) => prev.map((i) => (String(i.id) === String(item.id) ? { ...i, title } : i)))
        stopEditing(item.id)
      } catch {
        flash('Network error — title not saved.')
      }
    },
    [draftTitle, flash, stopEditing],
  )

  // ---- Move a card: optimistic update -> PATCH -> rollback on failure ----
  const move = useCallback(
    async (id: string | number, status: Status) => {
      const before = items
      const target = items.find((i) => String(i.id) === String(id))
      if (!target || target.status === status) return

      const held = lockedBy(id)
      if (held) {
        flash(`"${target.title}" is locked by ${held.name}.`)
        return
      }

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
    [items, currentUser.role, flash, lockedBy],
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
              {byStatus[col.key].map((item) => {
                const lock = lockedBy(item.id)
                const isEditing = String(editingId) === String(item.id)
                const draggable = !lock && !isEditing
                return (
                  <article
                    key={item.id}
                    draggable={draggable}
                    onDragStart={() => draggable && setDragId(item.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`rounded-lg bg-white p-3 shadow-sm ring-1 transition ${
                      lock
                        ? 'cursor-not-allowed opacity-60 ring-amber-300'
                        : 'cursor-grab ring-slate-200 hover:shadow-md active:cursor-grabbing'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <input
                          autoFocus
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveEdit(item)
                            if (e.key === 'Escape') stopEditing(item.id)
                          }}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => void saveEdit(item)}
                            className="rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => stopEditing(item.id)}
                            className="rounded px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-900"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold leading-snug text-slate-800">{item.title}</h3>
                          <DeadlineBadge deadline={item.deadline} />
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          {item.type && (
                            <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              {item.type}
                            </span>
                          )}
                          {lock ? (
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              🔒 {lock.name} is editing
                            </span>
                          ) : (
                            <button
                              onClick={() => void startEdit(item)}
                              className="ml-auto rounded px-2 py-0.5 text-[11px] font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              ✎ Edit
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </article>
                )
              })}
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

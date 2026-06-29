/**
 * "Deadlines at a glance" — a pure function of the deadline timestamp.
 *   • overdue        -> red
 *   • due ≤ 48h      -> amber
 *   • otherwise      -> emerald
 * Reused on every Kanban card; the same logic can back a custom admin list Cell.
 */
export function DeadlineBadge({ deadline }: { deadline?: string | null }) {
  if (!deadline) return null

  const ms = new Date(deadline).getTime() - Date.now()
  const hours = Math.round(ms / 3_600_000)

  const tone =
    ms < 0
      ? 'bg-red-100 text-red-700 ring-red-200'
      : ms < 48 * 3_600_000
        ? 'bg-amber-100 text-amber-700 ring-amber-200'
        : 'bg-emerald-100 text-emerald-700 ring-emerald-200'

  const label =
    ms < 0
      ? `Overdue ${Math.abs(hours)}h`
      : hours < 48
        ? `${hours}h left`
        : `${Math.round(hours / 24)}d left`

  return (
    <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tone}`}>
      {label}
    </span>
  )
}

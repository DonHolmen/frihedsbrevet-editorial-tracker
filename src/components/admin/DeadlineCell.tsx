'use client'

import type { DefaultCellComponentProps } from 'payload'

import React from 'react'

/**
 * Admin list Cell for the `deadline` column — colours the cell by urgency so
 * editors triage at a glance inside the Payload admin list view. Mirrors the
 * board's `DeadlineBadge` styling.
 *
 * Wired in via `ContentItems.ts` → `deadline.admin.components.Cell`; registered
 * in the generated import map (`pnpm generate:importmap` after any change).
 */
export const DeadlineCell: React.FC<DefaultCellComponentProps> = ({ cellData }) => {
  if (!cellData) return <span style={{ color: '#94a3b8' }}>—</span>

  const ms = new Date(cellData as string).getTime() - Date.now()
  const hours = Math.round(ms / 3_600_000)
  const color = ms < 0 ? '#b91c1c' : ms < 48 * 3_600_000 ? '#b45309' : '#047857'
  const bg = ms < 0 ? '#fee2e2' : ms < 48 * 3_600_000 ? '#fef3c7' : '#d1fae5'
  const label = ms < 0 ? `Overdue ${Math.abs(hours)}h` : hours < 48 ? `${hours}h left` : `${Math.round(hours / 24)}d left`

  return (
    <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
      {label}
    </span>
  )
}

'use client'

import { RealtimeProvider } from '@upstash/realtime/client'
import React from 'react'

/**
 * Client providers for the editorial frontend. `RealtimeProvider` manages a
 * single shared SSE connection that every `useRealtime` hook subscribes through.
 *
 * Points at `/realtime` (outside Payload's `/api` catch-all) and sends cookies
 * so the route's Payload-auth middleware can authorize the session.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <RealtimeProvider api={{ url: '/realtime', withCredentials: true }}>{children}</RealtimeProvider>
  )
}

'use client'

import { createRealtime } from '@upstash/realtime/client'

import type { RealtimeEvents } from './realtime-schema'

/**
 * Typed `useRealtime` hook bound to our board event schema. Subscribing with
 * `events: ['board.item', ...]` yields a discriminated union on `event`, so
 * `data` is automatically narrowed per event in `onData`.
 */
export const { useRealtime } = createRealtime<RealtimeEvents>()

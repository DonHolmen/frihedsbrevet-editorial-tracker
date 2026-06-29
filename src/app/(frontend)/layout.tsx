import type { Metadata } from 'next'
import React from 'react'

import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Frihedsbrevet — Editorial Tracker',
  description: 'Collaborative editorial pipeline for the Frihedsbrevet newsroom.',
}

/**
 * Root layout for the public/editorial frontend. The Payload admin lives in a
 * separate route group ((payload)) with its own root layout, so the two never
 * share styling — Tailwind only loads here.
 */
export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

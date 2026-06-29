import path from 'path'
import { fileURLToPath } from 'url'

import { withPayload } from '@payloadcms/next/withPayload'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root so a stray lockfile in $HOME can't mis-infer it.
  turbopack: { root: dirname },
}

export default withPayload(nextConfig)

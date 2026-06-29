import config from '@payload-config'
import { getPayload } from 'payload'

import type { ContentItem } from '../payload-types'

type SeedItem = {
  title: string
  status: ContentItem['status']
  type: ContentItem['type']
  deadline: string
  authors: number[]
}

/**
 * Quickseed: 1 Editor, 1 Contributor, and 4 sample content items spanning the
 * pipeline (including one overdue + one already-published) so the board and the
 * RBAC rules can be demoed instantly.
 *
 * Run with:  pnpm seed   (-> `payload run src/seed/seed.ts`)
 *
 * Note: `overrideAccess: true` is required — seeding runs with no `req.user`, so
 * field-level guards (e.g. the `role` lock) would otherwise reject the writes.
 */

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

async function run() {
  const payload = await getPayload({ config })

  // Idempotency: wipe existing demo rows so re-seeding is safe.
  await payload.delete({ collection: 'content-items', where: { id: { exists: true } }, overrideAccess: true })
  await payload.delete({
    collection: 'users',
    where: { email: { in: ['editor@frihedsbrevet.dk', 'clara@frihedsbrevet.dk'] } },
    overrideAccess: true,
  })

  const editor = await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: {
      name: 'Editor Erik',
      email: 'editor@frihedsbrevet.dk',
      password: 'test1234',
      role: 'editor',
    },
  })

  const contributor = await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: {
      name: 'Contributor Clara',
      email: 'clara@frihedsbrevet.dk',
      password: 'test1234',
      role: 'contributor',
    },
  })

  const items: SeedItem[] = [
    { title: 'Magtens netværk', status: 'idea', type: 'article', deadline: day(5), authors: [contributor.id] },
    {
      title: 'Whistleblower-podcast',
      status: 'draft',
      type: 'podcast',
      deadline: day(2),
      authors: [contributor.id, editor.id],
    },
    { title: 'Budgetlækage', status: 'review', type: 'article', deadline: day(-1), authors: [contributor.id] }, // overdue
    { title: 'Årets afsløringer', status: 'published', type: 'newsletter', deadline: day(10), authors: [editor.id] },
  ]

  for (const data of items) {
    await payload.create({ collection: 'content-items', data, overrideAccess: true })
  }

  payload.logger.info('—'.repeat(48))
  payload.logger.info('Seed complete.')
  payload.logger.info('  Editor:      editor@frihedsbrevet.dk / test1234')
  payload.logger.info('  Contributor: clara@frihedsbrevet.dk  / test1234')
  payload.logger.info('—'.repeat(48))
}

// Top-level await so `payload run` waits for the async work to finish before
// the module evaluation resolves (a fire-and-forget call would exit early).
try {
  await run()
  process.exit(0)
} catch (err) {
  console.error(err)
  process.exit(1)
}

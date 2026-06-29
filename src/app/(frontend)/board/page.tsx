import config from '@payload-config'
import { headers as nextHeaders } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { KanbanBoard } from '@/components/KanbanBoard'

export const dynamic = 'force-dynamic'

/**
 * Editorial board (Server Component).
 *
 * The "wow": the SAME access functions that protect the REST/GraphQL APIs also
 * protect this server-rendered page — we call the Local API with
 * `overrideAccess: false` + the authenticated `user`, so a Contributor's query
 * is automatically narrowed to items they author. No duplicated authz logic.
 */
export default async function BoardPage() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await nextHeaders() })

  if (!user) redirect('/admin/login?redirect=/board')

  const { docs } = await payload.find({
    collection: 'content-items',
    where: { isArchived: { equals: false } },
    overrideAccess: false, // run the §2 access control functions...
    user, //                 ...as THIS user → contributors auto-filtered
    depth: 1,
    limit: 200,
    sort: 'deadline',
  })

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Frihedsbrevet</p>
          <h1 className="text-lg font-bold tracking-tight">Editorial Board</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            {(user as { name?: string }).name ?? user.email}
            <span className="ml-2 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
              {(user as { role?: string }).role}
            </span>
          </span>
          <Link href="/admin" className="text-slate-500 hover:text-slate-900">
            Admin
          </Link>
        </div>
      </header>

      <KanbanBoard
        initialItems={docs as never[]}
        currentUser={{
          id: user.id,
          name: (user as { name?: string }).name ?? user.email ?? 'You',
          role: (user as { role?: string }).role ?? 'contributor',
        }}
      />
    </main>
  )
}

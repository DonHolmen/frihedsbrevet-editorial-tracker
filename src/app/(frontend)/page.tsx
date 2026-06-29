import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Frihedsbrevet</p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight">Editorial Tracker</h1>
        <p className="mt-3 text-slate-500">
          Real-time editorial pipeline — role-aware, deadline-driven, collaborative.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/board"
          className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Open the board
        </Link>
        <Link
          href="/admin"
          className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Admin panel
        </Link>
      </div>
    </main>
  )
}

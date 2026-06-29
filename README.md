# Frihedsbrevet — Editorial Tracker

Internal collaborative editorial pipeline for the Frihedsbrevet newsroom. Built on
**Payload CMS v3** (backend, DB, auth, REST/GraphQL, admin UI) + **Next.js App Router**,
with a real-time Kanban board for the newsroom.

| Layer | Choice |
| --- | --- |
| CMS / backend | Payload `3.85.1` |
| Framework | Next.js `16.2` (App Router) |
| Database | SQLite via `@payloadcms/db-sqlite` (file-based, zero infra) |
| Editor | `@payloadcms/richtext-lexical` |
| Realtime | Upstash Realtime SDK (`@upstash/realtime`) — Redis Streams + SSE |
| Styling | Tailwind CSS v4 |

> **📋 Scope, decisions & assumptions:** see **[DECISIONS.md](./DECISIONS.md)** — what was
> built against the brief, what was added beyond it (and why), and what was deliberately
> out-scoped.

## Roles

- **Editor** — global power: read/create/update all users and content; only role that
  can move items to **Published** / **Archived**, toggle archive, or delete.
- **Contributor** — sees and edits only content items where they are an `author`; may
  advance items up to **Review**.

RBAC is enforced once, inside Payload access functions, and applies uniformly to REST,
GraphQL, the Local API and the admin UI. The custom board reuses the exact same rules by
calling the Local API with `overrideAccess: false`.

## Quick start

```bash
pnpm install
cp .env.example .env          # then edit — Upstash creds are optional (realtime no-ops without them)
pnpm generate:types           # generates src/payload-types.ts
pnpm dev                      # http://localhost:3000  (admin at /admin)
```

Then seed demo data (in a second terminal, or before `dev`):

```bash
pnpm seed
```

Logins created by the seed:

| Role | Email | Password |
| --- | --- | --- |
| Editor | `editor@frihedsbrevet.dk` | `test1234` |
| Contributor | `clara@frihedsbrevet.dk` | `test1234` |

- Admin panel: **/admin**
- Editorial board: **/board**

## Realtime (optional but recommended)

Live multiplayer (presence + cards moving between columns across browsers) is powered by the
**Upstash Realtime SDK** (`@upstash/realtime`), which is **100% HTTP** (Redis Streams + SSE) —
no native socket. Create a free DB at [upstash.com](https://upstash.com) and add the two REST
credentials to `.env`:

```
UPSTASH_REDIS_REST_URL=...      # REST endpoint
UPSTASH_REDIS_REST_TOKEN=...    # REST token
```

Without these the app still runs fully — realtime + presence simply become no-ops and the
board updates locally only. Emitted events are visible live in the Upstash console's
**Realtime** dashboard.

## How it maps to the architecture

| Concern | Where |
| --- | --- |
| Access helpers | `src/access/index.ts`, `src/access/contentItems.ts` |
| Users / auth | `src/collections/Users.ts` |
| ContentItems + state machine | `src/collections/ContentItems.ts`, `src/hooks/enforceStatusStateMachine.ts` |
| Audit log + `updatedBy` | `src/hooks/stampAudit.ts` |
| Realtime SDK (emit + schema + Redis) | `src/lib/realtime.ts`, `src/lib/realtime-schema.ts`, `src/lib/redis.ts` |
| Realtime SSE route + presence | `src/app/realtime/route.ts`, `src/app/presence/route.ts`, `src/lib/presence.ts` |
| Realtime broadcast hooks | `src/hooks/broadcastChange.ts` (afterChange + afterDelete) |
| Edit locks (board soft-lock + admin mirror) | `src/app/editing/route.ts`, `src/lib/editing.ts` |
| Board (Local API + RBAC) | `src/app/(frontend)/board/page.tsx`, `src/components/KanbanBoard.tsx` |
| Deadlines at a glance | `src/components/DeadlineBadge.tsx` (+ optional `src/components/admin/DeadlineCell.tsx`) |
| Seed | `src/seed/seed.ts` |

## Demo script (≈2 min)

1. `pnpm seed`, then open `/board` logged in as **Clara** and **Erik** (two browsers).
2. As Clara, drag *Budgetlækage* to **Published** → blocked with a 403 toast.
3. As Erik, drag it to **Published** → succeeds and appears live on Clara's board.
4. As Erik, click **✎ Edit** on a card → Clara instantly sees it 🔒 *"Erik is editing"* and
   can't drag it; Erik saves a new title → it updates live and the lock clears.
5. Open that same item in **/admin** → the board shows it 🔒 locked while it's open there too.
6. Note *Budgetlækage* shows a red **Overdue** badge.
7. Open any item in `/admin` → see the `auditLog` array + `updatedBy`.
8. As Erik, toggle `isArchived` on an item → it leaves the board for everyone.

## Stretch goal (documented, not built)

True *character-level* co-editing of the Lexical body via Yjs CRDT + a sync server
(Hocuspocus / y-websocket) with the awareness protocol for live cursors. The current build
ships a race-safe slice instead: **editing soft-locks** on the board (a 🔒 indicator while a
card is being edited, with live release) that also **mirror Payload's native `lockDocuments`**
so a doc open in `/admin` shows locked on the board.

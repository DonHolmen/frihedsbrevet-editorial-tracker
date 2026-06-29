# Scope, Decisions & Assumptions

This document is the "assumptions/decisions" deliverable requested in the brief. It records
**what was built against the brief**, **what was added beyond it (and why)**, and **what was
deliberately left out of scope (and why)**.

## Philosophy

The brief was deliberately soft-edged and said to treat it like a real work situation. So
rather than a throwaway mock, I built a **thin but production-shaped vertical slice** of an
editorial tool and used the remaining time to demonstrate engineering judgment in the areas
that matter most for a small newsroom replacing spreadsheets: **trustworthy access control,
data integrity, accountability, and live collaboration**.

One foundational decision drives most of the others: **I built on a real CMS (Payload v3)
instead of mock auth + in-memory data.** Rationale:

- The brief's "mock" path optimises for time; the real path optimises for showing how I'd
  actually ship this. Payload gives real auth, RBAC, a typed data layer, auto REST **and**
  GraphQL, and an admin UI essentially for free — which is exactly the leverage a small
  media company needs.
- It let me spend my hours on *judgment* (access rules, a status state machine, an audit
  trail, realtime) rather than on plumbing (password hashing, sessions, CRUD endpoints).

Everything below follows from that.

---

## 1. Brief coverage (requirement → where it lives)

| Brief requirement | Status | Where |
| --- | --- | --- |
| Login functionality | ✅ Real auth (not hardcoded) | Payload auth on `src/collections/Users.ts`; login at `/admin/login` |
| Two roles: Editor / Contributor | ✅ | `role` select on `Users.ts`; `src/access/*` |
| Editor manages **all** content | ✅ | `src/access/contentItems.ts` |
| Contributor manages **only own** content | ✅ Enforced as a DB `Where` filter | `editorAllOrOwnAuthored` in `src/access/contentItems.ts` |
| `ContentItem` model: title, status, authors, deadline, type | ✅ | `src/collections/ContentItems.ts` |
| status options: Idea, Draft, Review, Published | ✅ (+ `Archived`, see §4) | `ContentItems.ts` |
| type options: Article, Video, … | ✅ Article / Video / Podcast / Newsletter | `ContentItems.ts` |
| Retrieve all content items | ✅ Auto REST + GraphQL + Local API | `src/app/(payload)/api/[...slug]` |
| Create a new content item | ✅ via admin create form (see §3) | `/admin` |
| Update the status of an item | ✅ Drag-and-drop on the board → PATCH | `src/components/KanbanBoard.tsx` |
| Filter content based on user role | ✅ Same access fn on API **and** the board | `board/page.tsx` (`overrideAccess: false`) |
| Login screen | ✅ Payload login reused (see §3) | `/admin/login` |
| Dashboard: list grouped/filterable by status | ✅ Kanban columns by status | `KanbanBoard.tsx` |
| Dashboard: shows creator + deadline | ⚠️ Partial — deadline on cards; creator in admin (see §3) | `KanbanBoard.tsx` / `/admin` |
| Dashboard: form to create items | ⚠️ Via admin, not the board (see §3) | `/admin` |
| Content view: publish / edit / archive | ✅ Publish via drag; edit/archive via admin; cards lock while dragged or open in admin | board + `/admin` |

All core data and access requirements are met. The two ⚠️ items are conscious scope
choices, explained in §3 — surfaced here rather than hidden.

---

## 2. Enhancements beyond the brief (what · why · what it demonstrates)

### Backend & data integrity

- **RBAC defined once, enforced everywhere.** The same access functions guard REST, GraphQL,
  the Local API, the admin UI **and** the server-rendered board (`board/page.tsx` calls the
  Local API with `overrideAccess: false`). *Why:* a newsroom can't have authorization drift
  between surfaces; writing it once removes a whole class of bugs. *Shows:* I think in terms
  of a single source of truth, not per-endpoint checks.
- **Field-level access control.** Contributors can't promote themselves (`Users.role`),
  can't soft-delete (`isArchived` is editor-only), and can't forge the audit fields
  (`updatedBy`, `auditLog` are server-maintained). *Why:* row-level access isn't enough when
  individual fields carry different trust levels.
- **Status state machine** (`src/hooks/enforceStatusStateMachine.ts`). Only legal
  transitions are allowed (e.g. you can't jump Idea → Published), and only Editors can reach
  the terminal `published`/`archived` states; violations return clean 400/403s. *Why:* an
  editorial pipeline *is* a state machine — encoding it prevents nonsensical data and bakes
  the "who can publish" rule into the core, not just the UI.
- **Audit trail** (`src/hooks/stampAudit.ts`). Every write stamps `updatedBy` and appends a
  capped (25-entry) `auditLog` of who/what/when/status. *Why:* accountability is
  non-negotiable in journalism; "who moved this to Published?" must be answerable.
- **Soft-delete** via `isArchived` (editor-only), so the board stays clean while content is
  never destroyed by accident.
- **Auto GraphQL** alongside REST — free with Payload, useful for future integrations.

### Realtime collaboration (the headline enhancement)

- **Live multiplayer Kanban** over the **Upstash Realtime SDK** (Redis Streams + SSE).
  Card moves, creates, and deletes propagate to every open board in real time. *Why:* the
  single biggest jump from "spreadsheet" to "tool" is seeing colleagues' changes live; this
  is the feature that best showcases the product vision.
- **Presence roster + heartbeat** (`src/lib/presence.ts`). A Redis-backed roster shows who's
  on the board now, with a 15s heartbeat and 30s staleness pruning so crashed tabs disappear
  on their own. *Why:* presence is the social cue that makes collaboration feel safe.
- **Optimistic UI with rollback** (`KanbanBoard.tsx`): drags apply instantly and revert with
  a toast if the server rejects (e.g. a Contributor trying to Publish). *Why:* snappy UX
  without lying about server state.
- **Graceful degradation:** with no Upstash credentials the app runs fully — realtime simply
  no-ops and the board works locally. *Why:* a realtime outage must never break core CRUD or
  fail a write (the broadcast hook is best-effort).
- **One enforced lock across board + admin.** A custom Redis-backed lock (broadcast live over
  realtime) is shared by both surfaces: dragging a card on the board takes a `drag` lock, and
  opening a post in `/admin` takes an `admin` lock (via the `AdminEditLock` UI field on the edit
  form). While locked, every open board shows the card 🔒 "[name] is moving/editing" and won't
  drag it; the lock can't be stolen (409) or released by anyone but the holder; and — crucially
  — a `beforeChange` hook (`enforceEditLock`) **hard-rejects any save by another user (HTTP
  423)**. So a second person can open a post read-only but cannot clobber it from the board, the
  admin, or the REST/GraphQL API. *Why:* true mutual exclusion, not just a hint; *shows:* I
  built one coherent, enforced lock spanning two independent surfaces rather than leaning on
  Payload's takeover-able built-in lock (which is disabled here for exactly that reason).

### Concurrency, UX & DX

- **Concurrent-edit safety** via the enforced lock above (replacing Payload's takeover-able
  built-in `lockDocuments`, which is turned off for this collection).
- **Deadline urgency badges** (`DeadlineBadge.tsx`): red/amber/green by time-to-deadline so
  overdue work is obvious at a glance.
- **TypeScript strict end-to-end** + Payload-generated types + an isomorphic Zod event schema
  shared by client and server, so realtime payloads are type-checked on both ends.
- **Seed script + a scripted demo** (`src/seed/seed.ts`, README) including an intentionally
  overdue item, so the reviewer can see every feature in ~2 minutes.

---

## 3. Deliberately out of scope (and why)

These are conscious choices given the time-box — called out explicitly, as requested.

- **Create form on the custom board.** The brief asks for a create form on the dashboard;
  I rely on **Payload's admin create form** instead of rebuilding one on `/board`. *Why:*
  Payload already provides a validated form with relationship pickers, the rich-text editor,
  and the same access rules. Rebuilding it on the board would duplicate that for little gain
  in a 3h slice. *Trade-off:* creation happens at `/admin`, one click from the board. A
  "+ New" inline composer on the board is the natural next step.
- **Editing on the custom board.** The board is intentionally read-only except for status
  (drag-to-move) — editing an item's title/body/fields happens in the admin item view. *Why:*
  Payload's admin form already gives validated editing with the rich-text editor and the same
  access rules; rebuilding it on the board would duplicate that for little gain in this slice.
  (The board *does* surface a lock when an item is being edited in admin — see §2.)
- **Creator name on board cards.** Cards show title, type, and deadline; the author/creator
  is visible in the admin list (`updatedBy` column) and item view but not yet on the card.
  Small, deliberate omission to keep the card clean; trivial to add.
- **Character-level co-editing (CRDT).** True Google-Docs-style co-editing of the body via
  Yjs + a sync server was considered and **documented as a stretch goal, not built.** Instead
  the build ships a *race-safe slice*: one enforced edit lock across the board and admin (§2).
  *Why:* a correct CRDT setup is days, not hours, and out of proportion to the brief.
- **Docker.** Not included — SQLite makes the app zero-infra (`pnpm install && pnpm dev`), so
  Docker adds little for local review. A `Dockerfile` + compose is straightforward to add.
- **Automated tests.** None in this slice. *Why:* time-boxed toward demonstrating breadth.
  *What I'd add first:* unit tests for the state machine and access functions (the highest-
  risk pure logic), then an e2e happy-path for the board.
- **Production concerns:** email adapter (currently logs to console), rate limiting on
  `/presence` and `/realtime`, pagination/virtualization beyond the 200-item fetch, CI/CD and
  deployment, and deeper a11y/mobile polish — all intentionally deferred.

---

## 4. Assumptions & interpretations

- **"authors" → a `hasMany` relationship to Users**, and "who created an item" is interpreted
  as its author(s). A separate immutable `createdBy` could be added if creator ≠ author
  matters.
- **Roles** are named `editor` / `contributor`, default `contributor`.
- **`type` options** were chosen as Article / Video / Podcast / Newsletter (brief said
  "Article, Video, etc.").
- **Archive is modeled two ways** and this is a known wart: a terminal **`archived` status**
  (pipeline state, reachable via the state machine) *and* an **`isArchived` flag** (editor-only
  soft-delete that pulls an item off the board entirely). They serve different intents
  (workflow vs. visibility), but in a real iteration I'd unify them behind one concept to
  avoid ambiguity.
- **"Update the status"** is interpreted as the primary board interaction (drag-and-drop),
  backed by the state machine — the most common real editorial action.
- **Login screen** = Payload's built-in login, reused rather than rebuilt, since a custom
  screen would only restyle the same flow.
- **Status set extended** with `archived` beyond the brief's four, to support soft-delete and
  a complete lifecycle.

---

## 5. Summary

The brief is fully covered on data, roles, and role-scoped filtering, with two conscious UI
scope choices (create/edit happen in the admin) flagged transparently. Beyond the brief, the
slice demonstrates the engineering that actually matters for a newsroom tool: **authorization
as a single source of truth, a workflow state machine, an audit trail, and live multiplayer
collaboration** — each chosen because it maps to a real Frihedsbrevet need, not because it was
novel for its own sake.

---
id: 0010
title: "Assemble the ARCHITECTURE.md build plan + reference snippets (terminal / destination)"
type: task
status: closed
assignee: gavin
blocked_by: [0001, 0002, 0004, 0005, 0006, 0007, 0008, 0009]
blocks: []
---

## Question

Synthesise every resolved decision into the destination artifact: `ARCHITECTURE.md`, the hand-off
build plan. This is the one ticket explicitly authorised to *produce a deliverable* (see map Notes).

Assemble, drawing each section from its resolved ticket:

1. **Tech stack** — Next.js App Router + Tailwind + React Query, single-user local runtime (fixed at
   charting).
2. **OAuth & token strategy** — from 0002 (flow/scopes) + 0006 (storage/refresh).
3. **Backend / API abstraction layer** — from 0009, plus error/rate-limit strategy from 0003.
4. **Frontend architecture & grid UI spec** — from 0007 (caching/prefill) + 0008 (grid UX) + 0005
   (cell↔entry model).
5. **Implementation roadmap** — Phase 1 setup/auth, Phase 2 API layer, Phase 3 UI/keyboard, Phase 4
   offline/drafts (the last drawing on whatever graduated from *Not yet specified*).
6. **Reference code snippets** — (a) OAuth token-refresh helper (from 0006 + 0002); (b) time-entry
   write wrapper for `POST /timeentries` (from 0001 + 0004).

**Blocked by all decision tickets.** When this closes, the destination is reached.

## Resolution

**Destination reached.** Assembled [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) at the repo root —
the hand-off build plan — synthesising all eight critical-path decisions (0001–0009). Includes:

- Scope & fixed constraints; domain model / ubiquitous language (Slot/Row/Cell/Entry).
- Tech stack; OAuth & token strategy (flow, scopes, tenant/user resolution, memory-only lifecycle).
- API abstraction layer (route table, error envelope, retry split, limits).
- Frontend architecture + full grid UX spec (keyboard map, duration parsing, description flows,
  per-cell autosave), links the signed-off prototype.
- Phased roadmap (Phase 1 setup/auth → Phase 4 optional offline).
- **Both reference snippets:** (A) OAuth token-refresh helper (memory-only, rotating, single-flight);
  (B) time-entry write wrapper (`POST /Projects/{projectId}/Time`) + PUT/DELETE notes.
- Open/deferred items (offline 0011, granular scopes, packaging) and a decision trail appendix.

Only ticket 0011 (optional offline) remains open on the map; the critical path is complete.

---
id: 0010
title: "Assemble the ARCHITECTURE.md build plan + reference snippets (terminal / destination)"
type: task
status: open
assignee:
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

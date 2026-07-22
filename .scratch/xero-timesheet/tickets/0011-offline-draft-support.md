---
id: 0011
title: "Decide: offline / draft edit behaviour (optional, Phase 4)"
type: grilling
status: open
assignee:
blocked_by: []
blocks: []
---

## Question

**Optional (Phase 4 "maximum speed" extra).** Now that the cache infra is fixed (React Query +
localStorage, per 0007) and the grid model defines a "draft" (a Slot with no POSTed Entry, per 0005),
the offline question is sharp:

When a write to Xero can't complete — network down / Xero unreachable / a 429 or 5xx that survives the
API layer's retry (0009) — what should the grid do?

- **Queue-and-replay:** persist the pending mutation (create/update/delete) to localStorage, render the
  Cell as `pending`, and replay automatically on reconnect / next successful call. Fast and forgiving;
  needs a durable mutation queue, ordering, and conflict handling on replay.
- **Fail-loud:** the Cell shows an error state and the user retries manually; nothing is queued. Simple,
  no queue to get wrong, but you can't log while offline.

Also decide: does this extend to *composing a whole week offline* (all edits queued) or only to riding
out transient blips? And how a `pending` Cell looks vs `dirty`/`saved`/`error` (ties to the grid
prototype 0008).

**Not on the critical path:** this is explicitly optional. The core plan (Phases 1–3 + local caching)
assembles without it; the terminal synthesis ticket (0010) references Phase 4 as optional and links
here. Resolve it if you want offline resilience; otherwise it can be ruled out of scope.

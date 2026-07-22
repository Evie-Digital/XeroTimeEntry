---
id: 0011
title: "Decide: offline / draft edit behaviour (optional, Phase 4)"
type: grilling
status: closed
assignee: gavin
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

## Resolution

Decided with the user (HITL): **auto-retry transient resilience (in-memory, no durable queue).**
Durable queue-and-replay / full offline composition was explicitly *not* chosen.

- On a write failure (network error, 5xx, or a 429 that outlives the client's initial retry), the Cell
  enters a new **`pending`** state (visually distinct from `saving`'s quick pulse and `error`'s red).
- The mutation **auto-retries with exponential backoff**, honoring `Retry-After` on 429 (per the 0009
  `rate_limited` envelope), for a bounded window (e.g. a few attempts / ~1–2 min).
- Success → `saved`. Retries exhausted → `error` (manual re-commit to retry, using the grid's existing
  error affordance).
- **In-memory only.** The retry state lives in React Query's mutation state; a **page reload while
  pending loses the pending edit** — the grid re-fetches from Xero on reload and the Cell reverts to
  its last-saved value. No localStorage persistence of pending mutations, no cross-reload offline.
- **Per-cell, independent, last-write-wins** — consistent with the per-cell autosave model (0005/0008);
  no cross-cell ordering queue or replay-conflict handling needed.
- **Implementation:** largely React Query mutation `retry` + `retryDelay` (honoring `Retry-After`) on
  top of the existing mutation setup; the `pending` Cell state = mutation in retrying status.

**Ripples:** adds `pending` to the Cell state set; updates `ARCHITECTURE.md` §2/§6 (cell states + save
model) and §7 Phase 4 (now a decided, small piece rather than optional/TBD). Full offline composition
recorded as out of scope for this effort.

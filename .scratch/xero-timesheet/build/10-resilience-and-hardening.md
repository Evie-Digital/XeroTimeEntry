---
id: build-10
title: "Build: transient-failure resilience + conflict resolve + hardening"
mode: AFK
status: closed
assignee: implement-orchestrator
labels: [ready-for-agent]
blocked_by: [build-06, build-07]
blocks: []
---

## Parent PRD

[`spec-fast-time-entry-app.md`](../spec-fast-time-entry-app.md) · plan: [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) §5–§6

## What to build

Harden the write path and finish the edge cases. (1) **Resilience (ticket 0011):** on a write failure
(network / 5xx / a 429 outliving the initial retry) the Cell enters a **`pending`** state and
auto-retries with exponential backoff honoring `Retry-After`, resolving to `saved` or falling to
`error`; in-memory only (React Query mutation `retry`/`retryDelay`), so a reload while pending drops it.
(2) **Conflict resolution:** expand a `conflict` Cell to list its underlying Entries and delete extras
**down to one**, making the Slot editable again. (3) **Duration heuristic:** the bare-integer rule
(`≥16` → minutes, `<16` → hours) and remaining parser edge cases. (4) **Rate-limit respect:** client
backoff honoring Xero's limits (60/min, 5 concurrent) so bursts don't get throttled.

## Acceptance criteria

- [ ] A transient write failure shows the Cell as `pending` and auto-retries with backoff (honoring
      `Retry-After`), reaching `saved` on recovery or `error` when retries are exhausted (manual retry).
- [ ] A `conflict` Cell can be expanded to view its Entries and delete extras down to one; the Slot then
      becomes editable. An unresolved conflict blocks only its own Cell.
- [ ] A bare integer `≥ 16` (e.g. `90`) parses as minutes; `< 16` (e.g. `8`) as hours.
- [ ] Client requests back off on 429 and stay within Xero's concurrency limit.
- [ ] Tests (seam 2): failed write → `pending` → retry → `saved`/`error`; conflict resolve-down-to-one;
      `≥16` heuristic. (seam 1): 429 surfaces `retryAfter`; backoff honored.

## Blocked by

- Blocked by #build-06
- Blocked by #build-07

## User stories addressed

20, 36, 37, 41, 42, 43, 44

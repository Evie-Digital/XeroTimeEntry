---
id: build-04
title: "Build: read-only weekly grid (week load + render)"
mode: AFK
status: open
assignee:
labels: [ready-for-agent]
blocked_by: [build-03]
blocks: [build-05, build-09]
---

## Parent PRD

[`spec-fast-time-entry-app.md`](../spec-fast-time-entry-app.md) · plan: [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) §5–§6

## What to build

Open the app and see this week's logged time laid out in the grid — read-only for now. Build the
composed `GET /api/week?from&to` (full-scan fan-out of `GET /Projects/{id}/Time?userId&dateAfterUtc&
dateBeforeUtc` across all active projects, **≤ 5 concurrent**, merged) and the grid UI: Rows =
`Project · Task`, columns Mon–Sun, per-row/per-day/grand totals, today highlighted. Bucket Entries into
Slots by the **date portion of `dateUtc`** (never timezone-convert). Render `locked` (invoiced) and
`conflict` (2+ entries in a Slot) Cells read-only with their markers. No editing yet.

See ARCHITECTURE.md §2 (model), §6 (layout).

## Acceptance criteria

- [ ] `/api/week` fans out across all active projects, caps concurrency at ≤ 5, and merges entries for
      the requested date range and current `userId`.
- [ ] The grid renders Rows × Mon–Sun with correct per-row, per-day, and grand totals.
- [ ] Existing entries appear in the correct day Cell via UTC-date bucketing (no off-by-one).
- [ ] Invoiced entries render as `locked` (read-only, lock marker); Slots with 2+ entries render as
      `conflict` (read-only sum, `⋯` marker).
- [ ] Durations display as decimal hours; today's column is highlighted.
- [ ] Tests (seam 1): fan-out + concurrency cap + merge; date bucketing. (seam 2): grid renders rows,
      totals, and locked/conflict states from mocked `/api/week`.

## Blocked by

- Blocked by #build-03

## User stories addressed

8, 9, 10, 11, 34, 35, 45

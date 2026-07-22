---
id: build-05
title: "Build: create time from a cell (type → POST → saved)"
mode: AFK
status: closed
assignee: implement-orchestrator
labels: [ready-for-agent]
blocked_by: [build-04]
blocks: [build-06, build-07]
---

## Parent PRD

[`spec-fast-time-entry-app.md`](../spec-fast-time-entry-app.md) · plan: [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) §5–§6

## What to build

The first write: type hours into an empty Cell and have it stick in Xero. Build type-to-edit on a Cell,
the core **duration parser** (`1.5` / `1:30` / `:45` / `90m` / `1h30` / `1h` → integer minutes; Enter
commits), the `POST /api/timeentries` route (`{ userId, taskId, dateUtc, duration, description? }` →
`POST /Projects/{projectId}/Time`, `dateUtc = <localDate>T00:00:00Z`), optimistic Cell state
(`editing → saving → saved`), and the uniform error envelope surfacing `validation` per-Cell. Reload
shows the entry persisted. (Full format-heuristic edge cases + resilience land in #build-10.)

See ARCHITECTURE.md §2 (duration), §5 (error envelope), snippet §8.B.

## Acceptance criteria

- [ ] Typing in an empty Cell and pressing Enter creates a Xero entry via `POST /api/timeentries` and
      the Cell shows `saved`; a reload shows it persisted.
- [ ] The duration parser accepts `1.5`, `1:30`, `:45`, `90m`, `1h30`, `1h` → correct integer minutes.
- [ ] Invalid input puts the Cell in `error` and sends nothing.
- [ ] The write body carries the session `userId` and the Slot's `projectId`/`taskId`/`dateUtc`.
- [ ] A `validation` error from Xero surfaces on the originating Cell.
- [ ] Optimistic UI: Cell shows `saving` then `saved`; on failure it rolls back and shows `error`.
- [ ] Tests (seam 1): POST maps to `/Projects/{id}/Time` with correct body; 400 → `validation`
      envelope. (seam 2): type-commit shows saved; parser matrix via cell behavior; invalid → error.

## Blocked by

- Blocked by #build-04

## User stories addressed

14, 19, 21, 22, 26, 27

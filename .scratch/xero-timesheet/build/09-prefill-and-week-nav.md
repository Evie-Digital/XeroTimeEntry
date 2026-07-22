---
id: build-09
title: "Build: copy-last-week prefill + week navigation"
mode: AFK
status: open
assignee:
labels: [ready-for-agent]
blocked_by: [build-04, build-07]
blocks: []
---

## Parent PRD

[`spec-fast-time-entry-app.md`](../spec-fast-time-entry-app.md) · plan: [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) §6

## What to build

Stop rebuilding the grid every Monday, and let the user move between weeks. Add prev/next week
navigation (each week loads via `/api/week`). Implement **copy-last-week prefill (source A+B)**: a new
week opens pre-seeded with the distinct `(projectId, taskId)` Rows from the previous week's Entries
(a by-product of the week scan), augmented by a `localStorage` "recent rows" set so a Row added but not
yet logged still carries over. First week / no history → empty grid. No usage ranking. Demoable: open a
fresh week and see last week's rows, empty and ready.

## Acceptance criteria

- [ ] Prev/next controls navigate weeks; each week's entries load correctly (correct date range).
- [ ] A new week opens pre-seeded with last week's `(project, task)` Rows (Cells empty).
- [ ] A Row added but not logged is remembered via `localStorage` and carries into the seed.
- [ ] First week with no history opens empty; rows are addable manually.
- [ ] Seeding adds no duplicate Rows and applies no ranking (plain order).
- [ ] Tests (seam 2): fresh week seeds from prior week + localStorage; empty-history → empty; no dupes.

## Blocked by

- Blocked by #build-04
- Blocked by #build-07

## User stories addressed

31, 32, 38

---
id: build-03
title: "Build: active projects & tasks (routes + cache + picker)"
mode: AFK
status: closed
assignee: implement-orchestrator
labels: [ready-for-agent]
blocked_by: [build-02]
blocks: [build-04]
---

## Parent PRD

[`spec-fast-time-entry-app.md`](../spec-fast-time-entry-app.md) · plan: [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) §5–§6

## What to build

End-to-end read of your active projects and tasks. Build `GET /api/projects` (paginate
`GET /Projects?states=INPROGRESS`) and `GET /api/projects/{id}/tasks` (paginate, filter
`status==='ACTIVE'`), cache them client-side with React Query + `localStorage` (~10 min,
stale-while-revalidate) with a manual "refresh lists" action, and surface them in a minimal
list/typeahead so the data is visibly usable. This establishes the read path + caching that the grid
and add-row picker build on.

## Acceptance criteria

- [ ] `/api/projects` returns only active (`INPROGRESS`) projects, following pagination to `pageCount`.
- [ ] `/api/projects/{id}/tasks` returns only `ACTIVE` tasks (client-side filtered), paginated.
- [ ] Both are cached via React Query with `localStorage` persistence and ~10 min stale-while-revalidate.
- [ ] A manual "refresh lists" action invalidates and refetches.
- [ ] A minimal UI lists/filters active projects and their tasks (proves the data end-to-end).
- [ ] Tests (seam 1): pagination loop; active filters exclude archived/closed. (seam 2): picker shows
      cached active projects/tasks.

## Blocked by

- Blocked by #build-02

## User stories addressed

30, 39, 40

---
id: build-06
title: "Build: edit & delete entries (PUT / DELETE)"
mode: AFK
status: closed
assignee: implement-orchestrator
labels: [ready-for-agent]
blocked_by: [build-05]
blocks: [build-08, build-10]
---

## Parent PRD

[`spec-fast-time-entry-app.md`](../spec-fast-time-entry-app.md) · plan: [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) §2, §5

## What to build

Make saved Cells fully mutable. Changing a Cell's hours issues `PUT /api/timeentries/{id}`
(full-replace → `PUT /Projects/{projectId}/Time/{id}`); clearing a Cell (Backspace/Delete) issues
`DELETE /api/timeentries/{id}?projectId=`. Both are optimistic and update the totals live. Locked
(invoiced) Cells reject edit/delete with the existing read-only affordance. Demoable: edit a number →
Xero updates; clear it → Xero deletes.

## Acceptance criteria

- [ ] Editing a saved Cell's hours performs a full-replace `PUT` and shows `saved`; a reload reflects it.
- [ ] Clearing a saved Cell (Backspace/Delete) performs a `DELETE` and empties the Cell; a reload
      reflects the deletion.
- [ ] Attempting to edit/delete a `locked` Cell is prevented (no request sent) with a clear affordance.
- [ ] Row/day/grand totals update immediately and correctly on edit and delete.
- [ ] Tests (seam 1): PUT full-replace + DELETE map to the correct Xero URLs; writes to non-ACTIVE
      entries are not attempted. (seam 2): edit updates + persists; clear deletes; locked Cell refuses.

## Blocked by

- Blocked by #build-05

## User stories addressed

18, 33 (locked-cell behavior shared with 34)

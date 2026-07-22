---
id: 0005
title: "Decide: grid cell ↔ Xero time-entry domain model"
type: grilling
status: open
assignee:
blocked_by: [0001]
blocks: [0008, 0010]
---

## Question

How does a weekly-grid cell map to Xero's discrete time-entry records — the core domain model of the
whole app?

Xero stores each time entry as a discrete record (`projectId` + `taskId` + `userId` + `dateUtc` +
`duration` minutes). A grid **row** is a Project×Task pairing; a grid **cell** is that row on one day.
Decide:

- **Cell cardinality:** is a cell exactly one Xero entry, or the **sum** of possibly many entries for
  that Project/Task/Day? (People sometimes log the same task twice a day.)
- **Editing semantics:** when a user changes a cell from 2.0→2.5h, do we PUT the underlying entry,
  or (if update is unsupported per 0001) delete-and-recreate? What happens to a cell backed by
  multiple entries when edited?
- **Deleting semantics:** clearing a cell deletes which record(s)?
- **`dateUtc` / timezone:** does time-of-day matter, or do we normalise to date-only midnight? How do
  we avoid off-by-one-day errors across the user's local zone vs UTC?
- **New rows:** how a user adds a Project/Task row mid-week; what a blank row means.
- **`description` field:** required? Per-cell or per-row default?

**Depends on 0001** (whether native update/delete exist). Use `/domain-modeling` to name these
concepts precisely — they become the ubiquitous language for the grid and API.

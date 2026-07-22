---
id: 0005
title: "Decide: grid cell ↔ Xero time-entry domain model"
type: grilling
status: closed
assignee: gavin
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

## Resolution

Decided with the user (HITL). The core domain model of the app.

**Ubiquitous language:**
- **Slot** — a cell's identity `(projectId, taskId, localDate)`; grid invariant **≤ 1 Entry per Slot**.
- **Row** — a `(projectId, taskId)` pair across the week's 7 Slots.
- **Cell** — UI of a Slot: hours + optional note + state (`empty/saved/dirty/locked/conflict`).
- **Entry** — a Xero record `{ timeEntryId, duration(min), dateUtc, description, status }`.

**Cell cardinality:** ONE Entry per Cell (user confirmed: never splits a task across a day).

**Write semantics:**
- empty Slot + hours → **POST** `/Projects/{projectId}/Time`; persist returned `timeEntryId` on Cell.
- saved Slot, hours/note changed → **PUT** `.../Time/{timeEntryId}` (full-replace).
- saved Slot cleared → **DELETE** `.../Time/{timeEntryId}`.

**Duration:** canonical unit = **integer minutes** (round nearest, clamp 1–59940); UI shows hours;
`0`/blank ≡ no entry. Accepted input *formats* deferred to grid prototype (0008).

**Date/timezone (off-by-one killer):** grid works in **pure calendar dates, never converts zones**.
- week = the 7 calendar dates Mon–Sun; each column is a literal `localDate`.
- write: `dateUtc = <localDate>T00:00:00Z` (constant time component we own).
- read/bucket: Entry → Slot whose date = the **date portion of its `dateUtc`**, taken verbatim (no
  `toLocalTime`). Writes+reads both key off the UTC date substring → no drift for grid-created entries.
  Residual edge: entries created elsewhere with an odd-zone `dateUtc` show on their carried UTC date,
  surfaced honestly, never silently moved.

**description:** nullable per-Entry, edited per Cell; empty ≡ omitted. (Optional per-cell note UX.)

**Awkward-reality cases (model refuses to lie/clobber):**
- **Slot already holds 2+ Xero entries** (made in Xero UI/mobile): Cell = **sum, read-only, `conflict`
  marker**; edits blocked until resolved. Grid NEVER creates a 2nd entry in a Slot. Resolve/expand
  interaction is a UX question → owned by grid prototype (0008).
- **Invoiced/locked Entry** (per 0001): Cell read-only with lock marker; PUT/DELETE disabled.

**Rows & blanks:** add Row = pick Project→Task via typeahead → UI-only Row of 7 empty Slots. A Row/Slot
with no hours is a **draft** — nothing POSTed until a value is entered. Discarding an all-empty Row
drops the UI row; removing a Row with saved Entries prompts to DELETE them.

**Explicitly out of this ticket (→ prototype 0008):** exact duration input formats; the
resolve-conflict / expand-slot interaction.

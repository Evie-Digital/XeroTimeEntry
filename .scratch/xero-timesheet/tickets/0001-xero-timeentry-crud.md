---
id: 0001
title: "Research: Xero Projects time-entry CRUD support & payload shapes"
type: research
status: in-progress
assignee: gavin
blocked_by: []
blocks: [0005, 0010]
---

## Question

Does Xero Projects API v2.0 support the full lifecycle of an individual time entry, and what are
the exact contracts? Specifically:

- Is there `GET /projects/{projectId}/timeentries` (list, with date filtering)? What query params
  filter by date range and/or user? Response shape and pagination.
- Is there `GET /projects/{projectId}/time/{timeEntryId}` (single)?
- Is there **`PUT`/update** and **`DELETE`** on an individual time entry? Exact URL, method, payload,
  status codes. (The user's brief only listed `POST` — confirm whether edit/delete exist natively or
  whether "edit" must be delete-and-recreate.)
- The `POST` create contract: required vs optional fields, `duration` (minutes) bounds, `dateUtc`
  semantics (does time-of-day matter, or is only the date used?), `description` requirements.
- What determines a time entry's status (e.g. locked once invoiced?) and can locked entries be
  edited/deleted?

**Why it gates the map:** the grid does read+edit+delete. If update/delete are absent or restricted,
the grid↔entry model (ticket 0005) must be built around delete-and-recreate, and the API layer
changes. This is the highest-leverage unknown.

**Capture findings to:** `research/xero-timeentry-crud.md`

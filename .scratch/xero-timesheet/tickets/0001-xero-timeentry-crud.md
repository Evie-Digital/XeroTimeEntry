---
id: 0001
title: "Research: Xero Projects time-entry CRUD support & payload shapes"
type: research
status: closed
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

## Resolution

Findings: [`research/xero-timeentry-crud.md`](../research/xero-timeentry-crud.md). **Native CRUD is
fully supported — editing does NOT require delete-and-recreate.**

- **Endpoint is `/Projects/{projectId}/Time`** (capital `Time`), NOT `/timeentries` as the brief
  assumed. ⚠️ correction to propagate through the API layer + snippets.
- **List:** `GET /Projects/{projectId}/Time` — filters `userId`, `dateAfterUtc`/`dateBeforeUtc` (on
  `dateUtc`), `taskId`, `invoiceId`, `contactId`, `states`, `isChargeable`; page/pageSize pagination,
  returns `pagination` + `items[]`.
- **Read one:** `GET .../Time/{timeEntryId}`.
- **Create:** `POST .../Time` — required `userId`, `taskId`, `dateUtc`, `duration` (integer minutes,
  **1–59940**); optional `description`; returns `200` + new entry (`ACTIVE`).
- **Update:** `PUT .../Time/{timeEntryId}` — full-replace body, returns `204`.
- **Delete:** `DELETE .../Time/{timeEntryId}` — returns `204`.
- **Locking:** entries go `ACTIVE` → `LOCKED` (transient) → `INVOICED` when invoiced; **update/delete
  are rejected once not `ACTIVE`**. The grid must treat invoiced/locked cells as read-only.
- `dateUtc` is a full ISO-8601 UTC datetime but effectively **day-granular** in practice (the one point
  not definitively pinned from primary docs — carry into the 0005 timezone decision).

_Sourcing: field-level contract from Xero's official OpenAPI spec `xero-projects.yaml` v16.1.0
(XeroAPI GitHub) — primary; the docs SPA timed out on fetch but its section headers confirm the verbs._

# Xero time-entry CRUD — research findings

**BOTTOM LINE — can we edit/delete natively? YES.** The Xero Projects API v2.0 provides first-class native update and delete on individual time entries: `PUT /Projects/{projectId}/Time/{timeEntryId}` (full replace, returns `204 No Content`) and `DELETE /Projects/{projectId}/Time/{timeEntryId}` (returns `204 No Content`). Delete-and-recreate is NOT required for ordinary (`ACTIVE`) entries. The one caveat is status/locking: an entry that is `LOCKED` (transient, e.g. being invoiced) or `INVOICED` cannot be updated or deleted — those attempts fail. So native CRUD is fully supported, but only while an entry is in the `ACTIVE` state.

Base URL for all endpoints below: `https://api.xero.com/projects.xro/2.0`. All requests require the `Xero-Tenant-Id` header. Scopes: `projects` (read-write) for POST/PUT/DELETE; `projects` or `projects.read` for GET. Write calls also accept an optional `Idempotency-Key` header (128 char max). Source of record: Xero's official OpenAPI spec `xero-projects.yaml` (v16.1.0) and the developer.xero.com Projects API "Time" reference.

---

## 1. List time entries — `GET /Projects/{projectId}/Time`

- **Method / URL:** `GET https://api.xero.com/projects.xro/2.0/Projects/{projectId}/Time`
- **Yes, this exists.** The path segment is `/Time` (capitalized), not `/timeentries`. It lists all time entries for one project. `projectId` (UUID) is a required path parameter.
- **Query parameters (all optional filters):**
  - `userId` (UUID) — **filter by the Xero user who logged time.** (Yes, user filtering is supported.)
  - `taskId` (UUID) — time entries logged against a specific task.
  - `invoiceId` (UUID) — all time entries for an invoice.
  - `contactId` (UUID) — all time entries for a contact.
  - `dateAfterUtc` (ISO-8601 UTC date-time) — **date-range lower bound**; finds entries on/after this date, filtered on the `dateUtc` field.
  - `dateBeforeUtc` (ISO-8601 UTC date-time) — **date-range upper bound**; finds entries on/before this date, filtered on the `dateUtc` field.
  - `states` — comma-separated list of statuses to match (e.g. `ACTIVE`, `LOCKED`, `INVOICED`).
  - `isChargeable` (boolean) — entries relating to tasks with charge type `TIME` or `FIXED`.
  - `page` (integer, default 1, must be > 0) — pagination.
  - `pageSize` (integer, default 50, range 1–500) — pagination.
- **Response shape (`200`):** JSON object with a `pagination` object and an `items` array of time-entry objects:
  ```json
  {
    "pagination": { "page": 1, "pageSize": 50, "pageCount": 1, "itemCount": 9 },
    "items": [
      {
        "timeEntryId": "3cd35eca-704f-4bca-b258-236028ae8ed1",
        "userId": "740add2a-a703-4b8a-a670-1093919c2040",
        "projectId": "b021e7cb-1903-4292-b48b-5b27b4271e3e",
        "taskId": "7be77337-feec-4458-bb1b-dbaa5a4aafce",
        "dateUtc": "2020-02-27T15:00:00Z",
        "dateEnteredUtc": "2020-02-28T03:24:29.2215641Z",
        "duration": 45,
        "description": "My description",
        "status": "ACTIVE"
      }
    ]
  }
  ```
- **Pagination model:** page-number based via `page` + `pageSize`; response `pagination` block gives `page`, `pageSize`, `pageCount`, `itemCount`. Default page size 50, max 500.

## 2. Get a single time entry — `GET /Projects/{projectId}/Time/{timeEntryId}`

- **Yes.** Exact URL: `GET https://api.xero.com/projects.xro/2.0/Projects/{projectId}/Time/{timeEntryId}`
- Both `projectId` and `timeEntryId` are required UUID path params. Returns one `TimeEntry` object (same shape as an `items` element above) with `200`.

## 3. Update (PUT) and Delete (DELETE) — both exist natively

**Update — `PUT /Projects/{projectId}/Time/{timeEntryId}`**
- **Method / URL:** `PUT https://api.xero.com/projects.xro/2.0/Projects/{projectId}/Time/{timeEntryId}`
- **Payload:** a `TimeEntryCreateOrUpdate` object (same contract as create) — required `userId`, `taskId`, `dateUtc`, `duration`; optional `description`. Note this is a **full replace**: per the spec, `description` "will be set to null if not provided during update," so you must resend all fields you want to keep.
  ```json
  { "userId": "...", "taskId": "...", "dateUtc": "2020-02-27T15:00:00Z", "duration": 45, "description": "My UPDATED description" }
  ```
- **Success status:** `204 No Content` (no body returned). Validation failure: `400`.

**Delete — `DELETE /Projects/{projectId}/Time/{timeEntryId}`**
- **Method / URL:** `DELETE https://api.xero.com/projects.xro/2.0/Projects/{projectId}/Time/{timeEntryId}`
- No request body. **Success status:** `204 No Content`. Failure: `400`.

**Definitive answer:** Native update and delete DO exist. Editing does NOT have to be done via delete-and-recreate for `ACTIVE` entries. (Delete-and-recreate is only a workaround you'd consider for `LOCKED`/`INVOICED` entries, which cannot be mutated at all — see section 5.)

## 4. Create (POST) contract — `POST /Projects/{projectId}/Time`

- **Method / URL:** `POST https://api.xero.com/projects.xro/2.0/Projects/{projectId}/Time`
- **Request body (`TimeEntryCreateOrUpdate`):**

  | Field | Required? | Type | Notes |
  |-------|-----------|------|-------|
  | `userId` | **Required** | UUID | Xero user who logged the time |
  | `taskId` | **Required** | UUID | Task the entry is logged against |
  | `dateUtc` | **Required** | ISO-8601 date-time (UTC) | Date the time is logged on |
  | `duration` | **Required** | integer | Minutes; **between 1 and 59940 inclusive** (59940 min = 999 hours) |
  | `description` | Optional | string | Optional; if omitted on update it is set to `null` |

  Note: `projectId` comes from the URL path, not the body. `status`, `timeEntryId`, `projectId`, and `dateEnteredUtc` are server-assigned/read-only response fields.
- **Exact JSON body example:**
  ```json
  {
    "userId": "00000000-0000-0000-0000-000000000000",
    "taskId": "00000000-0000-0000-0000-000000000000",
    "dateUtc": "2020-02-26T15:00:00Z",
    "duration": 30,
    "description": "My description"
  }
  ```
- **Success:** `200 OK` returning the newly created `TimeEntry` (includes generated `timeEntryId`, `dateEnteredUtc`, and `status: ACTIVE`). Validation failure: `400`.
- **`duration` units/bounds:** integer **minutes**, min 1, max 59940 inclusive.
- **`description` requirements:** optional free-text string; no documented length constraint in the spec. On PUT, omitting it nulls it out.
- **`dateUtc` semantics:** typed as ISO-8601 UTC `date-time` — "the date time that time entry is logged on." All Xero examples include a time-of-day component (e.g. `2020-02-27T15:00:00Z`), and the value round-trips in responses. However, the Projects product tracks time at day granularity, so in practice the **calendar date is what drives behaviour** (the `dateAfterUtc`/`dateBeforeUtc` filters match on `dateUtc`). CAVEAT / not fully pinned down from the spec alone: the spec does not explicitly state that time-of-day is ignored. Treat time-of-day as stored but not semantically meaningful; if exact behaviour matters, verify empirically. A well-formed full ISO-8601 UTC datetime string is required regardless.

## 5. Status / locking

- `status` enum on a time entry: **`ACTIVE`**, **`LOCKED`**, **`INVOICED`**.
  - New entries are created as `ACTIVE`.
  - `LOCKED` is a transient state indicating the entry "is currently changing state (for example being invoiced)." Per the spec: **"Updates are not allowed when in this state."**
  - `INVOICED` — the entry has been invoiced.
- **What locks an entry:** being invoiced (or in the process of being invoiced). Once a time entry is attached to an invoice it moves to `INVOICED` (via a transient `LOCKED` window).
- **Can locked/invoiced entries be edited or deleted? No.** Updates are explicitly disallowed for `LOCKED`; `INVOICED` entries are effectively immutable through the API. Mutating attempts return errors rather than succeeding. So the "edit natively" capability applies only while an entry is `ACTIVE`. There is no native transition to un-invoice via this endpoint — you'd remove/void the invoice in the Accounting side first.

---

## Sources
- Xero Projects API — Time reference (primary): https://developer.xero.com/documentation/api/projects/time
- Xero Projects API — Time (canonical externalDocs target): https://developer.xero.com/documentation/projects/time
- Xero Projects API — Overview: https://developer.xero.com/documentation/api/projects/overview
- Xero official OpenAPI spec `xero-projects.yaml` (v16.1.0, Xero's own GitHub repo — primary/authoritative machine-readable contract used for the exact schemas, required fields, duration bounds, status enum, and status codes): https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-projects.yaml

_Note on sourcing: developer.xero.com HTML pages rendered as a JS SPA and repeatedly timed out via automated fetch; the page's own section headers (GET/POST/PUT/DELETE time) were confirmed. The exact field-level contract above was taken from Xero's official OpenAPI YAML in the XeroAPI GitHub organisation, which is a primary Xero-published source (not a third-party/blog), and whose schemas link back to the developer.xero.com Time docs via externalDocs._

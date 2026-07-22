# Xero rate limits, pagination & filtering — research findings

## BOTTOM LINE
- **Rate limits (per connected tenant unless noted):** 60 calls/minute per tenant, 5,000 calls/day per tenant, **5 concurrent** calls in progress, and **10,000 calls/minute per app** across ALL its connected tenants. These platform-wide limits apply to Projects endpoints too (Projects has no separate quota).
- **429 handling:** Xero returns HTTP 429 with a **`Retry-After`** header (seconds to wait) and an **`X-Rate-Limit-Problem`** header naming which limit was hit. Every response carries **`X-DayLimit-Remaining`**, **`X-MinLimit-Remaining`**, **`X-AppMinLimit-Remaining`**.
- **Active-filter param (projects):** `GET /Projects?states=INPROGRESS` returns only open/active projects (the only alternative value is `CLOSED`). For tasks there is NO `states` query param — filter client-side on the task `status` field (`ACTIVE` vs `INVOICED`/`LOCKED`).
- **Pagination (Projects API):** `page` (default 1) and `pageSize` (default **50**, range **1–500**) on both `GET /Projects` and `GET /Projects/{projectId}/Tasks`. Response includes a `pagination` object (`page`, `pageSize`, `pageCount`, `itemCount`) — last page is when `page == pageCount` (or returned items < pageSize).

---

## 1. Rate limits (exact numbers)
Source: Xero OAuth 2.0 API limits / Rate Limits pages.

| Limit | Value | Scope |
|---|---|---|
| Concurrent | **5** calls in progress at once | per tenant connection |
| Minute (tenant) | **60** calls / minute | per tenant |
| Daily | **5,000** calls / day | per tenant |
| App minute | **10,000** calls / minute | per app, summed across all connected tenants |

- These are the standard OAuth 2.0 limits. **The Projects API is subject to the same platform-wide limits** — there is no Projects-specific quota; all endpoints (Accounting, Projects, etc.) draw on the same per-tenant minute/day counters and the app-wide minute counter.
- Partner apps can request a higher daily limit via the Xero Partner Program, but 5,000/day + 60/min + 5 concurrent are the defaults.

## 2. 429 handling & quota headers
- Exceeding the daily OR minute limit → **HTTP 429 "Too Many Requests"**.
- **`Retry-After`** header IS returned on 429 — value is the number of **seconds** to wait before retrying. Recommended: honor it verbatim (do not retry sooner).
- **`X-Rate-Limit-Problem`** header on the 429 names the breached limit (e.g. `minute`, `daily`, or the app-minute limit).
- Quota-remaining headers present on **every** response:
  - **`X-DayLimit-Remaining`** — calls left against the 5,000/day tenant limit.
  - **`X-MinLimit-Remaining`** — calls left against the 60/min tenant limit.
  - **`X-AppMinLimit-Remaining`** — calls left against the 10,000/min app-wide limit.
  - Documented example (minute limit breached): `X-AppMinLimit-Remaining: 9929`, `X-MinLimit-Remaining: 0`, `X-DayLimit-Remaining: 4531`.
- **Recommended backoff strategy:**
  1. On 429, read `Retry-After` and sleep that many seconds, then retry.
  2. Proactively throttle using `X-MinLimit-Remaining` / `X-AppMinLimit-Remaining` — slow down as they approach 0 rather than blindly hitting 429.
  3. Keep in-flight requests ≤ 5 (concurrent limit) to avoid concurrency 429s.
  4. Use exponential backoff with jitter as a fallback if `Retry-After` is absent, and cap daily volume against `X-DayLimit-Remaining`.

## 3. Pagination — Projects API
Source: official XeroAPI OpenAPI spec (`xero-projects.yaml`) — the Projects reference.

`GET /Projects` query params:
- `page` — integer, default **1**, must be > 0.
- `pageSize` — integer, default **50**, range **1–500**.
- (also `projectIds`, `contactID`, `states`.)

`GET /Projects/{projectId}/Tasks` query params:
- `page` — integer, must be > 0 (default 1).
- `pageSize` — integer, range **1–500** (default 50).
- (also `taskIds`, `chargeType`.)

**Pagination metadata shape** — responses include a `pagination` object:
```
"pagination": {
  "page": 1,        // current page
  "pageSize": 50,   // items per page requested
  "pageCount": 3,   // total number of pages available
  "itemCount": 148  // total number of items
}
```
- **Detect last page:** `page >= pageCount`, or equivalently the number of items in the current response is less than `pageSize`.
- NOTE / discrepancy: Xero's generic "Paging" best-practices page (aimed at the Accounting API) cites default 100 / max 1000. For the **Projects API specifically** the authoritative OpenAPI spec says **default 50, max 500** — use the Projects numbers for Projects endpoints.

## 4. Active filtering (non-archived / non-closed)
- **Projects:** use the **`states`** query parameter. Allowed values come from the `ProjectStatus` enum: **`INPROGRESS`** and **`CLOSED`**. To fetch only active projects:
  `GET /Projects?states=INPROGRESS`
  (Omitting `states` returns all projects regardless of status.)
- **Tasks:** there is **no `states`/status query parameter** on `GET /Projects/{projectId}/Tasks`. The task `status` field enum is **`ACTIVE`**, **`INVOICED`**, **`LOCKED`**. Filter **client-side** on `status == "ACTIVE"` to exclude invoiced/locked tasks. (Tasks also have a `chargeType` — `TIME`, `FIXED`, `NON_CHARGEABLE` — which is a separate filterable query param but is about billing type, not active/archived state.)

## 5. Latency traits relevant to cache TTL
- Xero enforces the 60/min + 5-concurrent limits, so aggressive polling is self-defeating — a client cache reduces 429 risk more than it saves latency.
- Projects/task metadata (project list, task definitions, statuses) changes infrequently relative to time entries, so a **client cache TTL on the order of several minutes (e.g. 5–15 min) for the active-project and task lists** is reasonable and stays well within the daily/minute budgets. Cache the `states=INPROGRESS` project list and per-project ACTIVE task lists; invalidate on user-driven writes.
- Watch `X-DayLimit-Remaining` to right-size TTL for large tenants: with 5,000 calls/day, unbounded per-page refreshes across many projects can exhaust the daily budget, so longer TTLs are safer at scale.

## Sources
- OAuth 2.0 API limits — https://developer.xero.com/documentation/guides/oauth2/limits/
- Rate Limits (best practices) — https://developer.xero.com/documentation/best-practices/api-call-efficiencies/rate-limits
- Limits FAQ — https://developer.xero.com/faq/limits
- Projects API — Projects reference — https://developer.xero.com/documentation/api/projects/projects
- Projects API — Tasks reference — https://developer.xero.com/documentation/api/projects/tasks
- Projects API — Overview — https://developer.xero.com/documentation/api/projects/overview
- Official OpenAPI spec (XeroAPI) — https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-projects.yaml (raw: https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/master/xero-projects.yaml)
- Paging (best practices, general/Accounting) — https://developer.xero.com/documentation/best-practices/api-call-efficiencies/paging

### Primary-source notes
- Rate-limit numbers and 429/header details: PRIMARY (developer.xero.com limits & rate-limits pages).
- Projects pagination params, `states` enum, task `status` enum: taken from the **official XeroAPI OpenAPI spec** in Xero's own GitHub repo — authoritative but a spec artifact rather than the rendered reference page. The developer.xero.com Projects/Tasks reference pages timed out on automated fetch, so the OpenAPI YAML (Xero-owned) is the primary basis; values are consistent with the reference-page section headings seen in search. Non-primary fallback: none required.

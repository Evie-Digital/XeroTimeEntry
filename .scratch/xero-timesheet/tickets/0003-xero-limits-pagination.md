---
id: 0003
title: "Research: Xero API rate limits, 429 handling, pagination & active-filtering"
type: research
status: closed
assignee: gavin
blocked_by: []
blocks: [0007, 0009]
---

## Question

What operational limits and list-shaping behaviour must the API layer and caching strategy respect?

- **Rate limits:** Xero's per-app and per-tenant limits (per-minute, daily, concurrent). Exact
  numbers and which apply to Projects endpoints.
- **429 handling:** does Xero return `Retry-After`? What headers report remaining quota
  (`X-Rate-Limit-*`, `X-DayLimit-Remaining`, etc.)? Recommended backoff.
- **Pagination:** how `GET /projects` and `GET /projects/{id}/tasks` paginate (page/pageSize params,
  default page size, how to detect the last page). Any max page size.
- **Active filtering:** how to fetch only **active** projects and tasks (a `states`/`status` filter?
  a `ProjectsWithEstimate`/status field to filter client-side?). We don't want archived/closed noise
  in the pickers.
- Any notable latency characteristics worth knowing for the caching TTL decision.

**Why it gates the map:** shapes the client caching + active-filter strategy (0007) and the API
abstraction layer's error/backoff envelope (0009).

**Capture findings to:** `research/xero-limits-pagination.md`

## Resolution

Findings: [`research/xero-limits-pagination.md`](../research/xero-limits-pagination.md).

- **Rate limits (platform-wide, govern Projects too — no Projects-specific quota):** 60 calls/min
  and 5,000 calls/day **per tenant**, **5 concurrent** calls, plus a 10,000 calls/min app-wide ceiling.
- **429 handling:** returns HTTP 429 with `Retry-After` (seconds) + `X-Rate-Limit-Problem` naming the
  breached limit. Every response carries `X-DayLimit-Remaining`, `X-MinLimit-Remaining`,
  `X-AppMinLimit-Remaining` → throttle proactively.
- **Pagination:** `page` (default 1) + `pageSize` (default 50, range 1–500) on `GET /Projects` and
  `GET /Projects/{id}/Tasks`; response has a `pagination` object (`page,pageSize,pageCount,itemCount`);
  last page = `page >= pageCount`.
- **Active filtering:** projects support `states=INPROGRESS` (vs `CLOSED`). **Tasks have NO status
  query param** — filter client-side on task `status` (`ACTIVE` vs `INVOICED`/`LOCKED`).
- **Cache TTL guidance:** 5–15 min for project/task lists (tight minute/concurrency limits + rarely-
  changing metadata).

_Caveat: pagination/`states`/task-status enums come from Xero's official OpenAPI spec on GitHub — the
rendered Projects reference pages timed out on automated fetch. Still primary source._

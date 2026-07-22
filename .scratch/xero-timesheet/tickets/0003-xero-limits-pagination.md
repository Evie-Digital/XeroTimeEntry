---
id: 0003
title: "Research: Xero API rate limits, 429 handling, pagination & active-filtering"
type: research
status: in-progress
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

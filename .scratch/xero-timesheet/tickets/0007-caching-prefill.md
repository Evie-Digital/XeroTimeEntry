---
id: 0007
title: "Decide: client caching, active-filtering & recent/frequent prefill"
type: grilling
status: open
assignee:
blocked_by: [0003, 0004]
blocks: [0010]
---

## Question

How do Projects/Tasks/Users get cached and prefilled so the UI is instant and we don't spam Xero?

- **Cache mechanism:** React Query / SWR in the browser + `localStorage` persistence? What's cached
  (projects list, per-project tasks, the resolved userId) and at what **TTL** (informed by 0003
  limits and how often the data changes)?
- **Fetch strategy:** eager-load all active projects on app open, lazy-load tasks per project on
  first pick? How the "active only" filter from 0003 is applied.
- **Invalidation:** manual refresh button vs background revalidation; how stale a picker may be.
- **Recent/frequent prefill:** what signal ranks "projects/tasks I use most" — recency, frequency,
  or last-week's rows? Where is this preference stored (localStorage) and how many rows prefill a new
  week's grid? (Note: exact ranking algorithm may stay in *Not yet specified* until this frames it.)
- **userId caching:** resolve once (per 0004) and cache, with what invalidation.

**Depends on 0003 and 0004.**

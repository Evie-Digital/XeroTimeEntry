---
id: 0007
title: "Decide: client caching, active-filtering & recent/frequent prefill"
type: grilling
status: closed
assignee: gavin
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

## Resolution

Decided with the user (HITL).

**Cache mechanism:** **React Query (TanStack)** in the browser for all reads (via our API routes),
with `localStorage` persistence so pickers are warm on a fresh start. `userId` + `tenantId` live in
the **server session memory** (per 0006), resolved once per session — not client-persisted.

**Cached data & TTL:**
- **Active projects** + **per-project active tasks** — TTL ~10 min (within Xero's 5–15 min guidance),
  **stale-while-revalidate**, plus a manual "refresh lists" action.
- **The week's time entries** — fetched per visited week (`GET /Projects/{id}/Time` with `userId` +
  `dateAfterUtc`/`dateBeforeUtc`), keyed by week, **invalidated on every POST/PUT/DELETE** so the grid
  reflects edits. Short/no TTL — it's the live editing surface.

**Active filtering (per 0003):** projects `GET /Projects?states=INPROGRESS` (paginate to `pageCount`);
tasks have no status param → fetch and **filter client-side to `status === 'ACTIVE'`**.

**Prefill = copy last week (source A+B):**
- **A (primary):** seed a new week from the distinct `(projectId, taskId)` pairs in the user's
  **previous week's Xero entries** — self-maintaining, portable across browsers, survives a
  localStorage wipe.
- **B (augment):** a `localStorage` "recent rows" set carries rows added-but-not-yet-logged so a
  just-added empty row isn't forgotten mid-week / into next week.
- First week / no history → empty grid, add rows manually.
- **No usage ranking** (user chose the no-ranking option): the add-row picker is a **plain typeahead**
  over active projects→tasks in API/alpha order. ⇒ the "frequent projects/tasks ranking" fog item is
  dropped — consciously decided against, not deferred.

**userId caching:** resolved once per session in server memory (per 0004/0006); no client persistence.

**Ripples:** graduated the offline/draft fog into its own optional ticket now that the cache infra
(React Query + localStorage) is fixed — the sharp question is queue-and-replay vs fail-loud when Xero
is unreachable. Feeds the frontend architecture section of 0010.

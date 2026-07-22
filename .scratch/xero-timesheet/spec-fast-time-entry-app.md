---
type: spec
labels: [ready-for-agent]
title: "Fast Xero Projects weekly time-entry app"
source: ARCHITECTURE.md + wayfinder map (.scratch/xero-timesheet/)
tracker: local-markdown
---

# Spec — Fast Xero Projects weekly time-entry app

> Synthesised from the wayfinder decision map (tickets 0001–0011) and [`ARCHITECTURE.md`](../../ARCHITECTURE.md).
> Ubiquitous language (**Entry / Slot / Row / Cell**) is defined in ARCHITECTURE.md §2 and used throughout.

## Problem Statement

Logging time in the native Xero Projects UI is slow and clunky. As a single user who bills time
against multiple projects and tasks, I have to click through separate screens for every entry, my hands
leave the keyboard constantly, and there's no fast weekly overview where I can see and fill a whole
week at once. Entering a week of time takes far longer than the time actually being logged.

## Solution

A lightweight, local-only web app (runs on my own machine) that presents my week as a single
**keyboard-driven grid**: rows are Project · Task, columns are Mon–Sun. I log in to Xero once a week,
the grid loads my existing entries for the week, and I fill, edit, or clear cells entirely from the
keyboard — every cell saving to Xero the instant I commit it. It remembers the rows I worked on last
week so I rarely rebuild them, accepts hours in whatever format I type, and lets me attach an optional
description inline. It never gets in my way: rate limits, token refresh, and transient failures are
handled for me.

## User Stories

1. As a solo Xero Projects user, I want to open the app on `localhost` and reach my timesheet in one step, so that I can start logging without ceremony.
2. As a user, I want to authenticate with my own Xero login via OAuth, so that the app acts as me without me sharing credentials with it.
3. As a user, I want to log in only about once a week (per running session), so that I'm not re-authenticating constantly.
4. As a user, I want the app to keep me signed in throughout a session by silently refreshing my access token, so that I never get kicked out mid-entry.
5. As a security-conscious user, I want my Xero refresh token held only in the running server's memory and discarded when I stop the app, so that no long-lived credential sits on disk.
6. As a user, I want the app to figure out which Xero organisation and which Projects user I am automatically, so that I don't have to configure IDs by hand.
7. As a user whose Xero account has no Projects access, I want a clear message rather than silent failure, so that I understand why I can't log time.
8. As a user, I want to see my week as a grid of Project · Task rows against Mon–Sun columns, so that I can grasp and fill my whole week at a glance.
9. As a user, I want today's column highlighted, so that I can orient quickly.
10. As a user, I want per-row totals, per-day totals, and a grand total, so that I can sanity-check my week as I go.
11. As a user, I want the grid to load the time I've already logged for the week (from anywhere, including the Xero UI), so that I see a true and complete picture.
12. As a user, I want to move between cells with the arrow keys, so that I can navigate without the mouse.
13. As a user, I want Tab / Shift+Tab to move right / left and wrap across rows, so that I can sweep through cells linearly.
14. As a user, I want to start typing a number to edit a cell immediately (no separate "enter edit mode" step), so that entry is instant.
15. As a user, I want Enter to save the cell and move down, so that I can quickly fill one task across the week.
16. As a user, I want Tab to save the cell and move right, so that I can quickly fill one day across projects.
17. As a user, I want Esc to cancel an in-progress edit and revert the cell, so that I can back out of a mistake.
18. As a user, I want Backspace/Delete on a committed cell to clear it (deleting the underlying Xero entry), so that removing time is one keystroke.
19. As a user, I want to type hours in several formats — `1.5`, `1:30`, `:45`, `90m`, `1h30`, `1h` — so that I can enter time however feels natural.
20. As a user, I want a bare number like `90` interpreted sensibly (≥16 as minutes, `8` as hours), so that shorthand does what I expect.
21. As a user, I want cells to render back as decimal hours, so that the grid reads consistently.
22. As a user, I want invalid input flagged in the cell rather than silently sent, so that I don't post garbage to Xero.
23. As a user, I want to add an optional description to an entry inline while typing (`2.5 // fixed the auth bug`), so that I can capture a note without a second step.
24. As a user, I want to double-click a cell (or press ⌥Enter) to open a description editor, so that there's a discoverable way to add/edit a note.
25. As a user, I want a cell that has a note to show a small indicator, so that I can see at a glance where notes exist.
26. As a user, I want each cell to save to Xero the moment I commit it, so that there's no separate "submit" step and nothing is lost.
27. As a user, I want a visible sync status (saving / saved), so that I trust my time is recorded.
28. As a user, I want to add a Project · Task row via a fast typeahead (⌘/Ctrl+K), so that I can bring in new work without leaving the keyboard.
29. As a user, I want the add-row picker to mark rows I've already added, so that I don't duplicate them.
30. As a user, I want the picker to show only my active projects and tasks, so that archived/closed noise doesn't clutter it.
31. As a user, I want a new week to open pre-seeded with the rows I used last week (empty cells), so that I rarely rebuild my grid.
32. As a user, I want a row I add but haven't logged against yet to be remembered, so that it isn't forgotten mid-week.
33. As a user, I want to edit an existing entry's hours or note in place, so that corrections are as fast as new entries.
34. As a user, I want an invoiced/locked entry shown read-only with a lock indicator, so that I understand why I can't change it.
35. As a user, I want a slot that already has 2+ Xero entries shown as a read-only sum with a marker, so that the grid never silently overwrites time logged elsewhere.
36. As a user, I want to expand such a conflict cell and delete extra entries down to one, so that I can make it editable when I choose.
37. As a user, I want an unresolved conflict to block only its own cell, so that it never holds up logging elsewhere.
38. As a user, I want to move between weeks, so that I can review or backfill other weeks.
39. As a user, I want my project/task lists cached so pickers are instant, so that the UI never feels laggy.
40. As a user, I want a manual "refresh lists" action, so that I can pull in newly-created projects/tasks when needed.
41. As a user, I want a failed save to auto-retry through transient blips, 429s, and 5xx, so that a flaky moment doesn't cost me a re-type.
42. As a user, I want a cell that's retrying shown in a distinct "pending" state, so that I can tell it apart from a settled save.
43. As a user, I want a save that ultimately fails to land in an error state I can retry, so that I'm never left unsure whether it saved.
44. As a user, I want the app to respect Xero's rate limits, so that I don't get throttled or blocked.
45. As a user, I want dates handled so a Monday cell always lands on Monday regardless of timezone, so that my time never lands on the wrong day.
46. As a user, I want the client secret to stay on the server and never reach my browser, so that the app is safe to run.

## Implementation Decisions

**Stack & shape.** Next.js (App Router) + TypeScript + Tailwind. Server-side API routes proxy Xero
(client secret + tokens stay server-side). Client state via TanStack Query (React Query) with
`localStorage` persistence. No database; the only persisted secret is the Xero client secret in
`.env.local`. Single user, local-only (`npm run dev`).

**Domain model (module: grid state).** One **Entry** per **Cell**. A **Slot** is `(projectId, taskId,
localDate)` and maps to ≤ 1 Entry. Cell states: `empty / editing / saving / pending / saved / error /
locked / conflict`. Canonical duration unit is **integer minutes** (1–59940); UI shows decimal hours.

**Date handling (decision — prevents off-by-one).** The grid works in pure calendar dates and never
timezone-converts. Write `dateUtc = <localDate>T00:00:00Z`; on read, bucket an Entry into the Slot
whose date equals the **date portion of its `dateUtc`**, taken verbatim.

**Duration parsing (module: duration parser; from the grid prototype).** Accepts the format matrix
below; decision-rich core:

```
"" | "0"        → 0 (clear)
"1h30" / "1h"   → hours*60 + mins
"1:30" / ":45"  → hours*60 + mins
"90m"           → minutes
"1.5" / "90"    → decimal hours, UNLESS a bare integer ≥ 16 (and no "h") → minutes
otherwise       → invalid (cell → error, nothing sent)
```

**OAuth & tokens (module: Xero session).** Standard Authorization Code + confidential secret (not
PKCE). Scopes `openid profile email projects offline_access`. Redirect `http://localhost:3000/api/xero/
callback` (exact, no wildcards, not `127.0.0.1`). Tokens held in an in-memory session `{ accessToken,
accessTokenExpiry, refreshToken, tenantId, userId, email, name, tenantName }`, discarded on process
stop. Refresh is proactive (~90 s before expiry) + reactive (on 401, once), **single-flight**; Xero
**rotates** the refresh token each use → overwrite in memory. At callback, resolve `tenantId` via
`GET /connections` and `userId` by matching the `id_token` email against `GET /projectsusers`.

**API abstraction layer (module: API routes + Xero client wrapper).** Thin proxy. One shared wrapper
injects `Authorization` + `Xero-tenant-id`, does the 401→refresh→retry-once, and paginates
(`page`→`pageCount`). Routes: `GET /auth/{login,callback,status}`; `GET /projects` (active,
`states=INPROGRESS`); `GET /projects/{id}/tasks` (filter `status==='ACTIVE'`); `GET /me`;
`GET /week?from&to`; `POST /timeentries`; `PUT /timeentries/{id}`; `DELETE /timeentries/{id}?projectId=`.

**Week load contract (decision — full scan).** Xero has no global time-entry list, so `GET /week`
fans out `GET /Projects/{id}/Time?userId&dateAfterUtc&dateBeforeUtc` across **all active projects**,
capped at **≤ 5 concurrent** (Xero's concurrency limit), and merges. The client buckets results into
Slots. This full scan is also the source of "copy last week" prefill.

**Write contract.** Create body: `{ userId, taskId, dateUtc, duration, description? }` →
`POST /Projects/{projectId}/Time`. Update is a full-replace `PUT`; both PUT and DELETE are only valid
while the Entry's `status === 'ACTIVE'`.

**Error envelope (API contract).** Every route returns `{ error: { code, message, retryAfter?, fields? },
status }`. Codes → client behavior: `reauth_required`→login · `rate_limited`→React Query backoff
honoring `retryAfter` · `validation`→per-Cell error (`fields`) · `upstream`→toast + Cell error.

**Retry split & resilience (module: grid mutations).** Server retries only the auth 401. Client
retries 429 (honoring `Retry-After`) and 5xx (bounded backoff), never validation/reauth. Mutations are
optimistic; on failure the Cell enters `pending` and auto-retries with backoff, resolving to `saved`
or falling to `error`. In-memory only (React Query mutation state) — a reload while pending drops the
edit and the grid re-fetches from Xero. GET de-dup is via React Query query keys.

**Prefill (module: grid state + localStorage).** Copy last week (source A+B): seed Rows from the
previous week's Entries (from the week scan), augmented by a `localStorage` recent-rows set. No usage
ranking; add-row picker is a plain typeahead.

**Security.** All routes except login/callback require a signed httpOnly session cookie; tokens never
reach the browser.

## Testing Decisions

**What makes a good test here:** assert **external behavior only**, never internals. Tests drive a
module through its public seam and check observable outputs (HTTP responses / rendered grid /
Xero-bound requests), so they survive refactors of the code behind the seam. No test reaches a real
Xero. **Mock Service Worker (MSW)** is the single unifying mocking tool across both seams. (Greenfield
repo — there is **no prior art**; establish the convention: **Vitest + React Testing Library + MSW**.)

**Seam 1 — internal API boundary (`/api/*`), Xero HTTP mocked.** Drive our own API routes; MSW mocks
Xero's endpoints. This one seam covers: the OAuth callback populating the session (tenant + userId
resolution, including the "not a Projects user" guard); token refresh (proactive, reactive-on-401,
single-flight de-dup, rotation persisted); the error-envelope mapping for 401/429/400/5xx (including
`retryAfter` surfacing); pagination looping to `pageCount`; the `/week` full-scan fan-out and its ≤ 5
concurrency cap; and each CRUD route mapping to the correct `POST/PUT/DELETE /Projects/{id}/Time` call
with the right body/headers.

**Seam 2 — grid component, our `/api` mocked.** Drive the grid via simulated keyboard (React Testing
Library `userEvent`); MSW mocks our `/api`. Covers: the keyboard model (arrow nav, Tab/Enter
commit-and-move with row wrap, Esc revert, Backspace clear); **duration parsing through cell commits**
(the whole format matrix + the ≥16-minutes heuristic + invalid→error, asserted via what the cell shows
and the request sent); the cell state machine (`saving`→`saved`, `pending` on transient failure →
retry → `saved`/`error`, `locked` and `conflict` render read-only); description flows (inline `//`,
double-click, ⌥Enter); prefill copy-last-week; and optimistic save with rollback on failure.

**Modules under test:** the API routes + Xero client wrapper (Seam 1); the grid component, grid-state,
duration parser, and mutation/resilience behavior (Seam 2, all exercised through the grid).

## Out of Scope

- **Multi-user / team auth**, per-user token stores, shared deployment (single-user local only).
- **Cloud hosting & a shared database** (memory-only tokens, `localStorage` only).
- **Durable offline / full-week offline composition** — resilience is in-memory auto-retry only; no
  localStorage mutation queue, no cross-reload offline.
- **Usage-ranked prefill** — the picker is a plain typeahead; "copy last week" is the only prefill.
- **Idle timeout / explicit logout** — session ends on process stop by choice.
- **Non-Projects Xero APIs** (invoicing, expenses, payroll, accounting).
- **Splitting one task/day into multiple entries from the grid** — the grid maintains one Entry per Slot;
  pre-existing multi-entry slots are surfaced as read-only conflicts, not authored.

## Further Notes

- Full decision detail and the two reference snippets (OAuth token-refresh helper; time-entry write
  wrapper) are in [`ARCHITECTURE.md`](../../ARCHITECTURE.md); the per-decision rationale lives in the
  wayfinder tickets under `.scratch/xero-timesheet/tickets/`, and the verified Xero API facts under
  `.scratch/xero-timesheet/research/`.
- Signed-off interactive UX prototype: https://claude.ai/code/artifact/7ce3ffba-c9db-4709-8654-139979c8c5a8
  (also captured on branch `prototype/grid-ux`).
- **Build-time caveat:** app registration happens after 2 Mar 2026, so the Xero app uses the new
  granular scopes — confirm the exact Projects granular scope token names on Xero's live Scopes /
  Granular-Scopes FAQ when registering.
- Suggested build order follows ARCHITECTURE.md §7: Phase 1 setup/auth → Phase 2 API layer → Phase 3
  grid/keyboard → Phase 4 transient-failure resilience.

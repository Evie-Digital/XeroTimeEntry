---
labels: [wayfinder:map]
title: "Xero Projects fast time-entry app — architecture & build plan"
tracker: local-markdown
---

# Xero Projects fast time-entry app — architecture & build plan

## Destination

A **System Architecture & Build Plan** (a hand-off spec, to land as `ARCHITECTURE.md`) for a
**single-user, local-only Next.js app** that logs, edits, and deletes time in **Xero Projects**
through a fast, keyboard-driven **weekly grid** — complete enough to hand to an implementer,
including two reference code snippets (OAuth token-refresh helper; time-entry write wrapper).
Reaching the destination = every decision below is made and the assembled plan exists.
**The implementation itself is out of scope** — this map produces the plan, not the app.

## Notes

- **Domain:** Xero Projects API v2.0 (`https://api.xero.com/projects.xro/2.0/`). Time entries are
  discrete records (duration in **minutes**, `dateUtc` ISO 8601, keyed by `projectId` + `taskId` +
  `userId`). OAuth 2.0 with 30-minute access tokens + refresh.
- **Fixed scope (from charting):** single user (just Gavin); runs local-only on `localhost`;
  refresh token in a local **encrypted file** (no cloud, no shared DB); grid does **read + edit +
  delete** of existing entries; stack is **Next.js App Router** (API routes proxy Xero so the
  client secret never reaches the browser).
- **Skills each session should consult:** `/grilling` + `/domain-modeling` for decision tickets;
  `/research` for research tickets; `/prototype` for the grid UX ticket.
- **Plan, don't do:** decision tickets produce decisions, not code. The single exception is the
  terminal synthesis ticket, which is explicitly authorised to *write* the `ARCHITECTURE.md`
  deliverable and its two reference snippets — that assembly IS the destination artifact.
- **Tracker adaptation:** this repo has no configured tracker, so we use local markdown. Tickets
  are files under `tickets/`; blocking is the `blocked_by` frontmatter field (no native blocking).
  The frontier = open tickets whose every `blocked_by` id is closed and whose `assignee` is empty.
  Research findings land under `research/<name>.md` (no git branches — repo isn't initialised).

## Decisions so far

<!-- one line per closed ticket: gist + link; zoom the link for detail -->

- [Research: Xero Projects time-entry CRUD support & payload shapes](tickets/0001-xero-timeentry-crud.md) — **native CRUD IS supported** (no delete-and-recreate). Endpoint is `/Projects/{projectId}/Time` (not `/timeentries`): POST/GET/PUT/DELETE; create needs `userId`+`taskId`+`dateUtc`+`duration` (min, 1–59940); update/delete only while `ACTIVE` (rejected once `INVOICED`/`LOCKED`) → grid shows invoiced cells read-only.
- [Research: Xero OAuth 2.0 flow for a local single-user app](tickets/0002-xero-oauth-local.md) — use **standard Auth Code + confidential secret** (server-side; PKCE only for native); scopes `openid profile email projects offline_access` (`projects`=read+write, `email` needed for userId match); redirect `http://localhost:<port>/...` OK (not 127.0.0.1), exact match, no wildcards; access 30 min / refresh 60-day and **rotates every use** (persist atomically, 30-min grace); every call needs `Authorization` + `Xero-tenant-id` from `GET /connections`.
- [Research: userId resolution via projectsusers & connections](tickets/0004-xero-userid-resolution.md) — every POST's `userId` comes from `GET /projectsusers` (items of `{userId,name,email}`, nothing marks the caller); resolve "me" by matching the OpenID `id_token` **email** claim; `userId` is a stable per-tenant UUID → cache by `(tenantId,email)`; guard the "not a Projects user in this tenant" no-match case.
- [Research: Xero API rate limits, 429 handling, pagination & active-filtering](tickets/0003-xero-limits-pagination.md) — 60/min + 5k/day + 5 concurrent per tenant; 429 sends `Retry-After` + `X-*-Remaining` headers; `page`/`pageSize` (max 500) with a `pagination` object; active = `states=INPROGRESS` for projects, client-side `status` filter for tasks; 5–15 min cache TTL.
- [Decide: grid cell ↔ Xero time-entry domain model](tickets/0005-grid-entry-model.md) — **one Entry per Cell**; a **Slot** `(projectId,taskId,localDate)` holds ≤1 Entry; POST/PUT/DELETE map to empty/edit/clear; canonical unit **integer minutes**; **pure calendar dates, never zone-convert** (`dateUtc=<localDate>T00:00:00Z`, bucket on the UTC date substring); optional per-Cell note; 2+-entry Slots render read-only `conflict`, invoiced entries read-only; blank Rows/Slots are drafts (nothing POSTed until a value).

## Not yet specified

<!-- in-scope fog, too blurry to ticket yet; graduates as the frontier advances -->

- **Offline / draft support (Phase 4, optional).** The grid-model ticket now defines a "draft" (a
  Row/Slot with no POSTed Entry yet). What remains foggy is the *offline* dimension — persisting
  dirty edits while disconnected and replaying them on reconnect — which still hangs on the client
  caching model (caching ticket, 0007). Sharpens once 0007 lands.
- **"Frequent projects/tasks" ranking.** The exact recency/frequency algorithm and how many to
  prefill. Depends on the prefill decision inside the caching ticket.
- **Exact granular-scope token names.** Since app registration happens after 2 Mar 2026, the app
  uses Xero's new granular scopes; the precise Projects granular token strings must be read off the
  live Scopes / Granular-Scopes FAQ when registering. Sharpens into the app-registration task.
- **Local app packaging / launch ergonomics.** Whether it's `npm run dev`, a packaged binary, or a
  menubar launcher, and how the encrypted-token passphrase is entered at start. Revisit once the
  token-storage and API-layer tickets are concrete.

## Out of scope

<!-- ruled beyond the destination; never graduates -->

- **Multi-user / team auth**, per-user token stores, shared deployment — chose single-user local.
- **Cloud hosting & shared database** — chose local-only.
- **Building / implementing the actual app** — the destination is the *plan*; implementation is a
  separate hand-off effort.
- **Non-Projects Xero APIs** (invoicing, expenses, payroll, accounting) — out of the time-entry scope.

---
id: 0009
title: "Decide: internal API abstraction layer & error envelope"
type: grilling
status: closed
assignee: gavin
blocked_by: [0002, 0003]
blocks: [0010]
---

## Question

What is the shape of our own Next.js API-route layer that proxies Xero (keeping the secret + tokens
server-side)?

- **Route surface:** enumerate the internal routes — e.g. `GET /api/projects`, `GET /api/projects/
  {id}/tasks`, `GET/POST/PUT/DELETE /api/timeentries`, `GET /api/me` (userId), `GET /api/auth/*`
  (start, callback, status). Map each to its Xero call.
- **Where token refresh lives:** a single server-side Xero client wrapper that every route calls,
  handling refresh (per 0006) and injecting `Xero-tenant-id`.
- **Error envelope:** one consistent JSON error shape the client can rely on. How Xero's errors map:
  401/expired → refresh-then-retry-once; 429 → surface Retry-After + backoff (per 0003); 400
  validation → per-field messages for grid cells; 5xx → generic.
- **Retry policy:** which failures auto-retry (single retry on refreshed 401, backoff on 429) vs
  bubble straight to the UI.
- **Request coalescing:** de-dupe concurrent identical GETs so a grid render doesn't fan out.

**Depends on 0002 and 0003.**

## Resolution

Decided with the user (HITL). Two forks chosen: **thin proxy + client-owns-retry**, and **full-scan
week load**.

**Posture:** thin proxy. Routes ~1:1 with Xero + two composed routes; all resilience/backoff lives in
the client (React Query). Every route calls one **shared server-side Xero client wrapper**.

**Xero client wrapper (single choke point):**
- Reads the in-memory session (`accessToken`, expiry, `refreshToken`, `tenantId`, `userId`) per 0006.
- Ensures fresh token (proactive refresh within ~90s of expiry, **single-flight**), injects
  `Authorization: Bearer` + `Xero-tenant-id`.
- **401** → refresh once + retry once; still 401 → `reauth_required` (clear session). **429** → surface
  `retryAfter`, no server retry. **400** → parsed field errors. **5xx/network** → generic. `paginate()`
  helper loops `page` → `pageCount`.

**Uniform error envelope:** `{ error: { code, message, retryAfter?, fields? }, status }`.
Codes → client: `reauth_required`→login · `rate_limited`→React Query backoff honoring `retryAfter` ·
`validation`→per-cell error state · `upstream`→toast + cell error.

**Route surface (`app/api/…`):**
- `GET /auth/login` (302 → Xero authorize; scopes+state), `GET /auth/callback` (exchange code → store
  tokens in memory → `GET /connections` tenant → `GET /projectsusers` email-match userId → set httpOnly
  cookie → 302 app), `GET /auth/status` (from session), `POST /auth/logout` (optional, not UI-wired).
- `GET /projects` → paginate `GET /Projects?states=INPROGRESS`.
- `GET /projects/{id}/tasks` → paginate `GET /Projects/{id}/Tasks`, filter `status==='ACTIVE'`.
- `GET /me` → session `{userId,name,email}`.
- **`GET /week?from&to`** (composed, **full scan**): fan out `GET /Projects/{id}/Time?userId&
  dateAfterUtc&dateBeforeUtc` across ALL active projects, merge → client buckets into Slots (0005).
- `POST /timeentries` (body has `projectId`) → `POST /Projects/{projectId}/Time`.
- `PUT /timeentries/{id}` (body has `projectId`, full-replace) → `PUT /Projects/{projectId}/Time/{id}`.
- `DELETE /timeentries/{id}?projectId=` → `DELETE /Projects/{projectId}/Time/{id}`.
- Write routes flat with `projectId` in payload (cell always knows it); task reads nested. All routes
  except login/callback require the session cookie; tokens never reach the browser; client secret only
  in `.env.local`.

**Retry split:** server retries only the auth 401. Client retries 429 (honoring `retryAfter`) + 5xx
(backoff); never validation/reauth. Mutations optimistic (per 0008) → roll back cell + show its error
on failure. **Coalescing:** React Query query-keys de-dupe concurrent GETs; server holds no cache.

**Transparency note:** the `GET /week` fan-out is server-side, so the wrapper caps it at **≤5
concurrent** to respect Xero's concurrency limit — the one spot the server does more than pass-through
(a concurrency cap, not a retry queue).

**Wrinkle surfaced (fed back to 0007's mechanism):** Xero has no global time-entry list — it's
per-project — so the week loader fans out per project. The user chose full-scan (all active projects),
so a week is complete regardless of which rows are seeded; this makes 0007's prefill source A
(last-week Xero entries) a natural by-product of the week scan rather than a separate query.

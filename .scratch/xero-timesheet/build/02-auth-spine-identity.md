---
id: build-02
title: "Build: Xero auth spine + identity"
mode: HITL
status: closed
assignee: implement-orchestrator
labels: [ready-for-human]
blocked_by: [build-01]
blocks: [build-03]
---

## Parent PRD

[`spec-fast-time-entry-app.md`](../spec-fast-time-entry-app.md) · plan: [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) §4

## What to build

The end-to-end auth spine: log in with Xero and see your identity. Cuts through the OAuth flow, the
in-memory session, tenant/user resolution, and the shared Xero client wrapper — the foundation every
data slice reuses. Demoable: click "Connect Xero", authorize, land back on a page reading
**"Logged in as <name> at <org>"**.

**Human prerequisite (why HITL):** register a *Web app* in the Xero developer portal with redirect
`http://localhost:3000/api/xero/callback` and scopes `openid profile email projects offline_access`;
put the Client ID/Secret in `.env.local`. **Verify the exact granular Projects scope token names** on
Xero's live Scopes / Granular-Scopes FAQ (post-2 Mar 2026 apps use granular scopes).

Build: `GET /api/auth/login` (→ Xero authorize with `state`), `GET /api/auth/callback` (exchange code →
in-memory session → resolve `tenantId` via `GET /connections` → resolve `userId` by matching the
`id_token` email against `GET /projectsusers` → set signed httpOnly session cookie), `GET /api/auth/
status`, and the shared **Xero client wrapper** (inject `Authorization` + `Xero-tenant-id`, proactive +
reactive single-flight refresh with rotation, `paginate()` helper). See ARCHITECTURE.md §4 and
snippet §8.A.

## Acceptance criteria

- [ ] Visiting the app unauthenticated redirects to / offers Xero login.
- [ ] Completing the Xero authorize flow stores tokens **in server memory only** (nothing on disk) and
      sets a signed httpOnly session cookie.
- [ ] `tenantId` and `userId` are resolved once at callback (`/connections` + `/projectsusers`
      email-match) and cached in the session.
- [ ] The app displays the logged-in user's name and organisation (from `/api/auth/status` / `/api/me`).
- [ ] Access-token refresh is proactive (near-expiry) + reactive (on 401, retry once), single-flight,
      and persists the **rotated** refresh token in memory.
- [ ] A user with no Projects licence in the tenant (no `/projectsusers` email match) gets a clear
      error, not a silent failure.
- [ ] The client secret and tokens never appear in any client response or bundle.
- [ ] Tests (seam 1, Xero mocked via MSW): callback populates session; refresh rotates + de-dupes
      concurrently; the no-Projects-user guard fires.

## Blocked by

- Blocked by #build-01

## User stories addressed

1, 2, 3, 4, 5, 6, 7, 46

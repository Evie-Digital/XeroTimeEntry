---
id: 0002
title: "Research: Xero OAuth 2.0 flow for a local single-user app"
type: research
status: closed
assignee: gavin
blocked_by: []
blocks: [0006, 0009, 0010]
---

## Question

What is the correct, current Xero OAuth 2.0 setup for a **single-user app running on localhost**?

- **Flow choice:** Auth Code + PKCE (public client, no secret) vs Auth Code with a confidential
  client secret. Which does Xero recommend for a server-side Next.js app that keeps a secret, and
  which for a purely local tool? What are the trade-offs for our single-user case?
- **Scopes:** exact scopes needed for Projects read + time-entry write, plus `offline_access` for
  refresh. (e.g. `projects`, `projects.read`, `offline_access`, `openid`?)
- **Redirect URI rules:** does Xero allow `http://localhost:<port>/...` redirect URIs? Any HTTPS
  requirement, port constraints, or wildcard handling.
- **Refresh-token behaviour:** access-token lifetime (~30 min), refresh-token lifetime, and crucially
  **whether refresh tokens rotate** on each use (Xero rotates — confirm and note the 60-day inactivity
  window). Implications for the single stored token.
- **Connections / tenant:** how the app resolves which Xero tenant/organisation the token is for
  (`GET /connections`), and whether Projects needs a tenant id header (`Xero-tenant-id`).
- App registration steps in the Xero developer portal relevant to the above.

**Why it gates the map:** decides the auth design (0006), the API abstraction layer (0009), and the
reference token-refresh snippet (0010).

**Capture findings to:** `research/xero-oauth-local.md`

## Resolution

Findings: [`research/xero-oauth-local.md`](../research/xero-oauth-local.md).

- **Flow:** standard **Authorization Code + confidential client secret** (Next.js server holds
  the secret, server-only). PKCE is required only for native apps that can't hold a secret — not
  needed here (optional hardening only).
- **Scopes:** request `openid profile email projects offline_access`. `projects` = read+write
  (covers time-entry write); `offline_access` returns the refresh token; **`email` is required**
  for userId resolution (0004). Minimal = `projects offline_access`.
- **Redirect URI:** `http://localhost/` allowed for dev (NOT `http://127.0.0.1`); https otherwise;
  no wildcards; exact match incl. port → pin e.g. `http://localhost:3000/api/xero/callback`.
- **Tokens:** access = 30 min; refresh = 60-day inactivity; **refresh tokens ROTATE every use** —
  persist the new one atomically, discard old; 30-min grace window to retry with the old token.
  Idle > 60 days → re-consent (schedule periodic refresh to keep alive).
- **Tenant:** `GET https://api.xero.com/connections` → `tenantId`; every Projects call needs BOTH
  `Authorization: Bearer` AND `Xero-tenant-id` headers. Resolve+cache `tenantId` once.
- ⚠️ **Granular-scopes caveat (post-2 Mar 2026):** a newly registered app uses Xero's new granular
  scopes — verify the exact Projects granular token names on the live Scopes/Granular-Scopes FAQ
  at build time. Carried into the API-layer (0009) and app-registration task.

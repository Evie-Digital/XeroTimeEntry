---
id: 0002
title: "Research: Xero OAuth 2.0 flow for a local single-user app"
type: research
status: in-progress
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

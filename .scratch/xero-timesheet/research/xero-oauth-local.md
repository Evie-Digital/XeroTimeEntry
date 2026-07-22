# Xero OAuth 2.0 for a local single-user app — research findings

> Scope of research: primary sources only (developer.xero.com OAuth 2.0 guides, Scopes,
> Token types, Tenants, Projects API). WebFetch timed out on every developer.xero.com
> page, so facts are drawn from Xero-domain search-result snippets (still primary domain)
> rather than full-page verbatim reads. Any point that could not be confirmed verbatim is
> flagged. No non-primary/community sources were relied on for the conclusions.

## BOTTOM LINE

- **Flow:** Use the **standard Authorization Code flow with a confidential client secret**.
  Your Next.js server can safely hold the secret, and this is exactly the case Xero
  recommends the standard flow for ("web server applications that can securely store a
  client secret"). PKCE is aimed at, and *required only for*, native desktop/mobile apps
  that cannot hold a secret. For a localhost Next.js server-side tool, confidential-client
  is the correct, simpler choice. (Optional hardening: you may layer PKCE on top of the
  confidential flow, but it is not required.)
- **Exact scope string to request:**
  `openid profile email projects offline_access`
  - Minimal viable string (no user-identity claims): `projects offline_access`
  - `projects` grants read **and** write (covers Projects READ + time-entry WRITE).
    `offline_access` is what returns the refresh token.

## 1. Flow choice — PKCE vs confidential client

- Xero's API supports the authorization code grant via **the standard authorization code
  flow** or the **PKCE** extension.
- **Standard (confidential) flow:** "suitable for web server applications that can securely
  store a client secret"; requires securely storing/using the `client_secret`.
- **PKCE flow:** lets native apps connect without storing a secret (creates a per-request
  `code_verifier`). **"Native (desktop and mobile) apps are required to use PKCE if
  connecting directly to the API."**
- **Our single-user localhost Next.js case:** the server component can hold a secret, so the
  standard confidential flow applies and is recommended. Trade-offs:
  - Confidential secret: simplest server-side token exchange; secret must be kept out of any
    browser/client bundle (server-only env var).
  - PKCE: no secret to protect, useful if the token exchange ever moves to the browser or a
    packaged desktop build; adds verifier/challenge bookkeeping. Not needed here.

## 2. Scopes — exact tokens

- **Refresh:** `offline_access` — required to receive a `refresh_token`; without it no refresh
  token is returned.
- **OpenID Connect / user identity (optional but needed here):** `openid`, `profile`, `email`.
  `openid` causes an `id_token` to be returned; `profile`/`email` populate its claims. **We DO
  need `email`** — the userId-resolution decision (ticket 0004) matches the `id_token` email
  claim against `/projectsusers`.
- **Projects API:**
  - `projects` — read + write access (create/update projects, tasks, and **time entries**).
  - `projects.read` — read-only access.
  - For **Projects READ + time-entry WRITE**, request **`projects`** (write includes read).
    [Exact `projects` / `projects.read` strings from primary Scopes/Projects docs via search
    snippets; could not be read verbatim due to WebFetch timeouts — high-confidence, verify
    against the live Scopes page.]
- **Granular scopes note (today is 2026-07-22):** Xero is rolling out new granular scopes —
  apps created **after 2 March 2026 automatically have the new granular scopes**. A newly
  registered app will use the granular scope model; confirm the exact Projects granular token
  names on the live Scopes and Granular Scopes FAQ pages before finalizing.

## 3. Redirect URI rules

- Redirect URI **must be an `https` address**, **except** `http://localhost/` is allowed for
  testing/development.
- **`http://127.0.0.1` cannot be used** (localhost hostname only, not the loopback IP).
- Must be an **absolute URI** (RFC 6749 §3.1.2).
- **Wildcards are not supported.**
- Up to **50 redirect URIs** per app.
- Implication: register something like `http://localhost:3000/api/xero/callback`. The
  registered value must match exactly (scheme, host, port, path) — pin your dev port.

## 4. Refresh-token behaviour

- **Access token lifetime:** valid up to **30 minutes**.
- **Refresh token lifetime:** valid up to **60 days** (inactivity expiry — resets on use).
- **Rotation: YES.** "Every time you use a refresh_token you will get a new one along with the
  new access_token." You must persist the new refresh token and discard the old one.
- **Grace period:** if your app fails to save/receive the new token, you may retry with the
  existing refresh token for a **30-minute grace window**; after that the previous refresh
  token expires and the user must re-authorize.
- **Single-token storage implications:**
  - Store exactly one current refresh token; overwrite it atomically on every refresh.
  - If the app is idle > 60 days, the refresh token dies and re-consent is required — for a
    single-user tool, schedule a periodic refresh (well inside 60 days) to keep it alive.
  - Handle the write-then-old-token-still-valid race using the 30-min grace window; avoid
    concurrent refreshes that could rotate the token out from under each other.

## 5. Tenant / connections resolution

- After authorization, call **`GET https://api.xero.com/connections`** with the
  `Authorization: Bearer <access_token>` header to list the tenants (organisations) the token
  is authorized for; each entry includes the `tenantId`.
- **All Xero API calls (including Projects) require two headers:** `Authorization: Bearer
  <access_token>` **and** `Xero-tenant-id: <tenantId>`.
- A missing/incorrect/unauthorized `Xero-tenant-id` header is a documented cause of errors.
- Single-user note: resolve `tenantId` once from `/connections` (typically one org) and cache
  it; re-resolve if the user connects a different org.

## 6. App registration (Xero developer portal) — brief

1. Sign in to the Xero Developer portal and create/register a new app under "My Apps".
2. Choose the app type — a **Web app** (auth code + client secret) for the Next.js server; a
   Mobile/Desktop app type would force PKCE.
3. Set the **redirect URI(s)** (e.g. `http://localhost:3000/api/xero/callback`); https in
   production, localhost allowed for dev; no wildcards; up to 50.
4. Note the **Client ID** and generate the **Client Secret** (store server-side only).
5. Select/request the required **scopes** (`projects`, `offline_access`, plus `openid profile
   email`). A post-2 March 2026 app uses granular scopes.
6. Use the standard authorize → callback (code) → token-exchange flow; then call
   `/connections` to get the tenant id.

## Sources

- OAuth 2.0 overview — https://developer.xero.com/documentation/guides/oauth2/overview/
- Standard authorization code flow — https://developer.xero.com/documentation/guides/oauth2/auth-flow/
- PKCE flow — https://developer.xero.com/documentation/guides/oauth2/pkce-flow
- Scopes — https://developer.xero.com/documentation/guides/oauth2/scopes/
- Granular Scopes FAQ — https://developer.xero.com/faq/granular-scopes
- Token types — https://developer.xero.com/documentation/guides/oauth2/token-types
- OAuth 2.0 FAQs — https://developer.xero.com/faq/oauth2
- Xero Tenants — https://developer.xero.com/documentation/guides/oauth2/tenants
- Managing Connections — https://developer.xero.com/documentation/best-practices/managing-connections/connections/
- Projects API overview — https://developer.xero.com/documentation/api/projects/overview
- Projects API Time (time entries) — https://developer.xero.com/documentation/api/projects/time

_Flag: WebFetch could not render any developer.xero.com page (repeated 60s timeouts); all
facts are from primary Xero-domain search snippets. Verify the exact Projects scope token(s)
and granular-scope names on the live Scopes page before shipping._

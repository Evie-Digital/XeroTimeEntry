---
id: 0006
title: "Decide: local encrypted token storage & auto-refresh scheme"
type: grilling
status: closed
assignee: gavin
blocked_by: [0002]
blocks: [0009, 0010]
---

## Question

How are the refresh/access tokens stored at rest and refreshed safely for a local single-user app?

- **Storage location & format:** a file under the user's home (e.g. `~/.config/xero-timesheet/
  tokens.json`)? What exactly is persisted (refresh token always; access token + expiry cached?).
- **Encryption at rest:** what scheme — OS keychain (macOS Keychain) vs a passphrase-derived key
  (scrypt/argon2 → AES-GCM) entered at app start vs an env-var key? Trade-off: convenience vs
  security for a localhost tool.
- **Refresh logic & rotation:** Xero rotates refresh tokens (per 0002). Define the refresh routine —
  when to trigger (proactive on expiry-1min vs reactive on 401), how to persist the rotated token
  atomically, and how to avoid **concurrent refresh races** (two API routes refreshing at once and
  invalidating each other).
- **Failure handling:** refresh token expired/revoked → how the app re-triggers the full auth flow.
- **Startup UX:** first-run auth vs subsequent silent refresh; what the user sees.

**Depends on 0002.** This decision defines the reference token-refresh snippet in 0010.

## Resolution

Decided with the user (HITL). **Pivoted away from the charted "encrypted file" assumption: tokens
are held in server-process memory only and never persisted.** This is a better fit for a weekly
personal tool and dissolves the entire encryption-at-rest problem.

**Storage:** NONE at rest. The Next.js server process holds an in-memory session store:
`{ accessToken, accessTokenExpiry, refreshToken, tenantId, userId }`. Nothing written to disk. The
only persisted secret is the app's **client secret** in a server-only env var (`.env.local`,
gitignored) — the app's secret, not the user's token.

**Session lifecycle (user chose "on process stop only"):**
- Token set lives for the **lifetime of the running server process**. Stop the app (Ctrl+C) → memory
  cleared → fresh Xero login next start. Weekly use ⇒ ~one login per week.
- No idle timeout and no explicit logout button (user consciously declined the extra automatic
  protection for simplicity; either could be added later as hardening — noted, not scoped now).

**First-run / re-auth flow:** an action with no valid in-memory token → redirect to Xero authorize
(auth-code + confidential secret, scopes `openid profile email projects offline_access` per 0002) →
callback populates the in-memory store, then resolves `tenantId` (`GET /connections`) and `userId`
(`GET /projectsusers` email-match, per 0004). Subsequent actions in the session are silent.

**Refresh routine (keeps you logged in mid-entry):**
- **Trigger:** proactive — before each Xero call, if `accessTokenExpiry` is within ~60–120 s, refresh
  first; plus reactive — on a 401, refresh once and retry the call.
- **Rotation:** Xero rotates the refresh token every use (per 0002) → overwrite the in-memory
  `refreshToken` with the returned one on every refresh (trivially atomic in one process).
- **Concurrent-refresh race:** single-flight — a shared in-flight refresh promise so N concurrent API
  routes hitting an expired token trigger exactly ONE refresh and all await it; Xero's 30-min grace
  window is the backstop.
- **Failure:** refresh rejected (revoked / >60-day idle / network) → clear the in-memory store and
  surface "session expired — please log in", re-triggering the auth flow.

**Browser↔server session:** single-user localhost, so a minimal signed **httpOnly** session cookie
marks "this browser is the authorized session"; the tokens themselves stay server-side and never
reach the browser.

**Ripples:** the encryption-scheme sub-question (Keychain / passphrase / env-key) is **dropped** — no
secret at rest. Supersedes the map's "encrypted file" fixed-scope note. Defines the reference
token-refresh helper in 0010 (operates on the in-memory store). Feeds the API layer's Xero client
wrapper (0009).

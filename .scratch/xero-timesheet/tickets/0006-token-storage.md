---
id: 0006
title: "Decide: local encrypted token storage & auto-refresh scheme"
type: grilling
status: open
assignee:
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

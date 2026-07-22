---
id: 0009
title: "Decide: internal API abstraction layer & error envelope"
type: grilling
status: open
assignee:
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

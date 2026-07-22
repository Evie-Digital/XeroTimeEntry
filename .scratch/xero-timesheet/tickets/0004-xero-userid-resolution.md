---
id: 0004
title: "Research: userId resolution via projectsusers & connections"
type: research
status: in-progress
assignee: gavin
blocked_by: []
blocks: [0007, 0010]
---

## Question

Every time-entry POST requires a `userId`. For a single-user app, how do we obtain and pin the
correct one?

- `GET /projectsusers` — response shape, what a "project user" is, and how to identify **the current
  authenticated user** among them (does the response mark the caller, or must we match by email?).
- Is a project user's `userId` **stable** across sessions/tenants? Can we resolve it once and cache it?
- Relationship between the OAuth-authenticated identity, the Xero tenant/connection, and the
  Projects `userId`. Is the same person guaranteed to be a project user in the tenant?
- Any pagination or licensing caveat (e.g. user must be assigned to Projects to appear).

**Why it gates the map:** the `userId` is a required field on every POST; the caching/prefill
strategy (0007) and the reference write-wrapper (0010) both need the resolution approach settled.

**Capture findings to:** `research/xero-userid-resolution.md`

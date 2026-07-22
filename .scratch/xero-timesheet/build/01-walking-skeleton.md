---
id: build-01
title: "Build: walking skeleton (Next.js + tooling + test harness)"
mode: AFK
status: open
assignee:
labels: [ready-for-agent]
blocked_by: []
blocks: [build-02]
---

## Parent PRD

[`spec-fast-time-entry-app.md`](../spec-fast-time-entry-app.md) · plan: [`ARCHITECTURE.md`](../../../ARCHITECTURE.md)

## What to build

The greenfield foundation every later slice sits on. Scaffold a Next.js (App Router) + TypeScript +
Tailwind app with TanStack Query wired at the root, and stand up the test harness (**Vitest + React
Testing Library + MSW**) that both test seams will use. Deliver one trivial end-to-end proof: a page
renders, and a single MSW-backed test passes. No Xero yet.

See ARCHITECTURE.md §3 (stack) and §7 Phase 1 (setup).

## Acceptance criteria

- [ ] `npm run dev` serves a page on `http://localhost:3000`.
- [ ] TypeScript, Tailwind, and a React Query provider are configured at the app root.
- [ ] Vitest + React Testing Library + MSW are installed and configured; `npm test` runs green.
- [ ] One example test renders a component that fetches via MSW-mocked HTTP and asserts on the result
      (proves the seam-2 mocking approach works).
- [ ] `.env.local` is git-ignored and a `.env.example` documents the vars later slices need
      (`XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, session-cookie secret).

## Blocked by

None — can start immediately.

## User stories addressed

Infrastructure slice — enables all stories; verifies none directly.

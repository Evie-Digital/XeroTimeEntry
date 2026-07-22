---
labels: [wayfinder:map]
title: "Xero Projects fast time-entry app — architecture & build plan"
tracker: local-markdown
---

# Xero Projects fast time-entry app — architecture & build plan

## Destination

A **System Architecture & Build Plan** (a hand-off spec, to land as `ARCHITECTURE.md`) for a
**single-user, local-only Next.js app** that logs, edits, and deletes time in **Xero Projects**
through a fast, keyboard-driven **weekly grid** — complete enough to hand to an implementer,
including two reference code snippets (OAuth token-refresh helper; time-entry write wrapper).
Reaching the destination = every decision below is made and the assembled plan exists.
**The implementation itself is out of scope** — this map produces the plan, not the app.

## Notes

- **Domain:** Xero Projects API v2.0 (`https://api.xero.com/projects.xro/2.0/`). Time entries are
  discrete records (duration in **minutes**, `dateUtc` ISO 8601, keyed by `projectId` + `taskId` +
  `userId`). OAuth 2.0 with 30-minute access tokens + refresh.
- **Fixed scope (from charting):** single user (just Gavin); runs local-only on `localhost`;
  refresh token in a local **encrypted file** (no cloud, no shared DB); grid does **read + edit +
  delete** of existing entries; stack is **Next.js App Router** (API routes proxy Xero so the
  client secret never reaches the browser).
- **Skills each session should consult:** `/grilling` + `/domain-modeling` for decision tickets;
  `/research` for research tickets; `/prototype` for the grid UX ticket.
- **Plan, don't do:** decision tickets produce decisions, not code. The single exception is the
  terminal synthesis ticket, which is explicitly authorised to *write* the `ARCHITECTURE.md`
  deliverable and its two reference snippets — that assembly IS the destination artifact.
- **Tracker adaptation:** this repo has no configured tracker, so we use local markdown. Tickets
  are files under `tickets/`; blocking is the `blocked_by` frontmatter field (no native blocking).
  The frontier = open tickets whose every `blocked_by` id is closed and whose `assignee` is empty.
  Research findings land under `research/<name>.md` (no git branches — repo isn't initialised).

## Decisions so far

<!-- one line per closed ticket: gist + link; zoom the link for detail -->

_(none yet — charting session)_

## Not yet specified

<!-- in-scope fog, too blurry to ticket yet; graduates as the frontier advances -->

- **Offline / draft support (Phase 4, optional).** Local drafts of unsaved grid edits, replay on
  reconnect. Can't sharpen until the grid↔entry model (grid model ticket) and the client caching
  model (caching ticket) land — both decide what a "draft" even is.
- **"Frequent projects/tasks" ranking.** The exact recency/frequency algorithm and how many to
  prefill. Depends on the prefill decision inside the caching ticket.
- **Local app packaging / launch ergonomics.** Whether it's `npm run dev`, a packaged binary, or a
  menubar launcher, and how the encrypted-token passphrase is entered at start. Revisit once the
  token-storage and API-layer tickets are concrete.

## Out of scope

<!-- ruled beyond the destination; never graduates -->

- **Multi-user / team auth**, per-user token stores, shared deployment — chose single-user local.
- **Cloud hosting & shared database** — chose local-only.
- **Building / implementing the actual app** — the destination is the *plan*; implementation is a
  separate hand-off effort.
- **Non-Projects Xero APIs** (invoicing, expenses, payroll, accounting) — out of the time-entry scope.

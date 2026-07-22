---
id: build-08
title: "Build: entry descriptions (inline // + editor)"
mode: AFK
status: closed
assignee: implement-orchestrator
labels: [ready-for-agent]
blocked_by: [build-06]
blocks: []
---

## Parent PRD

[`spec-fast-time-entry-app.md`](../spec-fast-time-entry-app.md) · plan: [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) §6

## What to build

Optional per-entry descriptions, with the three routes settled in the prototype: (1) **inline** while
typing — `2.5 // fixed the auth bug` splits hours from note (`2.5 //` clears it; re-editing re-opens as
`hours // note`); (2) **double-click** the Cell opens a description editor; (3) **⌥Enter** keyboard
equivalent. A Cell with a note shows a dot indicator. Descriptions flow into the `POST`/`PUT` bodies as
the Entry `description`. Demoable: add a note inline, see the indicator, reload and it persists.

## Acceptance criteria

- [ ] Typing `<hours> // <text>` sets both the duration and the description in one commit.
- [ ] `<hours> //` (empty after `//`) clears the description; editing a noted Cell re-opens as
      `hours // note`.
- [ ] Double-click and ⌥Enter both open the description editor for the focused Cell.
- [ ] A Cell with a description shows a note indicator; the description round-trips through create/edit.
- [ ] Tests (seam 2): inline parse sets/clears description; editor opens via dbl-click + ⌥Enter;
      indicator shows. (seam 1): description present in POST/PUT body when set, omitted when empty.

## Blocked by

- Blocked by #build-06

## User stories addressed

23, 24, 25

---
id: build-07
title: "Build: full keyboard model + add-row picker"
mode: AFK
status: open
assignee:
labels: [ready-for-agent]
blocked_by: [build-05]
blocks: [build-09, build-10]
---

## Parent PRD

[`spec-fast-time-entry-app.md`](../spec-fast-time-entry-app.md) · plan: [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) §6

## What to build

Make the grid fully keyboard-drivable and let rows be added without the mouse. Implement the locked
key map — Arrows move; **Tab/Shift+Tab** commit + move right/left with **row wrap**; **Enter** commit +
move **down**; **Esc** cancels an edit; **Backspace/Delete** clears (via #build-06). Add the **⌘/Ctrl+K**
add-row typeahead (command-palette style: ↑↓ pick, Enter add, Esc close) over active projects→tasks,
marking rows already present. Demoable: build and fill a week entirely by keyboard.

Matches the signed-off prototype: https://claude.ai/code/artifact/7ce3ffba-c9db-4709-8654-139979c8c5a8

## Acceptance criteria

- [ ] Arrow keys move focus; Tab/Shift+Tab commit and move right/left and wrap across rows.
- [ ] Enter commits and moves down; Esc cancels the current edit and reverts.
- [ ] ⌘/Ctrl+K opens the add-row typeahead; ↑↓ select, Enter adds the Row, Esc closes.
- [ ] The picker lists only active projects/tasks and marks rows already in the grid ("already added").
- [ ] A newly added Row appears with 7 empty Cells and focus lands in it.
- [ ] The full flow is operable with **no mouse**.
- [ ] Tests (seam 2): navigation + wrap; commit-and-move directions; add-row via keyboard; already-added
      marking.

## Blocked by

- Blocked by #build-05

## User stories addressed

12, 13, 15, 16, 17, 28, 29

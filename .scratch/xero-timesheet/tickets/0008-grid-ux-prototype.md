---
id: 0008
title: "Prototype: keyboard-driven weekly grid UX (rapid entry, tab order, submit)"
type: prototype
status: closed
assignee: gavin
blocked_by: [0005]
blocks: [0010]
---

## Question

What does the fast, keyboard-first weekly grid actually look and feel like? Build a cheap throwaway
prototype (via `/prototype`) to react to, then lock the UX spec.

- **Layout:** rows = Project/Task, columns = Mon–Sun, a totals column/row. Quick project/task picker
  (typeahead) for adding rows.
- **Keyboard model:** tab/arrow movement between cells, enter-to-commit, shortcut to add a row, submit
  whole week without the mouse. Define the exact key map.
- **Entry ergonomics:** typing "1.5" or "90m" or "1h30"? Decide the accepted input formats and how a
  cell renders hours.
- **Feedback:** how saved vs dirty vs erroring cells look; where per-cell errors from Xero surface.
- **Picker speed:** how the typeahead ranks results (ties into 0007 prefill).

**Handed down from the grid-model decision (0005) — this ticket owns these UX calls:**
- **Duration input formats:** which of "1.5" / "1:30" / "90m" / "1h30" are accepted, and how a Cell
  renders hours back. (Model fixes the canonical unit as integer minutes; the *input* surface is UX.)
- **Conflict/lock affordances:** how a `conflict` Cell (Slot with 2+ Xero entries) is shown and
  *resolved/expanded*, and how an invoiced/locked read-only Cell looks. (Model fixes the states; the
  interaction is UX.)
- **Optional per-Cell note:** the interaction to open/edit a note without slowing hours entry.

Links the prototype artifact from this ticket. Output is a **UX spec**, not production code.

**Depends on 0005** (the cell↔entry model determines what a cell can hold and how edits behave) —
now closed; its ubiquitous language (Slot/Row/Cell/Entry) is the vocabulary for this prototype.

## Resolution

Locked from an interactive prototype the user drove and signed off ("Love that!").

**Prototype (throwaway asset):** https://claude.ai/code/artifact/7ce3ffba-c9db-4709-8654-139979c8c5a8
Source: `scratchpad/grid-prototype.html` (single self-contained HTML/JS, fake data, simulated saves).
To capture as a primary source, commit it to a `prototype/grid-ux` branch (see map Notes).

**Locked UX spec:**

*Layout* — rows = Project · Task (sticky left col), columns = Mon–Sun (sticky header, today
highlighted), a per-row **Total** col (sticky right) + a **Daily total** footer + grand total.
Horizontal scroll contained to the grid.

*Keyboard model (the exact key map):*
- **Arrows** move between cells; **Tab / Shift+Tab** move right/left and **wrap across rows**.
- **Type a digit / `.` / `:`** starts editing immediately (no enter-edit step).
- **Enter** = commit + move **down** (fast vertical fill of one task across the week's rows).
- **Tab** = commit + move **right**.
- **Esc** cancels an edit (reverts).
- **Backspace/Delete** on a committed cell clears it (⇒ DELETE the entry).
- **⌘/Ctrl+K** opens the add-row typeahead (command-palette style); ↑↓ pick, Enter add, Esc close.
  Rows already present are marked "already added". Plain order (no usage ranking, per 0007).

*Duration input (formats accepted):* `1.5` (decimal h), `1:30` (h:mm), `:45` (mins), `90m`, `1h30`,
`1h`. Rendered back as **decimal hours**. Heuristic **kept**: a bare integer ≥ 16 (e.g. `90`) is read
as minutes, `< 16` as hours. Invalid input → `error` cell state + inline guidance; nothing sent.

*Description / note (settled live with the user):* **two routes, one path** — (1) **inline** while
typing: `2.5 // fixed the auth bug` sets hours + description together (`//` separator; `2.5 //` clears
the note; editing re-opens as `hours // note`); (2) **double-click** a cell opens the description
editor; (3) **⌥Enter** keyboard equivalent. A cell with a note shows a dot indicator. Empty cell →
routes to hours entry first. (User reaction: "Love that!! sick!")

*Cell states & affordances:* `empty` (faint +), `editing` (accent bg), `saving` (pulse dot), `saved`,
`error` (red + `!`), `locked`/invoiced (grey, 🔒, refuses edit/delete), `conflict` (amber, `⋯`, opens
a resolve-down-to-one popover). Per-cell errors surface in the cell + status bar.

*Save model:* **live per-cell autosave** — each cell POST/PUT/DELETEs on commit; a status bar shows
sync state. **No batch "submit the week" button.** Confirmed with the user that this makes an
unresolved `conflict` cell **non-blocking** — it never holds up other cells (a point in favour of the
no-batch design). *(This confirms & keeps the grid-model's per-cell semantics from 0005.)*

**Conflict stance (confirmed):** the model's "render read-only sum + let user delete extras down to
one" is kept; user was fine leaving conflicts unresolved indefinitely.

**Handed-down items (all resolved here):** duration input formats ✓; conflict/lock affordances ✓;
optional per-cell note interaction ✓ (inline `//` + double-click + ⌥Enter).

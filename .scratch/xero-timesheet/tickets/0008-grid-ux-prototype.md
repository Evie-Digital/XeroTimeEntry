---
id: 0008
title: "Prototype: keyboard-driven weekly grid UX (rapid entry, tab order, submit)"
type: prototype
status: open
assignee:
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

Links the prototype artifact from this ticket. Output is a **UX spec**, not production code.

**Depends on 0005** (the cell↔entry model determines what a cell can hold and how edits behave).

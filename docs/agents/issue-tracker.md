# Issue tracker: Local Markdown

Issues and specs (you may know a spec as a PRD) for this repo live as markdown files under `.scratch/`.
There is no remote issue tracker. The convention below reflects what is already in use in
`.scratch/xero-timesheet/`.

## Conventions

- One feature/effort per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec-<slug>.md` (a `spec*.md` file in the feature directory)
- Implementation tickets are one file per ticket at `.scratch/<feature-slug>/tickets/<NNNN>-<slug>.md`,
  numbered from `0001` — never a single combined tickets file
- Each ticket carries **YAML frontmatter** at the top:
  ```yaml
  ---
  id: 0001
  title: "…"
  type: research | prototype | grilling | task   # wayfinder ticket type (optional otherwise)
  status: open | in-progress | closed
  assignee:            # the dev/agent driving it; empty = unclaimed
  labels: [ready-for-agent]   # triage roles, see triage-labels.md
  blocked_by: [0002]   # ids that must be closed first
  blocks: [0010]
  ---
  ```
- Triage state is the `status:` line plus `labels:` in the frontmatter (role strings from
  `triage-labels.md`)
- The question/body follows the frontmatter; the resolution is appended under a `## Resolution`
  heading; general conversation appends under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory / `tickets/` subdir as
needed), with the frontmatter above and the appropriate `labels:`.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the ticket id directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md`, frontmatter `labels: [wayfinder:map]` — the Destination / Notes /
  Decisions-so-far / Not-yet-specified / Out-of-scope body.
- **Child ticket**: `.scratch/<effort>/tickets/<NNNN>-<slug>.md`, numbered from `0001`, question in the
  body. The `type:` frontmatter records the ticket type (`research`/`prototype`/`grilling`/`task`); the
  `status:` field records `open`/`in-progress`/`closed`.
- **Blocking**: the `blocked_by: [NNNN, …]` frontmatter list. A ticket is unblocked when every id it
  lists is `closed`.
- **Frontier**: scan `.scratch/<effort>/tickets/` for tickets that are open, unblocked, and have an
  empty `assignee`; first by number wins.
- **Claim**: set `assignee:` (and `status: in-progress`) and save before any work.
- **Resolve**: append the answer under a `## Resolution` heading, set `status: closed`, then append a
  context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

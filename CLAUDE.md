# Xero Projects — Fast Time-Entry App

Single-user, local-only Next.js app for logging, editing, and deleting time in Xero Projects through a
keyboard-driven weekly grid. The build plan lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md); the
decision trail and implementation spec live under `.scratch/xero-timesheet/`.

## Agent skills

### Issue tracker

Issues and specs live as local markdown under `.scratch/<feature>/` (no remote). See
`docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
`wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

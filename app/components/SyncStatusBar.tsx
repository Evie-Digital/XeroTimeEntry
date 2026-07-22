"use client";

// The sync status bar (ARCHITECTURE §6 save model: "live per-cell autosave …
// a status bar shows sync state"; designed in ticket 0008 — "Per-cell errors
// surface in the cell + status bar"). One quiet line under the grid that
// AGGREGATES every per-cell write mutation into a single answer to "is my
// week on Xero yet?":
//
//   • ≥1 write in flight (incl. the auto-retry backoff window, slice #10)
//       → "Saving…" (with the count when several Cells save at once)
//   • ≥1 write whose retries are EXHAUSTED → "N save(s) failed" (red, matching
//     the Cells' own error affordance; each such Cell also shows its `!`)
//   • otherwise → "All changes saved"
//
// Derivation: the per-cell mutations are plain `useMutation`s (hooks/
// timeEntries.ts) — every `mutate()` lands a Mutation in the shared
// QueryClient's MutationCache, so `useMutationState` observes them all
// without any wiring through the grid. Reading the CACHE (not per-Cell
// props) keeps this component fully decoupled from GridCell's phase machine.

import { useMutationState, type Mutation } from "@tanstack/react-query";

/**
 * Scope filter: only this app's time-entry writes. The write hooks don't set
 * a `mutationKey`, but every write payload (create / update / delete —
 * hooks/timeEntries.ts) carries a `projectId`, so match on that shape. Today
 * ALL mutations are time-entry writes, but scoping here means a future
 * unrelated mutation can't leak into the "Saving…"/failed counts.
 */
function isTimeEntryWrite(mutation: Mutation<unknown, Error, unknown, unknown>) {
  const vars: unknown = mutation.state.variables;
  return typeof vars === "object" && vars !== null && "projectId" in vars;
}

export function SyncStatusBar() {
  // `status: "pending"` covers the whole in-flight window — first attempt AND
  // the bounded auto-retry backoff (ticket 0011) — so a retrying `pending`
  // Cell still reads as "Saving…" here. `select` narrows each result to the
  // status string so re-renders track count changes, not every state tick.
  const saving = useMutationState({
    filters: { status: "pending", predicate: isTimeEntryWrite },
    select: (mutation) => mutation.state.status,
  }).length;
  // `error` = retries exhausted (writeShouldRetry gave up) — the Cell shows
  // `!` and waits for a manual re-commit; we surface the aggregate count.
  const failed = useMutationState({
    filters: { status: "error", predicate: isTimeEntryWrite },
    select: (mutation) => mutation.state.status,
  }).length;

  // In-flight wins over stale failures: while a re-commit is retrying, show
  // progress rather than the old failure it is about to supersede.
  const label =
    saving > 0
      ? saving > 1
        ? `Saving ${saving}…`
        : "Saving…"
      : failed > 0
        ? `${failed} save${failed === 1 ? "" : "s"} failed`
        : "All changes saved";

  return (
    <p
      data-testid="sync-status"
      role="status"
      className={`text-xs opacity-70 tabular-nums ${
        saving === 0 && failed > 0 ? "text-red-600 dark:text-red-400" : ""
      }`}
    >
      {label}
    </p>
  );
}

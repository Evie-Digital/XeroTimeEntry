"use client";

// Conflict resolution (slice #10, ARCHITECTURE §2). A Slot holding 2+ Xero
// Entries renders read-only as `conflict` (the summed hours + a ⋯ marker) — the
// grid never edits it and never creates a second Entry in a Slot. This gives
// the ONE escape hatch the model allows: expand the Cell to see its underlying
// Entries and DELETE the extras "down to one". When a single Entry remains the
// week refetch re-derives the Slot as an ordinary editable `saved` Cell and this
// resolver unmounts. Deletes reuse `useDeleteTimeEntry` (same invalidate-on-
// success + bounded auto-retry as every other write); an unresolved conflict
// blocks only its own Cell (the grid's save model is per-Cell).

import { useState } from "react";
import { useDeleteTimeEntry } from "../hooks/timeEntries";
import { formatHours } from "@/lib/week/grid";
import type { Slot } from "@/lib/week/types";

export function ConflictResolver({
  slot,
  from,
  to,
  register,
  tabIndex,
  onFocus,
  onKeyDown,
}: {
  slot: Slot;
  from: string;
  to: string;
  /** Roving-focus registration for the (focusable) expand button. */
  register: (el: HTMLElement | null) => void;
  tabIndex: number;
  onFocus: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const del = useDeleteTimeEntry(from, to);
  const cellId = `${slot.projectId}-${slot.taskId}-${slot.date}`;

  return (
    <span className="relative inline-flex items-center">
      <span className="tabular-nums">{formatHours(slot.minutes)}</span>
      <button
        ref={register}
        type="button"
        data-testid={`conflict-expand-${cellId}`}
        aria-label="Multiple entries in Xero — resolve conflict"
        aria-expanded={open}
        tabIndex={tabIndex}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onClick={() => setOpen((o) => !o)}
        className="ml-1 rounded px-1 outline-none focus:ring-1 focus:ring-black/20 dark:focus:ring-white/20"
      >
        ⋯
      </button>

      {open && (
        <ul
          role="list"
          data-testid={`conflict-list-${cellId}`}
          className="absolute left-0 top-full z-10 mt-1 min-w-40 rounded border border-black/15 bg-white p-1 text-left shadow-md dark:border-white/20 dark:bg-neutral-900"
        >
          {slot.entries.map((entry) => (
            <li
              key={entry.timeEntryId}
              className="flex items-center justify-between gap-2 px-1 py-0.5"
            >
              <span className="tabular-nums">
                {formatHours(entry.duration)}
                {entry.description ? (
                  <span className="ml-1 opacity-70">— {entry.description}</span>
                ) : null}
              </span>
              <button
                type="button"
                data-testid={`conflict-delete-${entry.timeEntryId}`}
                aria-label={`Delete ${formatHours(entry.duration)} hour entry${
                  entry.description ? ` — ${entry.description}` : ""
                }`}
                disabled={del.isPending}
                onClick={() =>
                  del.mutate({
                    timeEntryId: entry.timeEntryId,
                    projectId: slot.projectId,
                  })
                }
                className="rounded border border-black/15 px-1.5 text-xs text-red-600 hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:text-red-400 dark:hover:bg-white/10"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

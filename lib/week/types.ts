// lib/week/types.ts — the shared data shapes for the weekly grid (ARCHITECTURE
// §2). Used by BOTH the server route (`/api/week`) and the client (the
// `useWeek` hook + grid), so it lives in a plain (non-"use client") module.
//
// STABLE CONTRACT for later slices:
//   #05 create  → an empty Slot + hours becomes a POST.
//   #06 edit/delete → a `saved` Slot's single Entry is PUT/DELETE'd.
//   #07 keyboard, #09 prefill → navigate/seed Rows.
// Keep these shapes additive; renaming breaks the write slices.

/** Xero time-entry status. `ACTIVE` is editable; anything else is read-only. */
export type EntryStatus = "ACTIVE" | "INVOICED" | "LOCKED" | (string & {});

/**
 * A Xero time Entry, enriched by `/api/week` so the grid can render
 * human-readable rows without a second round-trip. `projectName` comes free
 * from the projects list during the fan-out; `taskName` is resolved server-side
 * (see the route). `dateUtc` is Xero's raw ISO string — bucket by its VERBATIM
 * date portion, never timezone-convert (ARCHITECTURE §2).
 */
export type WeekEntry = {
  timeEntryId: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
  dateUtc: string; // e.g. "2026-07-20T09:30:00Z"
  duration: number; // integer minutes (1..59940)
  description: string;
  status: EntryStatus;
};

/**
 * A Cell's render state (ARCHITECTURE §2). The read-only subset (`empty` /
 * `saved` / `locked` / `conflict`) is DERIVED from a Slot's entries by
 * `buildWeek`; the transient write states (`editing` / `saving` / `error`) are
 * held per-Cell by the grid during a create/edit (slice #05 adds create; #06
 * edit/delete and #07 keyboard reuse the same machinery). `pending` (slice #10,
 * ticket 0011) is the transient auto-retry state: a write that has FAILED at
 * least once but is still retrying with backoff (visually distinct from
 * `saving`'s first attempt and `error`'s exhausted-retries). In-memory only —
 * a reload while `pending` drops it and the grid re-fetches.
 */
export type CellState =
  | "empty"
  | "saved"
  | "locked"
  | "conflict"
  | "editing"
  | "saving"
  | "pending"
  | "error";

/**
 * The identity + contents of one grid cell: `(projectId, taskId, date)`.
 * Invariant target: ≤ 1 Entry (2+ ⇒ `conflict`). `minutes` is the summed
 * duration of `entries` (0 when empty).
 */
export type Slot = {
  projectId: string;
  taskId: string;
  date: string; // "YYYY-MM-DD" — a pure calendar date
  entries: WeekEntry[]; // 0, 1, or 2+ (conflict)
  minutes: number; // summed duration across entries
  state: CellState;
};

/** A `(projectId, taskId)` pairing across the week's 7 Slots. */
export type Row = {
  projectId: string;
  taskId: string;
  projectName: string;
  taskName: string;
  label: string; // "Project · Task"
  slots: Slot[]; // exactly 7, aligned to the week's dates (Mon–Sun)
  totalMinutes: number; // sum across the 7 slots
};

/** The fully-derived week: Rows plus the footer totals. */
export type WeekModel = {
  dates: string[]; // 7 pure dates, Mon–Sun
  rows: Row[];
  dailyTotals: number[]; // 7, aligned to `dates`
  grandTotal: number;
};

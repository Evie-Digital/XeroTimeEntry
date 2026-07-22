"use client";

// The weekly grid (ARCHITECTURE §2/§6). Rows = distinct (projectId, taskId)
// present in the week, columns = Mon–Sun, per-row Total, a Daily-total footer +
// grand total, today highlighted. Durations show as decimal hours. Read-only
// Cells: `saved`, `locked` (invoiced/non-ACTIVE Entry) and `conflict` (2+
// Entries in a Slot, summed with a ⋯ marker).
//
// SLICE #05 (create): an `empty` Slot is the editable surface — it renders an
// input; typing → `editing`, Enter → parse → POST → `saving` → `saved` (see
// GridCell). #06 makes `saved` Cells editable (PUT/DELETE); #07 adds keyboard
// nav — both reuse GridCell's phase machine + the `useCreateTimeEntry` shape.
//
// Each day <td> is a self-contained `<GridCell>` carrying its full `Slot`
// (projectId, taskId, date, entries, minutes, state) and is addressable by
// `data-testid="cell-{pid}-{tid}-{date}"` with the live state on `data-state`.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWeek } from "../hooks/week";
import { ApiError } from "../hooks/lists";
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useUpdateTimeEntry,
} from "../hooks/timeEntries";
import { buildWeek, formatHours, rowKey, type ExtraRow } from "@/lib/week/grid";
import { dayLabel, slotDateUtc, todayIso, weekDates } from "@/lib/week/dates";
import { parseDuration } from "@/lib/week/duration";
import type { CellState, Slot } from "@/lib/week/types";
import {
  GridNavProvider,
  useGridNav,
  useRovingFocus,
} from "./gridNav";
import { AddRowPicker } from "./AddRowPicker";

type Status = { authenticated: boolean };

/** Auth-gated section for the home page: resolves the current week + guards on
 *  auth (dedupes the ["auth-status"] query with <AuthStatus/>). */
export function WeekGridSection() {
  const { data: status } = useQuery<Status>({
    queryKey: ["auth-status"],
    queryFn: async () => {
      const res = await fetch("/api/xero/status");
      if (!res.ok) throw new Error(`status check failed: ${res.status}`);
      return res.json();
    },
  });

  if (!status?.authenticated) return null;

  const dates = weekDates(todayIso());
  return <WeekGrid from={dates[0]} to={dates[6]} />;
}

export type WeekGridProps = {
  from: string; // "YYYY-MM-DD" (Monday of the week)
  to: string; // "YYYY-MM-DD" (Sunday of the week)
  /** Override "today" for deterministic tests; defaults to the local date. */
  today?: string;
  /** Seed client-side extra Rows (prefill #09 passes "copy last week" here). */
  initialExtraRows?: ExtraRow[];
};

export function WeekGrid({
  from,
  to,
  today,
  initialExtraRows,
}: WeekGridProps) {
  const { data, isPending, isError } = useWeek(from, to);
  const dates = weekDates(from);
  const todayDate = today ?? todayIso();

  // Client-side Rows added-but-not-yet-logged (add-row #07 / prefill #09).
  // UNIONed with the entry-derived Rows by `buildWeek` and de-duped by rowKey.
  const [extraRows, setExtraRows] = useState<ExtraRow[]>(
    initialExtraRows ?? [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  // rowKey of a just-added Row awaiting focus (rows sort by label, so resolve
  // its index from the rebuilt model in an effect below).
  const [focusRowKey, setFocusRowKey] = useState<string | null>(null);

  const model = buildWeek(data ?? [], dates, extraRows);
  const nav = useRovingFocus(model.rows.length, dates.length);

  // ⌘/Ctrl+K opens the add-row picker from anywhere in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPickerOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // After add-row, focus the first Cell of the newly-inserted Row once it has
  // rendered (its index only settles after the sort in `buildWeek`).
  useEffect(() => {
    if (!focusRowKey) return;
    const idx = model.rows.findIndex(
      (r) => rowKey(r.projectId, r.taskId) === focusRowKey,
    );
    if (idx >= 0) {
      nav.focusCell(idx, 0);
      setFocusRowKey(null);
    }
  }, [focusRowKey, model.rows, nav]);

  const existingRowKeys = new Set(
    model.rows.map((r) => rowKey(r.projectId, r.taskId)),
  );

  const addRow = useCallback((row: ExtraRow) => {
    const key = rowKey(row.projectId, row.taskId);
    setExtraRows((prev) =>
      prev.some((r) => rowKey(r.projectId, r.taskId) === key)
        ? prev
        : [...prev, row],
    );
    setPickerOpen(false);
    setFocusRowKey(key);
  }, []);

  if (isPending) {
    return (
      <p role="status" className="text-sm">
        Loading week…
      </p>
    );
  }
  if (isError) {
    return (
      <p role="alert" className="text-sm">
        Could not load this week.
      </p>
    );
  }

  return (
    <GridNavProvider nav={nav}>
    <div className="overflow-x-auto" data-testid="week-grid">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 bg-inherit p-2 text-left font-semibold">
              Project · Task
            </th>
            {dates.map((date) => (
              <th
                key={date}
                data-today={date === todayDate ? "true" : undefined}
                className={`p-2 text-center font-medium ${
                  date === todayDate
                    ? "bg-black/5 dark:bg-white/10"
                    : ""
                }`}
              >
                {dayLabel(date)}
              </th>
            ))}
            <th className="p-2 text-right font-semibold">Total</th>
          </tr>
        </thead>

        <tbody>
          {model.rows.length === 0 ? (
            <tr>
              <td
                colSpan={dates.length + 2}
                className="p-4 text-center opacity-60"
              >
                No time logged this week.
              </td>
            </tr>
          ) : (
            model.rows.map((row, rowIndex) => (
              <tr
                key={`${row.projectId}-${row.taskId}`}
                className="border-t border-black/10 dark:border-white/10"
              >
                <th
                  scope="row"
                  className="sticky left-0 bg-inherit p-2 text-left font-normal"
                >
                  {row.label}
                </th>
                {row.slots.map((slot, dayIndex) => (
                  <GridCell
                    key={slot.date}
                    slot={slot}
                    isToday={slot.date === todayDate}
                    from={from}
                    to={to}
                    row={rowIndex}
                    day={dayIndex}
                  />
                ))}
                <td
                  className="p-2 text-right font-medium tabular-nums"
                  data-testid={`row-total-${row.projectId}-${row.taskId}`}
                >
                  {formatHours(row.totalMinutes)}
                </td>
              </tr>
            ))
          )}
        </tbody>

        <tfoot>
          <tr className="border-t border-black/20 font-medium dark:border-white/20">
            <th scope="row" className="sticky left-0 bg-inherit p-2 text-left">
              Daily total
            </th>
            {model.dailyTotals.map((minutes, i) => (
              <td
                key={dates[i]}
                className={`p-2 text-center tabular-nums ${
                  dates[i] === todayDate ? "bg-black/5 dark:bg-white/10" : ""
                }`}
                data-testid={`daily-total-${dates[i]}`}
              >
                {formatHours(minutes)}
              </td>
            ))}
            <td
              className="p-2 text-right tabular-nums"
              data-testid="grand-total"
            >
              {formatHours(model.grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    {pickerOpen && (
      <AddRowPicker
        existingRowKeys={existingRowKeys}
        onAdd={addRow}
        onClose={() => setPickerOpen(false)}
      />
    )}
    </GridNavProvider>
  );
}

/**
 * One day Cell. `locked`/`conflict` render read-only; `empty` and `saved` are
 * the editable surfaces. A per-Cell phase machine (`idle | editing | saving |
 * error`) is layered over the derived Slot state:
 *
 *  - **empty** (slice #05 create): always shows an input. Typing → `editing`;
 *    Enter parses and, if valid & non-zero, POSTs → `saving → saved`.
 *  - **saved** (slice #06 edit/delete): at rest shows the hours as a focusable
 *    value; a keystroke distinguishes the two writes —
 *      • a digit / `.` / `:` opens the input seeded with that char (`editing`);
 *        Enter issues a full-replace **PUT** (carrying the Entry's existing
 *        taskId/dateUtc/description, changing duration) → `saving → saved`.
 *        Clearing the input to empty + Enter falls through to a **DELETE**.
 *      • Backspace / Delete (not while mid-edit-typing) issues a **DELETE** →
 *        the Slot re-derives `empty`.
 *
 * `locked`/`conflict` never enter the phase machine (no input, no keydown write)
 * so they can neither PUT nor DELETE. On any write failure the Cell rolls back
 * and shows `error`. #07 layers full keyboard nav on this same machinery; #08
 * reuses the same commit path for descriptions.
 */
function GridCell({
  slot,
  isToday,
  from,
  to,
  row,
  day,
}: {
  slot: Slot;
  isToday: boolean;
  from: string;
  to: string;
  /** Grid coordinates for the roving-focus model (§6 keyboard nav). */
  row: number;
  day: number;
}) {
  // `empty` and `saved` are writable; `locked`/`conflict` stay read-only.
  const editable = slot.state === "empty" || slot.state === "saved";
  const nav = useGridNav();
  const { register, syncActive, move } = nav;
  const isActiveCell = nav.active.row === row && nav.active.day === day;
  const create = useCreateTimeEntry(from, to);
  const update = useUpdateTimeEntry(from, to);
  const del = useDeleteTimeEntry(from, to);

  // Transient per-Cell write state, layered over the derived Slot state.
  type Phase = "idle" | "editing" | "saving" | "error";
  const [phase, setPhase] = useState<Phase>("idle");
  const [value, setValue] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // When a create lands (empty → saved) the effect below leaves editing mode.
  // Edit/delete keep `slot.state === "saved"` throughout, so those reset via
  // their mutation callbacks instead (see commit/remove).
  useEffect(() => {
    if (slot.state !== "empty") {
      setPhase("idle");
      setValue("");
      setErrorMsg(null);
    }
  }, [slot.state]);

  // Focus the input when a `saved` Cell transitions into edit mode (so the
  // seed keystroke's follow-ups land in it). Empty Cells own their own focus.
  useEffect(() => {
    if (phase === "editing" && slot.state === "saved") {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  }, [phase, slot.state]);

  const displayState: CellState = phase === "idle" ? slot.state : phase;

  function resetToIdle() {
    setPhase("idle");
    setValue("");
    setErrorMsg(null);
  }

  function saveErr(err: unknown): string {
    return err instanceof ApiError && err.code === "validation"
      ? "Xero rejected this entry."
      : "Couldn't save — try again.";
  }

  /** DELETE the saved Entry (Backspace/Delete, or clearing the input). */
  function remove() {
    const entry = slot.entries[0];
    if (!entry) return;
    setPhase("saving");
    setErrorMsg(null);
    del.mutate(
      { timeEntryId: entry.timeEntryId, projectId: slot.projectId },
      {
        onSuccess: resetToIdle, // refetch re-derives the Slot as `empty`
        onError: () => {
          setPhase("error");
          setErrorMsg("Couldn't delete — try again.");
        },
      },
    );
  }

  function commit() {
    const minutes = parseDuration(value);
    if (minutes === null) {
      setPhase("error"); // invalid — send nothing
      setErrorMsg("Enter hours like 1.5, 1:30, 90m or :45.");
      return;
    }

    if (slot.state === "saved") {
      // Editing an existing Entry: 0/empty ⇒ delete, otherwise full-replace PUT.
      const entry = slot.entries[0];
      if (minutes === 0) {
        remove();
        return;
      }
      setPhase("saving");
      setErrorMsg(null);
      update.mutate(
        {
          timeEntryId: entry.timeEntryId,
          projectId: slot.projectId,
          taskId: entry.taskId, // carried verbatim (full-replace)
          dateUtc: entry.dateUtc,
          duration: minutes, // the only edited field
          description: entry.description || undefined,
        },
        {
          onSuccess: resetToIdle, // refetch re-derives the updated Slot
          onError: (err) => {
            setPhase("error");
            setErrorMsg(saveErr(err));
          },
        },
      );
      return;
    }

    // Empty Slot: create (slice #05).
    if (minutes === 0) {
      resetToIdle(); // empty/0 in an empty Cell — nothing to create
      return;
    }
    setPhase("saving");
    setErrorMsg(null);
    create.mutate(
      {
        projectId: slot.projectId,
        taskId: slot.taskId,
        dateUtc: slotDateUtc(slot.date),
        duration: minutes,
      },
      {
        onError: (err) => {
          setPhase("error"); // roll back to empty + surface the error
          setErrorMsg(saveErr(err));
        },
        // onSuccess: the week refetch re-derives this Slot as `saved`; the
        // effect above then leaves editing mode.
      },
    );
  }

  // Register the Cell's focusable element with the roving-focus model. Stable
  // (register/row/day don't change) so the ref doesn't churn as focus moves.
  const registerInput = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      register(row, day, el);
    },
    [register, row, day],
  );
  const registerStatic = useCallback(
    (el: HTMLElement | null) => register(row, day, el),
    [register, row, day],
  );

  /**
   * The one keydown handler for every focusable surface of the Cell — it layers
   * the §6 keyboard model over the existing edit machinery:
   *   • Arrows move focus (only from a resting Cell; while typing they move the
   *     text caret so an in-progress edit isn't lost).
   *   • Tab / Shift+Tab commit the edit then move right / left, wrapping rows.
   *   • Enter commits then moves down.
   *   • Esc cancels the edit (revert).
   *   • On a resting `saved` Cell a digit/`.`/`:` seeds the editor and
   *     Backspace/Delete removes the Entry (slice #06).
   */
  function onCellKeyDown(e: React.KeyboardEvent) {
    const editing = phase === "editing";
    const k = e.key;

    if (k === "ArrowRight" || k === "ArrowLeft" || k === "ArrowUp" || k === "ArrowDown") {
      if (editing) return; // let the input caret move; keep the edit
      e.preventDefault();
      const dir =
        k === "ArrowRight"
          ? "right"
          : k === "ArrowLeft"
            ? "left"
            : k === "ArrowUp"
              ? "up"
              : "down";
      move(row, day, dir);
      return;
    }
    if (k === "Tab") {
      e.preventDefault();
      if (editing) commit();
      move(row, day, e.shiftKey ? "left" : "right", { wrap: true });
      return;
    }
    if (k === "Enter") {
      e.preventDefault();
      if (editing) commit();
      move(row, day, "down");
      return;
    }
    if (k === "Escape") {
      if (editing || phase === "error") {
        e.preventDefault();
        resetToIdle(); // cancel edit — revert to the derived state
      }
      return;
    }
    // Resting `saved` Cell only: seed the editor or delete the Entry.
    if (slot.state === "saved" && phase === "idle") {
      if (k === "Backspace" || k === "Delete") {
        e.preventDefault();
        remove();
        return;
      }
      if (/^[0-9.:]$/.test(k)) {
        e.preventDefault();
        setValue(k);
        setPhase("editing");
        setErrorMsg(null);
      }
    }
  }

  const navTabIndex = isActiveCell ? 0 : -1;
  const onFocus = () => syncActive(row, day);
  const hours = slot.minutes > 0 ? formatHours(slot.minutes) : "";
  const showInput = slot.state === "empty" || phase !== "idle";
  const showSavedValue = slot.state === "saved" && phase === "idle";

  return (
    <td
      data-testid={`cell-${slot.projectId}-${slot.taskId}-${slot.date}`}
      data-state={displayState}
      data-today={isToday ? "true" : undefined}
      className={`p-2 text-center tabular-nums ${
        isToday ? "bg-black/5 dark:bg-white/10" : ""
      } ${slot.state === "locked" ? "opacity-70" : ""}`}
    >
      {showInput ? (
        <>
          <input
            ref={registerInput}
            aria-label={`Log time for ${slot.date}`}
            value={value}
            tabIndex={navTabIndex}
            disabled={phase === "saving"}
            onFocus={onFocus}
            onChange={(e) => {
              setValue(e.target.value);
              // For a saved Cell an emptied input stays in edit mode (Enter then
              // deletes); an empty Cell drops back to idle.
              setPhase(
                e.target.value === "" && slot.state === "empty"
                  ? "idle"
                  : "editing",
              );
              if (errorMsg) setErrorMsg(null);
            }}
            onKeyDown={onCellKeyDown}
            className="w-14 bg-transparent text-center tabular-nums outline-none focus:ring-1 focus:ring-black/20 dark:focus:ring-white/20"
          />
          {phase === "error" && errorMsg && (
            <span
              role="alert"
              title={errorMsg}
              data-cell-error
              className="ml-1 text-red-600 dark:text-red-400"
            >
              !
            </span>
          )}
        </>
      ) : showSavedValue ? (
        <span
          ref={registerStatic}
          role="button"
          tabIndex={navTabIndex}
          aria-label={`Edit time for ${slot.date}`}
          onFocus={onFocus}
          onKeyDown={onCellKeyDown}
          className="cursor-text outline-none focus:ring-1 focus:ring-black/20 dark:focus:ring-white/20"
        >
          {hours}
        </span>
      ) : (
        // Read-only `locked`/`conflict`: still focusable so arrow/Tab nav can
        // move ACROSS it, but no role/affordance and its keydown never writes.
        <span
          ref={registerStatic}
          tabIndex={navTabIndex}
          onFocus={onFocus}
          onKeyDown={onCellKeyDown}
          className="outline-none focus:ring-1 focus:ring-black/20 dark:focus:ring-white/20"
        >
          <span>{hours}</span>
          {slot.state === "locked" && (
            <span
              aria-label="locked"
              title="Invoiced — read-only"
              className="ml-1"
            >
              🔒
            </span>
          )}
          {slot.state === "conflict" && (
            <span
              aria-label="conflict"
              title="Multiple entries in Xero — read-only"
              className="ml-1"
            >
              ⋯
            </span>
          )}
        </span>
      )}
    </td>
  );
}

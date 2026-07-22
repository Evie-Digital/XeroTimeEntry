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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWeek } from "../hooks/week";
import { ApiError } from "../hooks/lists";
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useUpdateTimeEntry,
} from "../hooks/timeEntries";
import {
  buildWeek,
  distinctRows,
  formatHours,
  rowKey,
  type ExtraRow,
} from "@/lib/week/grid";
import { addRecentRow, readRecentRows } from "@/lib/week/recentRows";
import { addDays, dayLabel, slotDateUtc, todayIso, weekDates } from "@/lib/week/dates";
import { parseCellInput } from "@/lib/week/duration";
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

  return <WeekView />;
}

export type WeekViewProps = {
  /** Override "today" for deterministic tests; defaults to the local date. */
  today?: string;
};

/**
 * Week navigation (#09): owns the displayed week's ANCHOR date and derives the
 * `from`/`to` range for `WeekGrid`. Prev/Next shift the anchor by a week; "This
 * week" jumps back to today's week. The today-highlight always keys off the real
 * `today` (passed through), so it lights up only when the real today is on
 * screen. Each week `WeekGrid` seeds its own "copy last week" prefill (source A
 * = its previous week; source B = the recent-rows localStorage set).
 */
export function WeekView({ today }: WeekViewProps) {
  const todayDate = today ?? todayIso();
  const [anchor, setAnchor] = useState(todayDate);
  const dates = weekDates(anchor);
  const from = dates[0];
  const to = dates[6];
  const isThisWeek = from === weekDates(todayDate)[0];

  const btn =
    "rounded border border-black/15 px-3 py-1 text-sm hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10";

  return (
    <div className="flex flex-col gap-3">
      <nav
        aria-label="Week navigation"
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          data-testid="week-prev"
          aria-label="Previous week"
          onClick={() => setAnchor((a) => addDays(a, -7))}
          className={btn}
        >
          ← Prev
        </button>
        <button
          type="button"
          data-testid="week-today"
          onClick={() => setAnchor(todayDate)}
          disabled={isThisWeek}
          className={btn}
        >
          This week
        </button>
        <button
          type="button"
          data-testid="week-next"
          aria-label="Next week"
          onClick={() => setAnchor((a) => addDays(a, 7))}
          className={btn}
        >
          Next →
        </button>
        <span
          data-testid="week-range"
          className="ml-2 text-sm opacity-70 tabular-nums"
        >
          {dayLabel(from)} – {dayLabel(to)}
        </span>
      </nav>
      <WeekGrid from={from} to={to} today={todayDate} />
    </div>
  );
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

  // Prefill "copy last week" (#09, ARCHITECTURE §6). Source A: the distinct
  // (projectId, taskId) Rows from the PREVIOUS week's entries — fetched via the
  // same `/api/week` route/hook. Source B: the recent-rows localStorage set
  // (Rows added-but-not-yet-logged). Both are DERIVED (not state) so they seed
  // per displayed week automatically as `from` changes, and re-read when the
  // previous week resolves — while user-added Rows live in `extraRows` below.
  const prevDates = useMemo(() => weekDates(addDays(from, -7)), [from]);
  const prevWeek = useWeek(prevDates[0], prevDates[6]);
  const seedRows = useMemo<ExtraRow[]>(() => {
    const merged = new Map<string, ExtraRow>();
    for (const r of [
      ...distinctRows(prevWeek.data ?? []),
      ...readRecentRows(),
    ]) {
      merged.set(rowKey(r.projectId, r.taskId), r);
    }
    return [...merged.values()];
    // `prevWeek.data` changes whenever `from` does (its query key is derived
    // from `from`), so it alone re-seeds — and re-reads recent-rows — per week.
  }, [prevWeek.data]);

  // Client-side Rows added-but-not-yet-logged (add-row #07 / prefill #09).
  // UNIONed with the seed + entry-derived Rows by `buildWeek`, de-duped by rowKey.
  const [extraRows, setExtraRows] = useState<ExtraRow[]>(
    initialExtraRows ?? [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  // rowKey of a just-added Row awaiting focus (rows sort by label, so resolve
  // its index from the rebuilt model in an effect below).
  const [focusRowKey, setFocusRowKey] = useState<string | null>(null);

  const model = buildWeek(data ?? [], dates, [...seedRows, ...extraRows]);
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
    // Source B: remember the Row so it carries into future weeks' seeds even
    // before any time is logged to it (prefill #09).
    addRecentRow(row);
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
    // #08: parse hours AND an optional inline `//` description in one go.
    const parsed = parseCellInput(value);
    if (parsed === null) {
      setPhase("error"); // invalid — send nothing
      setErrorMsg("Enter hours like 1.5, 1:30, 90m or :45.");
      return;
    }
    const { minutes, description } = parsed;

    if (slot.state === "saved") {
      // Editing an existing Entry: 0/empty ⇒ delete, otherwise full-replace PUT.
      const entry = slot.entries[0];
      if (minutes === 0) {
        remove();
        return;
      }
      // `description` is `undefined` when no `//` was typed → carry the Entry's
      // existing note verbatim (full-replace). `"2.5 //"` clears it (""); the
      // write layer omits a falsy description, so a full-replace drops the note.
      const nextDescription =
        description === undefined
          ? entry.description || undefined
          : description || undefined;
      setPhase("saving");
      setErrorMsg(null);
      update.mutate(
        {
          timeEntryId: entry.timeEntryId,
          projectId: slot.projectId,
          taskId: entry.taskId, // carried verbatim (full-replace)
          dateUtc: entry.dateUtc,
          duration: minutes,
          description: nextDescription,
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
        description: description || undefined, // include only when non-empty
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

  /**
   * Open the inline description editor (slice #08 routes 2 & 3: ⌥Enter or
   * double-click). Reuses the Cell's own input + `commit()` path rather than a
   * separate popover: a `saved` Cell re-seeds the input as `"<hours> // <note>"`
   * so the note is editable inline (Enter → PUT). An `empty` Cell has no Entry
   * to annotate — a note needs hours first — so we just focus its (always-
   * present) input, ready for `"2.5 // note"`. `locked`/`conflict` never open.
   */
  function openNoteEditor() {
    if (slot.state === "locked" || slot.state === "conflict") return;
    if (slot.state === "empty") {
      inputRef.current?.focus(); // gentle guidance: enter hours (+ // note) here
      return;
    }
    const entry = slot.entries[0];
    const hours = slot.minutes > 0 ? formatHours(slot.minutes) : "";
    setValue(`${hours} // ${entry?.description ?? ""}`);
    setPhase("editing");
    setErrorMsg(null);
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

    // ⌥Enter (Alt+Enter) opens the inline description editor (slice #08).
    if (e.altKey && k === "Enter") {
      e.preventDefault();
      if (!editing) openNoteEditor();
      return;
    }

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
  // A single-Entry Slot's inline note drives the dot indicator (slice #08).
  const note = slot.entries.length === 1 ? slot.entries[0].description : "";

  // The dot indicator for a Cell whose Entry carries a description (accessible:
  // `aria-label`/`title` reveal the note text). Shown on `saved`/`locked` Cells.
  const noteDot = note ? (
    <span
      data-note-indicator
      aria-label={`Note: ${note}`}
      title={note}
      className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle opacity-60"
    />
  ) : null;

  return (
    <td
      data-testid={`cell-${slot.projectId}-${slot.taskId}-${slot.date}`}
      data-state={displayState}
      data-today={isToday ? "true" : undefined}
      onDoubleClick={editable ? openNoteEditor : undefined}
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
          {noteDot}
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
          {noteDot}
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

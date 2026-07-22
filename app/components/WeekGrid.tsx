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

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWeek } from "../hooks/week";
import { ApiError } from "../hooks/lists";
import { useCreateTimeEntry } from "../hooks/timeEntries";
import { buildWeek, formatHours } from "@/lib/week/grid";
import { dayLabel, slotDateUtc, todayIso, weekDates } from "@/lib/week/dates";
import { parseDuration } from "@/lib/week/duration";
import type { CellState, Slot } from "@/lib/week/types";

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
};

export function WeekGrid({ from, to, today }: WeekGridProps) {
  const { data, isPending, isError } = useWeek(from, to);
  const dates = weekDates(from);
  const todayDate = today ?? todayIso();

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

  const model = buildWeek(data ?? [], dates);

  return (
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
            model.rows.map((row) => (
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
                {row.slots.map((slot) => (
                  <GridCell
                    key={slot.date}
                    slot={slot}
                    isToday={slot.date === todayDate}
                    from={from}
                    to={to}
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
  );
}

/**
 * One day Cell. `locked`/`conflict`/`saved` render read-only (edit is #06); an
 * `empty` Slot is the editable surface (slice #05 create). Typing enters an
 * `editing` state, Enter parses the input and — if valid & non-zero — POSTs via
 * the create mutation: `editing → saving → saved` (the week refetch brings the
 * new Entry back into this Slot). Invalid input → `error`, nothing sent; a
 * failed POST rolls back to `empty` and shows `error`. #07 layers full keyboard
 * nav on top of this same machinery.
 */
function GridCell({
  slot,
  isToday,
  from,
  to,
}: {
  slot: Slot;
  isToday: boolean;
  from: string;
  to: string;
}) {
  const editable = slot.state === "empty";
  const create = useCreateTimeEntry(from, to);

  // Transient per-Cell write state, layered over the derived Slot state.
  type Phase = "idle" | "editing" | "saving" | "error";
  const [phase, setPhase] = useState<Phase>("idle");
  const [value, setValue] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // When the Entry lands (create → invalidate → refetch), the Slot is no longer
  // empty — leave editing mode so it renders `saved`. No-op for cells that were
  // never edited (setState bails on unchanged primitives).
  useEffect(() => {
    if (slot.state !== "empty") {
      setPhase("idle");
      setValue("");
      setErrorMsg(null);
    }
  }, [slot.state]);

  const displayState: CellState = editable
    ? phase === "idle"
      ? "empty"
      : phase
    : slot.state;

  function commit() {
    const minutes = parseDuration(value);
    if (minutes === null) {
      setPhase("error"); // invalid — send nothing
      setErrorMsg("Enter hours like 1.5, 1:30, 90m or :45.");
      return;
    }
    if (minutes === 0) {
      setPhase("idle"); // empty/0 in an empty Cell — nothing to create
      setValue("");
      setErrorMsg(null);
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
          setErrorMsg(
            err instanceof ApiError && err.code === "validation"
              ? "Xero rejected this entry."
              : "Couldn't save — try again.",
          );
        },
        // onSuccess: the week refetch re-derives this Slot as `saved`; the
        // effect above then leaves editing mode.
      },
    );
  }

  const hours = slot.minutes > 0 ? formatHours(slot.minutes) : "";

  return (
    <td
      data-testid={`cell-${slot.projectId}-${slot.taskId}-${slot.date}`}
      data-state={displayState}
      data-today={isToday ? "true" : undefined}
      className={`p-2 text-center tabular-nums ${
        isToday ? "bg-black/5 dark:bg-white/10" : ""
      } ${slot.state === "locked" ? "opacity-70" : ""}`}
    >
      {editable ? (
        <>
          <input
            aria-label={`Log time for ${slot.date}`}
            value={value}
            disabled={phase === "saving"}
            onChange={(e) => {
              setValue(e.target.value);
              setPhase(e.target.value === "" ? "idle" : "editing");
              if (errorMsg) setErrorMsg(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
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
      ) : (
        <>
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
        </>
      )}
    </td>
  );
}

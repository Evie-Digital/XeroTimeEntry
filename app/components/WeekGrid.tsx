"use client";

// The read-only weekly grid (ARCHITECTURE §2/§6). Rows = distinct
// (projectId, taskId) present in the week, columns = Mon–Sun, per-row Total,
// a Daily-total footer + grand total, today highlighted. Durations show as
// decimal hours. Cells render three read-only states this slice: `saved`,
// `locked` (invoiced/non-ACTIVE Entry) and `conflict` (2+ Entries in a Slot,
// summed with a ⋯ marker). Editing/keyboard arrive in #05–#07.
//
// FOR THE WRITE SLICES (#05/#06): each day <td> is a self-contained `<GridCell>`
// carrying its full `Slot` (projectId, taskId, date, entries, minutes, state)
// via `data-*` attributes. A `saved`/`empty` Slot is the editable surface —
// swap the read-only content for an input keyed off `slot`. `locked`/`conflict`
// stay read-only. Cells are addressable by `data-testid="cell-{pid}-{tid}-{date}"`.

import { useQuery } from "@tanstack/react-query";
import { useWeek } from "../hooks/week";
import { buildWeek, formatHours } from "@/lib/week/grid";
import { dayLabel, todayIso, weekDates } from "@/lib/week/dates";
import type { Slot } from "@/lib/week/types";

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

/** One day Cell. Read-only in this slice; carries the full Slot for #05/#06. */
function GridCell({ slot, isToday }: { slot: Slot; isToday: boolean }) {
  const hours = slot.minutes > 0 ? formatHours(slot.minutes) : "";

  return (
    <td
      data-testid={`cell-${slot.projectId}-${slot.taskId}-${slot.date}`}
      data-state={slot.state}
      data-today={isToday ? "true" : undefined}
      className={`p-2 text-center tabular-nums ${
        isToday ? "bg-black/5 dark:bg-white/10" : ""
      } ${slot.state === "locked" ? "opacity-70" : ""}`}
    >
      <span>{hours}</span>
      {slot.state === "locked" && (
        <span aria-label="locked" title="Invoiced — read-only" className="ml-1">
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
    </td>
  );
}

import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithClient } from "@/test/render";
import { WeekGrid } from "./WeekGrid";
import type { WeekEntry } from "@/lib/week/types";

// Seam 2: the grid against a mocked /api/week. Proves rows × Mon–Sun render
// with correct totals, and the read-only locked/conflict states + today
// highlight all derive from the mocked entries.

const FROM = "2026-07-20"; // Monday
const TO = "2026-07-26"; // Sunday
const TODAY = "2026-07-22"; // Wednesday

function entry(over: Partial<WeekEntry>): WeekEntry {
  return {
    timeEntryId: "te",
    projectId: "proj-1",
    projectName: "Website Rebuild",
    taskId: "task-1",
    taskName: "Development",
    dateUtc: "2026-07-20T00:00:00Z",
    duration: 60,
    description: "",
    status: "ACTIVE",
    ...over,
  };
}

function mockWeek(entries: WeekEntry[]) {
  server.use(http.get("*/api/week", () => HttpResponse.json(entries)));
}

function render(entries: WeekEntry[]) {
  mockWeek(entries);
  return renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
}

describe("WeekGrid", () => {
  it("renders rows × Mon–Sun with correct row, daily, and grand totals", async () => {
    render([
      // Row A: Dev — 1.5h Mon + 2h Tue
      entry({ timeEntryId: "a1", dateUtc: "2026-07-20T09:30:00Z", duration: 90 }),
      entry({ timeEntryId: "a2", dateUtc: "2026-07-21T00:00:00Z", duration: 120 }),
      // Row B: Design — 0.5h Mon
      entry({
        timeEntryId: "b1",
        taskId: "task-2",
        taskName: "Design",
        dateUtc: "2026-07-20T00:00:00Z",
        duration: 30,
      }),
    ]);

    // Rows are labelled "Project · Task".
    expect(
      await screen.findByRole("rowheader", { name: "Website Rebuild · Development" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("rowheader", { name: "Website Rebuild · Design" }),
    ).toBeInTheDocument();

    // Seven day columns Mon–Sun.
    expect(screen.getByText("Mon 20")).toBeInTheDocument();
    expect(screen.getByText("Sun 26")).toBeInTheDocument();

    // Row totals: Dev = 3.5h, Design = 0.5h.
    expect(screen.getByTestId("row-total-proj-1-task-1")).toHaveTextContent("3.5");
    expect(screen.getByTestId("row-total-proj-1-task-2")).toHaveTextContent("0.5");

    // Daily totals: Mon = 1.5 + 0.5 = 2, Tue = 2. Grand = 4.
    expect(screen.getByTestId("daily-total-2026-07-20")).toHaveTextContent("2");
    expect(screen.getByTestId("daily-total-2026-07-21")).toHaveTextContent("2");
    expect(screen.getByTestId("grand-total")).toHaveTextContent("4");
  });

  it("buckets a non-midnight entry into the verbatim date cell (no off-by-one)", async () => {
    render([
      entry({ timeEntryId: "a1", dateUtc: "2026-07-20T09:30:00Z", duration: 90 }),
    ]);

    const cell = await screen.findByTestId("cell-proj-1-task-1-2026-07-20");
    expect(cell).toHaveTextContent("1.5");
    // The prior day (out of this week) has no cell at all — no drift.
    expect(
      screen.queryByTestId("cell-proj-1-task-1-2026-07-19"),
    ).not.toBeInTheDocument();
    // Tuesday's cell (within the week) stays empty.
    expect(
      screen.getByTestId("cell-proj-1-task-1-2026-07-21"),
    ).toHaveTextContent("");
  });

  it("renders an invoiced entry as a read-only locked cell", async () => {
    render([
      entry({
        timeEntryId: "inv",
        taskId: "task-3",
        taskName: "Invoiced Work",
        dateUtc: "2026-07-22T00:00:00Z",
        duration: 60,
        status: "INVOICED",
      }),
    ]);

    const cell = await screen.findByTestId("cell-proj-1-task-3-2026-07-22");
    expect(cell).toHaveAttribute("data-state", "locked");
    expect(within(cell).getByLabelText("locked")).toBeInTheDocument();
    expect(cell).toHaveTextContent("1"); // still shows the hours
  });

  it("renders a Slot with 2+ entries as a read-only conflict (summed)", async () => {
    render([
      entry({ timeEntryId: "c1", dateUtc: "2026-07-22T00:00:00Z", duration: 60 }),
      entry({ timeEntryId: "c2", dateUtc: "2026-07-22T08:00:00Z", duration: 30 }),
    ]);

    const cell = await screen.findByTestId("cell-proj-1-task-1-2026-07-22");
    expect(cell).toHaveAttribute("data-state", "conflict");
    expect(within(cell).getByLabelText("conflict")).toBeInTheDocument();
    // Summed: 60 + 30 = 90 min = 1.5h.
    expect(cell).toHaveTextContent("1.5");
  });

  it("highlights today's column", async () => {
    render([entry({ timeEntryId: "a1", duration: 60 })]);

    const todayCell = await screen.findByTestId("cell-proj-1-task-1-2026-07-22");
    expect(todayCell).toHaveAttribute("data-today", "true");
    // A non-today cell is not flagged.
    expect(
      screen.getByTestId("cell-proj-1-task-1-2026-07-21"),
    ).not.toHaveAttribute("data-today");
  });

  it("shows an empty-week message when there are no entries", async () => {
    render([]);
    expect(await screen.findByText("No time logged this week.")).toBeInTheDocument();
  });
});

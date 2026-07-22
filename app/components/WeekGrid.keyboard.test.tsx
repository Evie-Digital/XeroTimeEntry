import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithClient } from "@/test/render";
import { WeekGrid } from "./WeekGrid";
import type { WeekEntry } from "@/lib/week/types";

// Seam 2: the §6 keyboard model over a grid built from mocked /api/week entries.
// Arrows/Tab/Enter drive the roving-focus model; commit-and-move reuses the
// create/PUT flow (stateful /api). /api is mocked; this slice is UI-centric.

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

/** Two rows (task-1 "Development", task-2 "Design"), each a full empty week
 *  except one seed Slot on Monday so both rows exist. Sorted by label →
 *  Design (task-2) is row 0, Development (task-1) is row 1. */
function twoEmptyRows(): WeekEntry[] {
  return [
    entry({ timeEntryId: "s1", taskId: "task-1", taskName: "Development" }),
    entry({
      timeEntryId: "s2",
      taskId: "task-2",
      taskName: "Design",
      duration: 30,
    }),
  ];
}

function cellId(taskId: string, date: string) {
  return `cell-proj-1-${taskId}-${date}`;
}

/** The focusable element inside a Cell (input for empty/editing, button for
 *  a resting saved Cell). */
function focusable(cell: HTMLElement): HTMLElement {
  return (
    within(cell).queryByRole("textbox") ??
    within(cell).getByRole("button")
  );
}

function mockWeek(entries: WeekEntry[]) {
  server.use(http.get("*/api/week", () => HttpResponse.json(entries)));
}

describe("WeekGrid — keyboard navigation", () => {
  it("Arrow keys move focus between cells", async () => {
    mockWeek(twoEmptyRows());
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
    const user = userEvent.setup();

    // Start in Development (row 1) Tuesday's empty cell.
    const start = await screen.findByTestId(cellId("task-1", "2026-07-21"));
    focusable(start).focus();

    // Right → Wednesday (same row).
    await user.keyboard("{ArrowRight}");
    await waitFor(() =>
      expect(
        focusable(screen.getByTestId(cellId("task-1", "2026-07-22"))),
      ).toHaveFocus(),
    );

    // Up → Design row (row 0), Wednesday.
    await user.keyboard("{ArrowUp}");
    await waitFor(() =>
      expect(
        focusable(screen.getByTestId(cellId("task-2", "2026-07-22"))),
      ).toHaveFocus(),
    );

    // Left → Tuesday (same row).
    await user.keyboard("{ArrowLeft}");
    await waitFor(() =>
      expect(
        focusable(screen.getByTestId(cellId("task-2", "2026-07-21"))),
      ).toHaveFocus(),
    );
  });

  it("Tab wraps from the last cell of a row to the first of the next; Shift+Tab wraps back", async () => {
    mockWeek(twoEmptyRows());
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
    const user = userEvent.setup();

    // Focus the LAST cell (Sunday) of Design (row 0).
    const lastOfRow0 = await screen.findByTestId(cellId("task-2", "2026-07-26"));
    focusable(lastOfRow0).focus();

    // Tab → first cell (Monday) of the next row (Development, row 1).
    await user.keyboard("{Tab}");
    await waitFor(() =>
      expect(
        focusable(screen.getByTestId(cellId("task-1", "2026-07-20"))),
      ).toHaveFocus(),
    );

    // Shift+Tab → back to the last cell (Sunday) of Design (row 0).
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    await waitFor(() =>
      expect(
        focusable(screen.getByTestId(cellId("task-2", "2026-07-26"))),
      ).toHaveFocus(),
    );
  });

  it("Enter commits an edit and moves focus down", async () => {
    const posted: Array<Record<string, unknown>> = [];
    let weekEntries = twoEmptyRows();
    server.use(
      http.get("*/api/week", () => HttpResponse.json(weekEntries)),
      http.post("*/api/timeentries", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        posted.push(body);
        weekEntries = [
          ...weekEntries,
          entry({
            timeEntryId: "created",
            taskId: String(body.taskId),
            taskName: "Design",
            dateUtc: String(body.dateUtc),
            duration: Number(body.duration),
          }),
        ];
        return HttpResponse.json(weekEntries.at(-1), { status: 201 });
      }),
    );
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
    const user = userEvent.setup();

    // Design (row 0) Tuesday empty cell: type + Enter.
    const cell = await screen.findByTestId(cellId("task-2", "2026-07-21"));
    const input = within(cell).getByRole("textbox");
    input.focus();
    await user.keyboard("2{Enter}");

    // Commit persisted the create.
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ taskId: "task-2", duration: 120 });

    // Focus moved DOWN to Development (row 1) Tuesday.
    await waitFor(() =>
      expect(
        focusable(screen.getByTestId(cellId("task-1", "2026-07-21"))),
      ).toHaveFocus(),
    );
  });

  it("Esc cancels an edit and reverts (nothing sent)", async () => {
    const posted: Array<unknown> = [];
    mockWeek(twoEmptyRows());
    server.use(
      http.post("*/api/timeentries", async () => {
        posted.push(1);
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
    const user = userEvent.setup();

    const cell = await screen.findByTestId(cellId("task-2", "2026-07-21"));
    const input = within(cell).getByRole("textbox") as HTMLInputElement;
    input.focus();
    await user.keyboard("3.5");
    expect(cell).toHaveAttribute("data-state", "editing");

    await user.keyboard("{Escape}");

    // Reverted to the empty resting state; value cleared; no POST.
    await waitFor(() => expect(cell).toHaveAttribute("data-state", "empty"));
    expect((within(cell).getByRole("textbox") as HTMLInputElement).value).toBe("");
    expect(posted).toHaveLength(0);
  });
});

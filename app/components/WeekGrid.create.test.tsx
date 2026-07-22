import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithClient } from "@/test/render";
import { WeekGrid } from "./WeekGrid";
import type { WeekEntry } from "@/lib/week/types";

// Seam 2: type-to-create against a mocked /api (both /api/week and
// /api/timeentries). A seed entry establishes the row so an EMPTY Slot (a
// different day of that row) is the editable surface. The mock is stateful: a
// successful POST appends to the week, so the create → invalidate → refetch
// path lands the new Entry back in its Slot as `saved`.

const FROM = "2026-07-20"; // Monday
const TO = "2026-07-26"; // Sunday
const TODAY = "2026-07-22"; // Wednesday
const EMPTY_CELL = "cell-proj-1-task-1-2026-07-21"; // Tuesday — empty
const INPUT_DATE = "2026-07-21";

/** The seed Entry (Monday) that makes the proj-1/task-1 row exist. */
function seedEntry(): WeekEntry {
  return {
    timeEntryId: "seed",
    projectId: "proj-1",
    projectName: "Website Rebuild",
    taskId: "task-1",
    taskName: "Development",
    dateUtc: "2026-07-20T00:00:00Z",
    duration: 60,
    description: "",
    status: "ACTIVE",
  };
}

/** Stateful /api mocks: GET /week returns the live list; POST appends to it. */
function setupStatefulApi() {
  const posted: Array<Record<string, unknown>> = [];
  let weekEntries: WeekEntry[] = [seedEntry()];

  server.use(
    http.get("*/api/week", () => HttpResponse.json(weekEntries)),
    http.post("*/api/timeentries", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      posted.push(body);
      const created: WeekEntry = {
        timeEntryId: "te-created",
        projectId: String(body.projectId),
        projectName: "Website Rebuild",
        taskId: String(body.taskId),
        taskName: "Development",
        dateUtc: String(body.dateUtc),
        duration: Number(body.duration),
        description: String(body.description ?? ""),
        status: "ACTIVE",
      };
      weekEntries = [...weekEntries, created];
      return HttpResponse.json(created, { status: 201 });
    }),
  );

  renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
  return { posted };
}

async function typeInEmptyCell(input: string) {
  const user = userEvent.setup();
  const cell = await screen.findByTestId(EMPTY_CELL);
  await user.type(within(cell).getByRole("textbox"), `${input}{Enter}`);
}

describe("WeekGrid — create from a cell", () => {
  it("type + Enter creates an entry and the cell shows saved", async () => {
    const { posted } = setupStatefulApi();
    await typeInEmptyCell("1.5");

    // A create POST was sent for the Slot, dateUtc = midnight-UTC of the date.
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      projectId: "proj-1",
      taskId: "task-1",
      dateUtc: `${INPUT_DATE}T00:00:00Z`,
      duration: 90,
    });

    // After invalidate → refetch, the Slot re-derives as saved showing 1.5h.
    await waitFor(() =>
      expect(screen.getByTestId(EMPTY_CELL)).toHaveAttribute("data-state", "saved"),
    );
    expect(screen.getByTestId(EMPTY_CELL)).toHaveTextContent("1.5");
  });

  it.each([
    ["1.5", 90, "1.5"],
    ["1:30", 90, "1.5"],
    ["90m", 90, "1.5"],
    ["1h30", 90, "1.5"],
    [":45", 45, "0.75"],
    ["90", 90, "1.5"], // bare ≥16 → minutes
    ["8", 480, "8"], // bare <16 → hours
  ])("parses %s via cell behavior → %i min", async (input, minutes, hours) => {
    const { posted } = setupStatefulApi();
    await typeInEmptyCell(input);

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].duration).toBe(minutes);

    await waitFor(() =>
      expect(screen.getByTestId(EMPTY_CELL)).toHaveAttribute("data-state", "saved"),
    );
    expect(screen.getByTestId(EMPTY_CELL)).toHaveTextContent(hours);
  });

  it("invalid input puts the cell in error and sends nothing", async () => {
    const { posted } = setupStatefulApi();
    await typeInEmptyCell("abc");

    expect(screen.getByTestId(EMPTY_CELL)).toHaveAttribute("data-state", "error");
    expect(posted).toHaveLength(0);
  });

  it("a failed POST rolls the cell back and shows error", async () => {
    const weekEntries: WeekEntry[] = [seedEntry()];
    server.use(
      http.get("*/api/week", () => HttpResponse.json(weekEntries)),
      http.post("*/api/timeentries", () =>
        HttpResponse.json(
          { error: { code: "validation", message: "Xero rejected it." }, status: 400 },
          { status: 400 },
        ),
      ),
    );
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);

    await typeInEmptyCell("1.5");

    // Rolls back to the empty Slot but surfaces the error on the cell.
    await waitFor(() =>
      expect(screen.getByTestId(EMPTY_CELL)).toHaveAttribute("data-state", "error"),
    );
    // The underlying Slot never gained an entry.
    expect(weekEntries).toHaveLength(1);
  });
});

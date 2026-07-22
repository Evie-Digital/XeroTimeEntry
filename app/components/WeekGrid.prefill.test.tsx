import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithClient } from "@/test/render";
import { WeekGrid } from "./WeekGrid";
import { addRecentRow, readRecentRows } from "@/lib/week/recentRows";
import type { WeekEntry } from "@/lib/week/types";

// Seam 2: "copy last week" prefill against a mocked /api/week. The grid fetches
// the shown week AND its previous week (same route) and seeds the shown week's
// empty Rows from (A) the previous week's distinct (project, task) pairs and
// (B) the recent-rows localStorage set.

const FROM = "2026-07-20"; // Monday (shown week)
const TO = "2026-07-26"; // Sunday
const TODAY = "2026-07-22";
const PREV_FROM = "2026-07-13"; // previous Monday

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

/** Answer /api/week per `from`: the shown week vs the previous-week scan. */
function mockWeeks(shown: WeekEntry[], prev: WeekEntry[]) {
  server.use(
    http.get("*/api/week", ({ request }) => {
      const from = new URL(request.url).searchParams.get("from");
      if (from === PREV_FROM) return HttpResponse.json(prev);
      if (from === FROM) return HttpResponse.json(shown);
      return HttpResponse.json([]);
    }),
  );
}

function mockLists() {
  server.use(
    http.get("*/api/projects", () =>
      HttpResponse.json([{ projectId: "proj-1", name: "Website Rebuild" }]),
    ),
    http.get("*/api/projects/proj-1/tasks", () =>
      HttpResponse.json([
        { taskId: "task-1", name: "Development", status: "ACTIVE" },
        { taskId: "task-2", name: "Design", status: "ACTIVE" },
      ]),
    ),
  );
}

describe("WeekGrid — copy-last-week prefill", () => {
  it("seeds the empty week with last week's rows (cells empty & ready)", async () => {
    // Shown week has no entries; last week logged Development + Design.
    mockWeeks(
      [],
      [
        entry({ timeEntryId: "p1", duration: 60 }),
        entry({
          timeEntryId: "p2",
          taskId: "task-2",
          taskName: "Design",
          duration: 30,
        }),
      ],
    );
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);

    // Both prior-week rows appear in the (otherwise empty) shown week...
    expect(
      await screen.findByRole("rowheader", {
        name: "Website Rebuild · Development",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("rowheader", { name: "Website Rebuild · Design" }),
    ).toBeInTheDocument();

    // ...with empty, editable cells (nothing logged this week yet).
    const cell = screen.getByTestId("cell-proj-1-task-1-2026-07-20");
    expect(cell).toHaveAttribute("data-state", "empty");
    expect(within(cell).getByRole("textbox")).toBeInTheDocument();
    expect(
      screen.getByTestId("row-total-proj-1-task-1"),
    ).toHaveTextContent("0");
  });

  it("unions the recent-rows localStorage set into the seed", async () => {
    addRecentRow({
      projectId: "proj-9",
      taskId: "task-9",
      projectName: "Support Retainer",
      taskName: "Triage",
    });
    mockWeeks([], []); // no entries anywhere — only localStorage seeds

    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);

    expect(
      await screen.findByRole("rowheader", {
        name: "Support Retainer · Triage",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("cell-proj-9-task-9-2026-07-20"),
    ).toHaveAttribute("data-state", "empty");
  });

  it("adding a row via the picker persists it to localStorage", async () => {
    mockWeeks([], []);
    mockLists();
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
    const user = userEvent.setup();

    await user.keyboard("{Control>}k{/Control}");
    const picker = await screen.findByTestId("add-row-picker");
    await within(picker).findByTestId("add-row-option-proj-1");
    await user.keyboard("{Enter}"); // pick Website Rebuild
    await within(picker).findByTestId("add-row-option-task-2");
    await user.keyboard("{ArrowDown}{Enter}"); // add Design (task-2)

    await waitFor(() =>
      expect(screen.queryByTestId("add-row-picker")).not.toBeInTheDocument(),
    );
    // Persisted for future weeks' seeds (source B).
    expect(
      readRecentRows().some(
        (r) => r.projectId === "proj-1" && r.taskId === "task-2",
      ),
    ).toBe(true);
  });

  it("shows an empty grid when there is no history", async () => {
    mockWeeks([], []); // no entries, empty localStorage (cleared each test)
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);

    expect(
      await screen.findByText("No time logged this week."),
    ).toBeInTheDocument();
  });

  it("does not double a seeded row that also has an entry this week", async () => {
    // Development is both last week's row AND logged this week — one row only.
    mockWeeks(
      [entry({ timeEntryId: "this-week", duration: 90 })],
      [entry({ timeEntryId: "last-week", duration: 60 })],
    );
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);

    // Wait for the shown-week entry to derive as saved, then assert no dupe.
    await waitFor(() =>
      expect(
        screen.getByTestId("cell-proj-1-task-1-2026-07-20"),
      ).toHaveAttribute("data-state", "saved"),
    );
    expect(
      screen.getAllByTestId("row-total-proj-1-task-1"),
    ).toHaveLength(1);
  });
});

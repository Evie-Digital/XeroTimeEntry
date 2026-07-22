import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithClient } from "@/test/render";
import { WeekGrid } from "./WeekGrid";
import type { WeekEntry } from "@/lib/week/types";

// Seam 2: edit + delete a SAVED Cell against a mocked /api (GET /week +
// PUT/DELETE /api/timeentries/:id). The mocks are stateful: a PUT rewrites the
// entry's duration, a DELETE drops it — so after invalidate → refetch the Cell
// (and the totals) re-derive from the new week list.

const FROM = "2026-07-20"; // Monday
const TO = "2026-07-26"; // Sunday
const TODAY = "2026-07-22"; // Wednesday
const MON_CELL = "cell-proj-1-task-1-2026-07-20";
const WED_CELL = "cell-proj-1-task-3-2026-07-22";

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

type Put = { id: string; body: Record<string, unknown> };

/** Stateful /api: GET returns the live list; PUT rewrites, DELETE drops. */
function setupStatefulApi(initial: WeekEntry[]) {
  let weekEntries = [...initial];
  const puts: Put[] = [];
  const deletes: string[] = [];

  server.use(
    http.get("*/api/week", () => HttpResponse.json(weekEntries)),
    http.put("*/api/timeentries/:id", async ({ request, params }) => {
      const id = params.id as string;
      const body = (await request.json()) as Record<string, unknown>;
      puts.push({ id, body });
      weekEntries = weekEntries.map((e) =>
        e.timeEntryId === id
          ? {
              ...e,
              taskId: String(body.taskId),
              dateUtc: String(body.dateUtc),
              duration: Number(body.duration),
              description: String(body.description ?? ""),
            }
          : e,
      );
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete("*/api/timeentries/:id", ({ params }) => {
      const id = params.id as string;
      deletes.push(id);
      weekEntries = weekEntries.filter((e) => e.timeEntryId !== id);
      return new HttpResponse(null, { status: 204 });
    }),
  );

  renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
  return {
    puts,
    deletes,
    get entries() {
      return weekEntries;
    },
  };
}

describe("WeekGrid — edit & delete a saved cell", () => {
  it("editing a saved cell's hours issues a full-replace PUT and shows the new total", async () => {
    const api = setupStatefulApi([
      entry({ timeEntryId: "te-mon", duration: 60, description: "dev" }),
    ]);
    const user = userEvent.setup();

    // Resting saved cell shows 1h; enter edit with a digit, then commit 2.5.
    const cell = await screen.findByTestId(MON_CELL);
    await waitFor(() =>
      expect(cell).toHaveAttribute("data-state", "saved"),
    );
    await user.click(within(cell).getByRole("button"));
    await user.keyboard("2"); // seed edit mode
    await user.type(within(cell).getByRole("textbox"), ".5{Enter}");

    // A full-replace PUT for the entry, carrying taskId/dateUtc/description.
    await waitFor(() => expect(api.puts).toHaveLength(1));
    expect(api.puts[0]).toMatchObject({
      id: "te-mon",
      body: {
        projectId: "proj-1",
        taskId: "task-1",
        dateUtc: "2026-07-20T00:00:00Z",
        duration: 150,
        description: "dev",
      },
    });

    // Refetch re-derives the Slot as saved @ 2.5h; row total tracks it.
    await waitFor(() =>
      expect(screen.getByTestId(MON_CELL)).toHaveAttribute(
        "data-state",
        "saved",
      ),
    );
    expect(screen.getByTestId(MON_CELL)).toHaveTextContent("2.5");
    expect(
      screen.getByTestId("row-total-proj-1-task-1"),
    ).toHaveTextContent("2.5");
  });

  it("clearing a saved cell (Backspace) deletes the entry and drops the total", async () => {
    const api = setupStatefulApi([
      entry({ timeEntryId: "te-mon", duration: 60 }),
      entry({
        timeEntryId: "te-tue",
        dateUtc: "2026-07-21T00:00:00Z",
        duration: 120,
      }),
    ]);
    const user = userEvent.setup();

    // Row total starts at 3h (1 + 2).
    await waitFor(() =>
      expect(screen.getByTestId("row-total-proj-1-task-1")).toHaveTextContent(
        "3",
      ),
    );

    const cell = screen.getByTestId(MON_CELL);
    await user.click(within(cell).getByRole("button"));
    await user.keyboard("{Backspace}");

    // DELETE for Monday's entry; the Slot empties and the row total drops to 2.
    await waitFor(() => expect(api.deletes).toEqual(["te-mon"]));
    await waitFor(() =>
      expect(screen.getByTestId(MON_CELL)).toHaveAttribute(
        "data-state",
        "empty",
      ),
    );
    expect(
      screen.getByTestId("row-total-proj-1-task-1"),
    ).toHaveTextContent("2");
  });

  it("a locked (invoiced) cell refuses edit/delete — no affordance, no request", async () => {
    const api = setupStatefulApi([
      entry({
        timeEntryId: "te-inv",
        taskId: "task-3",
        taskName: "Invoiced Work",
        dateUtc: "2026-07-22T00:00:00Z",
        duration: 60,
        status: "INVOICED",
      }),
    ]);

    const cell = await screen.findByTestId(WED_CELL);
    expect(cell).toHaveAttribute("data-state", "locked");
    // Read-only: no editable value button, no input to type into.
    expect(within(cell).queryByRole("button")).not.toBeInTheDocument();
    expect(within(cell).queryByRole("textbox")).not.toBeInTheDocument();
    // Nothing was ever sent.
    expect(api.puts).toHaveLength(0);
    expect(api.deletes).toHaveLength(0);
  });

  it("a failed PUT rolls the cell back and shows error (nothing persisted)", async () => {
    let weekEntries: WeekEntry[] = [entry({ timeEntryId: "te-mon", duration: 60 })];
    server.use(
      http.get("*/api/week", () => HttpResponse.json(weekEntries)),
      http.put("*/api/timeentries/:id", () =>
        HttpResponse.json(
          { error: { code: "validation", message: "Xero rejected it." }, status: 400 },
          { status: 400 },
        ),
      ),
    );
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
    const user = userEvent.setup();

    const cell = await screen.findByTestId(MON_CELL);
    await waitFor(() => expect(cell).toHaveAttribute("data-state", "saved"));
    await user.click(within(cell).getByRole("button"));
    await user.keyboard("2");
    await user.type(within(cell).getByRole("textbox"), ".5{Enter}");

    // The Cell surfaces the error; the underlying entry is untouched.
    await waitFor(() =>
      expect(screen.getByTestId(MON_CELL)).toHaveAttribute(
        "data-state",
        "error",
      ),
    );
    expect(weekEntries[0].duration).toBe(60);
  });
});

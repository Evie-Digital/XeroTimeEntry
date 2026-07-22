import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithClient } from "@/test/render";
import { WeekGrid } from "./WeekGrid";
import type { WeekEntry } from "@/lib/week/types";

// Seam 2 (slice #08 descriptions): inline `//` parsing, the ⌥Enter / double-click
// note editor, and the note-dot indicator — all against a mocked /api (GET /week
// + POST/PUT /api/timeentries). The mocks are stateful so a note round-trips:
// create/PUT → invalidate → refetch re-derives the Slot (indicator on/off).

const FROM = "2026-07-20"; // Monday
const TO = "2026-07-26"; // Sunday
const TODAY = "2026-07-22"; // Wednesday
const MON_CELL = "cell-proj-1-task-1-2026-07-20";
const EMPTY_CELL = "cell-proj-1-task-1-2026-07-21"; // Tuesday — empty

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

/** Stateful /api: GET returns the live list; POST appends; PUT full-replaces. */
function setupStatefulApi(initial: WeekEntry[]) {
  let weekEntries = [...initial];
  const posted: Array<Record<string, unknown>> = [];
  const puts: Put[] = [];

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
              // A full-replace: an omitted/empty description clears the note.
              description: String(body.description ?? ""),
            }
          : e,
      );
      return new HttpResponse(null, { status: 204 });
    }),
  );

  renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
  return { posted, puts };
}

describe("WeekGrid — inline `//` descriptions", () => {
  it("typing `2.5 // fixed auth` in an empty cell creates with that description + shows the indicator", async () => {
    const { posted } = setupStatefulApi([entry({ timeEntryId: "seed" })]);
    const user = userEvent.setup();

    const cell = await screen.findByTestId(EMPTY_CELL);
    await user.type(
      within(cell).getByRole("textbox"),
      "2.5 // fixed auth{Enter}",
    );

    // The create POST carries the parsed duration AND the inline description.
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ duration: 150, description: "fixed auth" });

    // After invalidate → refetch the Slot re-derives as saved with a note dot.
    await waitFor(() =>
      expect(screen.getByTestId(EMPTY_CELL)).toHaveAttribute(
        "data-state",
        "saved",
      ),
    );
    expect(
      within(screen.getByTestId(EMPTY_CELL)).getByLabelText(/fixed auth/),
    ).toBeInTheDocument();
  });

  it("`2.5 //` (empty after //) clears an existing note", async () => {
    const { puts } = setupStatefulApi([
      entry({ timeEntryId: "te-mon", duration: 60, description: "dev" }),
    ]);
    const user = userEvent.setup();

    // The noted cell shows the indicator to start.
    const cell = await screen.findByTestId(MON_CELL);
    await waitFor(() =>
      expect(within(cell).getByLabelText(/dev/)).toBeInTheDocument(),
    );

    // Open the inline editor (double-click), wipe the note, keep the hours.
    await user.dblClick(within(cell).getByRole("button"));
    const input = within(cell).getByRole("textbox");
    await user.clear(input);
    await user.type(input, "2.5 //{Enter}");

    // A full-replace PUT was sent with a cleared (falsy) description.
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body.duration).toBe(150);
    expect(puts[0].body.description ?? "").toBe("");

    // Refetch drops the note → the indicator is gone.
    await waitFor(() =>
      expect(
        within(screen.getByTestId(MON_CELL)).queryByLabelText(/dev/),
      ).not.toBeInTheDocument(),
    );
  });

  it("editing a noted cell re-opens the input as `hours // note`", async () => {
    setupStatefulApi([
      entry({ timeEntryId: "te-mon", duration: 60, description: "dev" }),
    ]);
    const user = userEvent.setup();

    const cell = await screen.findByTestId(MON_CELL);
    await waitFor(() => expect(cell).toHaveAttribute("data-state", "saved"));

    await user.dblClick(within(cell).getByRole("button"));
    expect(within(cell).getByRole("textbox")).toHaveValue("1 // dev");
  });
});

describe("WeekGrid — the note editor opens via double-click AND ⌥Enter", () => {
  it("double-click opens the editor for a saved cell", async () => {
    setupStatefulApi([
      entry({ timeEntryId: "te-mon", duration: 60, description: "dev" }),
    ]);
    const user = userEvent.setup();

    const cell = await screen.findByTestId(MON_CELL);
    await waitFor(() => expect(cell).toHaveAttribute("data-state", "saved"));

    expect(within(cell).queryByRole("textbox")).not.toBeInTheDocument();
    await user.dblClick(within(cell).getByRole("button"));
    expect(within(cell).getByRole("textbox")).toHaveValue("1 // dev");
  });

  it("⌥Enter opens the editor for the focused saved cell", async () => {
    setupStatefulApi([
      entry({ timeEntryId: "te-mon", duration: 60, description: "dev" }),
    ]);
    const user = userEvent.setup();

    const cell = await screen.findByTestId(MON_CELL);
    await waitFor(() => expect(cell).toHaveAttribute("data-state", "saved"));

    within(cell).getByRole("button").focus();
    await user.keyboard("{Alt>}{Enter}{/Alt}");

    expect(within(cell).getByRole("textbox")).toHaveValue("1 // dev");
  });

  it("a locked cell never opens the editor (double-click is a no-op)", async () => {
    setupStatefulApi([
      entry({
        timeEntryId: "te-inv",
        duration: 60,
        description: "billed",
        status: "INVOICED",
      }),
    ]);
    const user = userEvent.setup();

    const cell = await screen.findByTestId(MON_CELL);
    expect(cell).toHaveAttribute("data-state", "locked");
    await user.dblClick(cell);
    expect(within(cell).queryByRole("textbox")).not.toBeInTheDocument();
  });
});

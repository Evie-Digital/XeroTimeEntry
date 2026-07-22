import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithClient } from "@/test/render";
import { WeekGrid } from "./WeekGrid";
import type { WeekEntry } from "@/lib/week/types";

// Seam 2: the ⌘/Ctrl+K add-row picker and manual empty rows, against a mocked
// /api. The picker reads /api/projects + /api/projects/:id/tasks; adding appends
// a manual empty Row (7 empty Slots) and focus lands in it. A manual row can
// then create an entry end-to-end via the existing POST flow.

const FROM = "2026-07-20"; // Monday
const TO = "2026-07-26"; // Sunday
const TODAY = "2026-07-22"; // Wednesday

function seed(): WeekEntry {
  // One existing row: Website Rebuild · Development (proj-1/task-1).
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

/** Open the picker (Ctrl+K), pick the project, land on its task list. */
async function openPickerToTasks(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard("{Control>}k{/Control}");
  const picker = await screen.findByTestId("add-row-picker");
  // Project stage: pick "Website Rebuild".
  await within(picker).findByTestId("add-row-option-proj-1");
  await user.keyboard("{Enter}"); // selection defaults to index 0
  // Task stage renders.
  await within(picker).findByTestId("add-row-option-task-2");
  return picker;
}

describe("WeekGrid — add-row picker (Ctrl/Cmd+K)", () => {
  it("opens the picker via the visible Add row button (shortcut shown in its label)", async () => {
    server.use(http.get("*/api/week", () => HttpResponse.json([seed()])));
    mockLists();
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
    const user = userEvent.setup();

    // The button is present once the week loads, advertises the keyboard
    // shortcut, and opens the same picker ⌘/Ctrl+K does.
    const button = await screen.findByTestId("add-row-button");
    expect(button).toHaveTextContent(/Add row/);
    expect(button).toHaveTextContent(/K$/); // "⌘K" (jsdom) or "Ctrl+K"
    expect(screen.queryByTestId("add-row-picker")).not.toBeInTheDocument();

    await user.click(button);

    const picker = await screen.findByTestId("add-row-picker");
    expect(within(picker).getByRole("listbox")).toBeInTheDocument();
  });

  it("opens the picker, marks already-added rows, and won't duplicate them", async () => {
    server.use(http.get("*/api/week", () => HttpResponse.json([seed()])));
    mockLists();
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
    const user = userEvent.setup();

    // task-1 (Development) is already a grid row → marked, non-addable.
    const picker = await openPickerToTasks(user);
    expect(
      within(picker).getByTestId("already-added-task-1"),
    ).toBeInTheDocument();

    // Selecting the already-added task adds nothing (no new row appears).
    const dev = within(picker).getByTestId("add-row-option-task-1");
    expect(dev).toHaveAttribute("aria-disabled", "true");
    await user.click(dev);
    // Picker stays open; still only the one existing row's total testid.
    expect(screen.getByTestId("add-row-picker")).toBeInTheDocument();
    expect(
      screen.queryByTestId("row-total-proj-1-task-2"),
    ).not.toBeInTheDocument();
  });

  it("↑↓ select then Enter adds a new empty row and focus lands in it", async () => {
    server.use(http.get("*/api/week", () => HttpResponse.json([seed()])));
    mockLists();
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
    const user = userEvent.setup();

    await openPickerToTasks(user);
    // Move selection down to "Design" (task-2, index 1) and add it.
    await user.keyboard("{ArrowDown}{Enter}");

    // Picker closed; the new row appears with a row-total cell.
    await waitFor(() =>
      expect(screen.queryByTestId("add-row-picker")).not.toBeInTheDocument(),
    );
    const newRowTotal = await screen.findByTestId("row-total-proj-1-task-2");
    expect(newRowTotal).toBeInTheDocument();

    // The new row has 7 empty editable cells...
    const dates = [
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
    ];
    for (const d of dates) {
      const cell = screen.getByTestId(`cell-proj-1-task-2-${d}`);
      expect(cell).toHaveAttribute("data-state", "empty");
      expect(within(cell).getByRole("textbox")).toBeInTheDocument();
    }

    // ...and focus landed in the new row's first (Monday) cell.
    await waitFor(() =>
      expect(
        within(screen.getByTestId("cell-proj-1-task-2-2026-07-20")).getByRole(
          "textbox",
        ),
      ).toHaveFocus(),
    );
  });

  it("a manually-added empty row can create an entry via the existing POST flow", async () => {
    const posted: Array<Record<string, unknown>> = [];
    let weekEntries: WeekEntry[] = [seed()];
    server.use(
      http.get("*/api/week", () => HttpResponse.json(weekEntries)),
      http.post("*/api/timeentries", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        posted.push(body);
        const created: WeekEntry = {
          timeEntryId: "te-new",
          projectId: String(body.projectId),
          projectName: "Website Rebuild",
          taskId: String(body.taskId),
          taskName: "Design",
          dateUtc: String(body.dateUtc),
          duration: Number(body.duration),
          description: "",
          status: "ACTIVE",
        };
        weekEntries = [...weekEntries, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    mockLists();
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
    const user = userEvent.setup();

    await openPickerToTasks(user);
    await user.keyboard("{ArrowDown}{Enter}"); // add "Design" (task-2)

    // Focus is already in the new row's Monday cell; type + Enter to create.
    const cell = await screen.findByTestId("cell-proj-1-task-2-2026-07-20");
    await user.type(within(cell).getByRole("textbox"), "2{Enter}");

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      projectId: "proj-1",
      taskId: "task-2",
      dateUtc: "2026-07-20T00:00:00Z",
      duration: 120,
    });

    // Refetch re-derives the Slot as saved; the manual row is not duplicated.
    await waitFor(() =>
      expect(screen.getByTestId("cell-proj-1-task-2-2026-07-20")).toHaveAttribute(
        "data-state",
        "saved",
      ),
    );
    expect(screen.getAllByTestId("row-total-proj-1-task-2")).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithClient } from "@/test/render";
import { WeekView } from "./WeekGrid";
import type { WeekEntry } from "@/lib/week/types";

// Seam 2: week navigation against a mocked /api/week that answers per-`from`.
// Prev/Next shift the week; each week loads its own entries (correct range), and
// the today-highlight lights up only when the REAL today is on screen.

const TODAY = "2026-07-22"; // Wednesday, in the week of Mon 2026-07-20.

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

// This week (Mon 07-20) has a Development entry; next week (Mon 07-27) has a
// Design entry. Every other week (incl. the previous-week prefill scans) empty.
const BY_FROM: Record<string, WeekEntry[]> = {
  "2026-07-20": [entry({ timeEntryId: "dev", duration: 60 })],
  "2026-07-27": [
    entry({
      timeEntryId: "des",
      taskId: "task-2",
      taskName: "Design",
      dateUtc: "2026-07-27T00:00:00Z",
      duration: 120,
    }),
  ],
};

function mockWeekByFrom() {
  server.use(
    http.get("*/api/week", ({ request }) => {
      const from = new URL(request.url).searchParams.get("from") ?? "";
      return HttpResponse.json(BY_FROM[from] ?? []);
    }),
  );
}

describe("WeekView — week navigation", () => {
  it("opens on today's week with today highlighted", async () => {
    mockWeekByFrom();
    renderWithClient(<WeekView today={TODAY} />);

    expect(await screen.findByText("Mon 20 – Sun 26")).toBeInTheDocument();
    // This week's Development entry renders.
    const cell = await screen.findByTestId("cell-proj-1-task-1-2026-07-20");
    expect(cell).toHaveTextContent("1");
    // Today's column (Wed 07-22) is highlighted.
    expect(
      screen.getByTestId("cell-proj-1-task-1-2026-07-22"),
    ).toHaveAttribute("data-today", "true");
  });

  it("Next loads the following week (correct range + entries, no today highlight)", async () => {
    mockWeekByFrom();
    renderWithClient(<WeekView today={TODAY} />);
    const user = userEvent.setup();

    await screen.findByTestId("cell-proj-1-task-1-2026-07-20");
    await user.click(screen.getByTestId("week-next"));

    // Range moved a week forward and the Design entry (task-2) loads.
    expect(await screen.findByText("Mon 27 – Sun 2")).toBeInTheDocument();
    const cell = await screen.findByTestId("cell-proj-1-task-2-2026-07-27");
    expect(cell).toHaveTextContent("2");
    // The real today is not on screen anymore → nothing highlighted.
    expect(document.querySelectorAll('[data-today="true"]')).toHaveLength(0);
  });

  it("Prev then This-week returns to today's week", async () => {
    mockWeekByFrom();
    renderWithClient(<WeekView today={TODAY} />);
    const user = userEvent.setup();

    await screen.findByTestId("cell-proj-1-task-1-2026-07-20");

    // Prev → the empty week of Mon 07-13.
    await user.click(screen.getByTestId("week-prev"));
    expect(await screen.findByText("Mon 13 – Sun 19")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("No time logged this week."),
      ).toBeInTheDocument(),
    );

    // This week → back to Mon 07-20 with the Development entry.
    await user.click(screen.getByTestId("week-today"));
    expect(await screen.findByText("Mon 20 – Sun 26")).toBeInTheDocument();
    const cell = await screen.findByTestId("cell-proj-1-task-1-2026-07-20");
    expect(within(cell).getByText("1")).toBeInTheDocument();
  });

  it("⌘/Ctrl+] advances a week and ⌘/Ctrl+\\ returns to this week", async () => {
    mockWeekByFrom();
    renderWithClient(<WeekView today={TODAY} />);

    await screen.findByTestId("cell-proj-1-task-1-2026-07-20");

    // ⌘/Ctrl+] → next week (the window listener handles it, no button click).
    fireEvent.keyDown(window, { key: "]", ctrlKey: true });
    expect(await screen.findByText("Mon 27 – Sun 2")).toBeInTheDocument();
    expect(
      await screen.findByTestId("cell-proj-1-task-2-2026-07-27"),
    ).toHaveTextContent("2");

    // ⌘/Ctrl+\ → jump straight back to today's week.
    fireEvent.keyDown(window, { key: "\\", ctrlKey: true });
    expect(await screen.findByText("Mon 20 – Sun 26")).toBeInTheDocument();
    await screen.findByTestId("cell-proj-1-task-1-2026-07-20");
  });

  it("⌘/Ctrl+[ steps back a week", async () => {
    mockWeekByFrom();
    renderWithClient(<WeekView today={TODAY} />);

    await screen.findByTestId("cell-proj-1-task-1-2026-07-20");

    fireEvent.keyDown(window, { key: "[", metaKey: true });
    expect(await screen.findByText("Mon 13 – Sun 19")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("No time logged this week.")).toBeInTheDocument(),
    );
  });

  it("surfaces each week-nav shortcut in its button label", async () => {
    mockWeekByFrom();
    renderWithClient(<WeekView today={TODAY} />);

    // The bracket/backslash key rides in each button's <kbd> regardless of the
    // ⌘-vs-Ctrl platform prefix.
    expect(await screen.findByTestId("week-prev")).toHaveTextContent("[");
    expect(screen.getByTestId("week-next")).toHaveTextContent("]");
    expect(screen.getByTestId("week-today")).toHaveTextContent("\\");
  });
});

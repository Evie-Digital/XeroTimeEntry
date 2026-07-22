import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithClient } from "@/test/render";
import { WeekGrid } from "./WeekGrid";
import type { WeekEntry } from "@/lib/week/types";

// Slice #10 — Seam 2. A transient write failure shows the Cell as `pending`
// (auto-retrying with backoff), then reaches `saved` on recovery or `error`
// when retries are exhausted. A `conflict` Cell can be resolved down to one
// entry (→ editable), and an unresolved conflict blocks only its own Cell.

const FROM = "2026-07-20"; // Monday
const TO = "2026-07-26"; // Sunday
const TODAY = "2026-07-22"; // Wednesday
const EMPTY_CELL = "cell-proj-1-task-1-2026-07-21"; // Tuesday — empty
const MON_CELL = "cell-proj-1-task-1-2026-07-20"; // Monday

function seedEntry(over: Partial<WeekEntry> = {}): WeekEntry {
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
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Transient-failure resilience (fake timers so backoff is fast + deterministic)
// ---------------------------------------------------------------------------

describe("WeekGrid — transient-failure resilience (pending → saved/error)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function flush(ms = 0) {
    await act(() => vi.advanceTimersByTimeAsync(ms));
  }

  /** Commit a value into a Cell's input synchronously (userEvent deadlocks
   *  under fake timers, so drive the DOM directly). */
  function commitInto(testid: string, value: string) {
    const input = within(screen.getByTestId(testid)).getByRole("textbox");
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: "Enter" });
  }

  it("a transiently-failing write shows `pending`, auto-retries, then `saved`", async () => {
    let posts = 0;
    let weekEntries: WeekEntry[] = [seedEntry()];
    server.use(
      http.get("*/api/week", () => HttpResponse.json(weekEntries)),
      http.post("*/api/timeentries", async ({ request }) => {
        posts++;
        if (posts === 1) {
          // First attempt: a transient upstream 5xx → retryable.
          return HttpResponse.json(
            { error: { code: "upstream", message: "Xero 502" }, status: 502 },
            { status: 502 },
          );
        }
        const body = (await request.json()) as Record<string, unknown>;
        const created: WeekEntry = {
          timeEntryId: "te-created",
          projectId: String(body.projectId),
          projectName: "Website Rebuild",
          taskId: String(body.taskId),
          taskName: "Development",
          dateUtc: String(body.dateUtc),
          duration: Number(body.duration),
          description: "",
          status: "ACTIVE",
        };
        weekEntries = [...weekEntries, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
    await flush();

    commitInto(EMPTY_CELL, "1.5");

    // First attempt fires and fails → Cell is `pending` (not `saving`/`error`).
    await flush();
    expect(posts).toBe(1);
    expect(screen.getByTestId(EMPTY_CELL)).toHaveAttribute(
      "data-state",
      "pending",
    );
    expect(
      within(screen.getByTestId(EMPTY_CELL)).getByRole("status"),
    ).toBeInTheDocument();

    // Backoff elapses → retry succeeds → invalidate → refetch → `saved`.
    await flush(600); // 500ms retry backoff + settle
    await flush(50); // settle the invalidate → refetch
    expect(posts).toBe(2);
    expect(screen.getByTestId(EMPTY_CELL)).toHaveAttribute(
      "data-state",
      "saved",
    );
  });

  it("falls to `error` when retries are exhausted (nothing persisted)", async () => {
    let posts = 0;
    const weekEntries: WeekEntry[] = [seedEntry()];
    server.use(
      http.get("*/api/week", () => HttpResponse.json(weekEntries)),
      http.post("*/api/timeentries", () => {
        posts++;
        return HttpResponse.json(
          { error: { code: "upstream", message: "Xero 502" }, status: 502 },
          { status: 502 },
        );
      }),
    );

    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
    await flush();

    commitInto(EMPTY_CELL, "1.5");

    // First failure → pending.
    await flush();
    expect(screen.getByTestId(EMPTY_CELL)).toHaveAttribute(
      "data-state",
      "pending",
    );

    // Exhaust the bounded backoff window (500 + 1000 + 2000 ms of backoff);
    // one generous advance chains every scheduled retry.
    await flush(10_000);

    expect(screen.getByTestId(EMPTY_CELL)).toHaveAttribute(
      "data-state",
      "error",
    );
    // 1 initial + 3 retries = 4 attempts, then it gives up.
    expect(posts).toBe(4);
    // The week never gained an entry.
    expect(weekEntries).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Conflict resolution (real timers — deletes resolve immediately)
// ---------------------------------------------------------------------------

describe("WeekGrid — conflict resolution (resolve down to one)", () => {
  /** Two Entries in ONE Slot (Monday) ⇒ that Slot renders `conflict`. */
  function conflictWeek(): WeekEntry[] {
    return [
      seedEntry({ timeEntryId: "te-a", duration: 60, description: "morning" }),
      seedEntry({ timeEntryId: "te-b", duration: 120, description: "afternoon" }),
    ];
  }

  function setupStatefulApi(initial: WeekEntry[]) {
    let weekEntries = [...initial];
    const deletes: string[] = [];
    const posts: Array<Record<string, unknown>> = [];
    server.use(
      http.get("*/api/week", () => HttpResponse.json(weekEntries)),
      http.delete("*/api/timeentries/:id", ({ params }) => {
        const id = params.id as string;
        deletes.push(id);
        weekEntries = weekEntries.filter((e) => e.timeEntryId !== id);
        return new HttpResponse(null, { status: 204 });
      }),
      http.post("*/api/timeentries", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        posts.push(body);
        const created: WeekEntry = {
          timeEntryId: "te-new",
          projectId: String(body.projectId),
          projectName: "Website Rebuild",
          taskId: String(body.taskId),
          taskName: "Development",
          dateUtc: String(body.dateUtc),
          duration: Number(body.duration),
          description: "",
          status: "ACTIVE",
        };
        weekEntries = [...weekEntries, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
    return { deletes, posts };
  }

  it("expands a conflict, deletes an extra entry, and the cell becomes editable `saved`", async () => {
    const api = setupStatefulApi(conflictWeek());
    const user = userEvent.setup();

    // The Monday Slot is a read-only conflict summing both entries (3h).
    const cell = await screen.findByTestId(MON_CELL);
    await waitFor(() => expect(cell).toHaveAttribute("data-state", "conflict"));
    expect(within(cell).queryByRole("textbox")).not.toBeInTheDocument();

    // Expand → the underlying entries are listed with per-entry delete buttons.
    await user.click(
      screen.getByTestId("conflict-expand-proj-1-task-1-2026-07-20"),
    );
    expect(
      screen.getByTestId("conflict-list-proj-1-task-1-2026-07-20"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("conflict-delete-te-a")).toBeInTheDocument();
    expect(screen.getByTestId("conflict-delete-te-b")).toBeInTheDocument();

    // Delete one extra → DELETE issued → refetch leaves ONE entry → `saved`.
    await user.click(screen.getByTestId("conflict-delete-te-a"));
    await waitFor(() => expect(api.deletes).toEqual(["te-a"]));
    await waitFor(() =>
      expect(screen.getByTestId(MON_CELL)).toHaveAttribute(
        "data-state",
        "saved",
      ),
    );
    // Now editable: the resolved Slot exposes the edit affordance.
    expect(
      within(screen.getByTestId(MON_CELL)).getByRole("button"),
    ).toHaveAttribute("aria-label", expect.stringContaining("Edit time"));
  });

  it("an unresolved conflict blocks ONLY its own cell — a sibling stays editable", async () => {
    const api = setupStatefulApi(conflictWeek());
    const user = userEvent.setup();

    // Monday is a conflict…
    const mon = await screen.findByTestId(MON_CELL);
    await waitFor(() => expect(mon).toHaveAttribute("data-state", "conflict"));

    // …but Tuesday (same row, empty) still accepts a new entry.
    const tue = screen.getByTestId(EMPTY_CELL);
    await user.type(within(tue).getByRole("textbox"), "1{Enter}");

    await waitFor(() => expect(api.posts).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId(EMPTY_CELL)).toHaveAttribute(
        "data-state",
        "saved",
      ),
    );
    // Monday is still an unresolved conflict — untouched.
    expect(screen.getByTestId(MON_CELL)).toHaveAttribute(
      "data-state",
      "conflict",
    );
  });
});

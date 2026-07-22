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

// The sync status bar (ARCHITECTURE §6 save model / ticket 0008): one
// aggregate line under the grid derived from the SHARED mutation cache via
// `useMutationState` — "All changes saved" at rest, "Saving…" while any
// per-cell write is in flight, "N save(s) failed" once retries exhaust.
// Rendered through <WeekGrid/> (not in isolation) so the derivation is proven
// against the real per-cell `useMutation` writes, exactly as shipped.

const FROM = "2026-07-20"; // Monday
const TO = "2026-07-26"; // Sunday
const TODAY = "2026-07-22"; // Wednesday
const TUE_CELL = "cell-proj-1-task-1-2026-07-21"; // Tuesday — empty
const WED_CELL = "cell-proj-1-task-1-2026-07-22"; // Wednesday — empty

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

/** Build the created-Entry echo a successful POST returns. */
function createdFrom(body: Record<string, unknown>, id: string): WeekEntry {
  return {
    timeEntryId: id,
    projectId: String(body.projectId),
    projectName: "Website Rebuild",
    taskId: String(body.taskId),
    taskName: "Development",
    dateUtc: String(body.dateUtc),
    duration: Number(body.duration),
    description: String(body.description ?? ""),
    status: "ACTIVE",
  };
}

describe("SyncStatusBar — aggregate sync state (via WeekGrid)", () => {
  it("shows 'All changes saved' at rest, with role=status", async () => {
    server.use(http.get("*/api/week", () => HttpResponse.json([seedEntry()])));
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);

    const bar = await screen.findByTestId("sync-status");
    expect(bar).toHaveTextContent("All changes saved");
    // A live region so the sync state is announced, matching the Cells'
    // own role="status" affordances.
    expect(bar).toHaveAttribute("role", "status");
  });

  it("shows 'Saving…' while a create is in flight, then returns to saved", async () => {
    // Gate the POST so the pending window is observable (same idiom as the
    // create-test's Saving-indicator case).
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let weekEntries: WeekEntry[] = [seedEntry()];
    server.use(
      http.get("*/api/week", () => HttpResponse.json(weekEntries)),
      http.post("*/api/timeentries", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        await gate; // hold the write in-flight
        const created = createdFrom(body, "te-created");
        weekEntries = [...weekEntries, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);

    const user = userEvent.setup();
    const cell = await screen.findByTestId(TUE_CELL);
    await user.type(within(cell).getByRole("textbox"), "1.5{Enter}");

    // One pending write → the bare (count-free) "Saving…".
    await waitFor(() =>
      expect(screen.getByTestId("sync-status")).toHaveTextContent(/^Saving…$/),
    );

    // Release → success → the bar settles back to the resting state.
    release();
    await waitFor(() =>
      expect(screen.getByTestId("sync-status")).toHaveTextContent(
        "All changes saved",
      ),
    );
  });

  it("counts concurrent in-flight writes: 'Saving 2…'", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let posts = 0;
    let weekEntries: WeekEntry[] = [seedEntry()];
    server.use(
      http.get("*/api/week", () => HttpResponse.json(weekEntries)),
      http.post("*/api/timeentries", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        posts++;
        const id = `te-created-${posts}`;
        await gate; // hold BOTH writes in-flight together
        const created = createdFrom(body, id);
        weekEntries = [...weekEntries, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);

    const user = userEvent.setup();
    const tue = await screen.findByTestId(TUE_CELL);
    await user.type(within(tue).getByRole("textbox"), "1{Enter}");
    const wed = screen.getByTestId(WED_CELL);
    await user.type(within(wed).getByRole("textbox"), "2{Enter}");

    // Two per-cell mutations pending at once → the count surfaces.
    await waitFor(() =>
      expect(screen.getByTestId("sync-status")).toHaveTextContent("Saving 2…"),
    );

    release();
    await waitFor(() =>
      expect(screen.getByTestId("sync-status")).toHaveTextContent(
        "All changes saved",
      ),
    );
  });

  // Retry exhaustion needs the bounded-backoff window compressed, so this
  // block drives time with fake timers (same idiom as the resilience tests —
  // userEvent deadlocks under fake timers, so the DOM is driven directly).
  describe("failed writes (fake timers — retries exhausted)", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    async function flush(ms = 0) {
      await act(() => vi.advanceTimersByTimeAsync(ms));
    }

    /** Commit a value into a Cell's input synchronously. */
    function commitInto(testid: string, value: string) {
      const input = within(screen.getByTestId(testid)).getByRole("textbox");
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: "Enter" });
    }

    it("shows '1 save failed' once a write's retries exhaust", async () => {
      const weekEntries: WeekEntry[] = [seedEntry()];
      server.use(
        http.get("*/api/week", () => HttpResponse.json(weekEntries)),
        http.post("*/api/timeentries", () =>
          HttpResponse.json(
            { error: { code: "upstream", message: "Xero 502" }, status: 502 },
            { status: 502 },
          ),
        ),
      );
      renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
      await flush();

      commitInto(TUE_CELL, "1.5");

      // While auto-retrying (`pending` Cell) the bar still reads as saving.
      await flush();
      expect(screen.getByTestId("sync-status")).toHaveTextContent(/^Saving…$/);

      // Exhaust the bounded backoff window (500 + 1000 + 2000 ms); one
      // generous advance chains every scheduled retry.
      await flush(10_000);

      const bar = screen.getByTestId("sync-status");
      expect(bar).toHaveTextContent("1 save failed");
      // Styled like the Cells' error affordance (red, both themes).
      expect(bar.className).toContain("text-red-600");
      expect(bar.className).toContain("dark:text-red-400");
    });

    it("pluralizes multiple exhausted writes: '2 saves failed'", async () => {
      const weekEntries: WeekEntry[] = [seedEntry()];
      server.use(
        http.get("*/api/week", () => HttpResponse.json(weekEntries)),
        http.post("*/api/timeentries", () =>
          HttpResponse.json(
            { error: { code: "upstream", message: "Xero 502" }, status: 502 },
            { status: 502 },
          ),
        ),
      );
      renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
      await flush();

      commitInto(TUE_CELL, "1.5");
      commitInto(WED_CELL, "2");
      await flush(10_000); // both writes exhaust their retries

      expect(screen.getByTestId("sync-status")).toHaveTextContent(
        "2 saves failed",
      );
    });
  });
});

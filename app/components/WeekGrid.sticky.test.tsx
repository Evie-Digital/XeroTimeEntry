import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithClient } from "@/test/render";
import { WeekGrid } from "./WeekGrid";
import type { WeekEntry } from "@/lib/week/types";

// Sticky-layout contract (ARCHITECTURE §6 / ticket 0008: "rows = Project ·
// Task (sticky left col), columns = Mon–Sun (sticky header), a per-row Total
// col (sticky right)"). jsdom doesn't lay out or scroll, so these are LIGHT
// class-level assertions on the load-bearing utilities — sticky positioning,
// an OPAQUE page-matching background (`bg-inherit` resolved transparent and
// let content slide underneath), and the containing overflow scrollport.
// Real occlusion/scroll behavior is verified visually in a live run.

const FROM = "2026-07-20"; // Monday
const TO = "2026-07-26"; // Sunday
const TODAY = "2026-07-22"; // Wednesday

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

async function renderGrid() {
  server.use(http.get("*/api/week", () => HttpResponse.json([seedEntry()])));
  renderWithClient(<WeekGrid from={FROM} to={TO} today={TODAY} />);
  return screen.findByTestId("week-grid");
}

/** The classes every sticky cell needs to occlude in-flow content. */
function expectStickyOpaque(el: HTMLElement) {
  expect(el.className).toContain("sticky");
  // Solid page-matching background — NOT bg-inherit (transparent over a <tr>).
  expect(el.className).toMatch(/bg-background|bg-\[var\(--grid-today-bg\)\]/);
  expect(el.className).not.toContain("bg-inherit");
}

describe("WeekGrid — sticky layout classes (§6)", () => {
  it("contains scrolling to the grid's own container", async () => {
    const container = await renderGrid();
    // `overflow-auto` (not page-level scroll) owns BOTH axes: horizontal
    // scroll stays inside the grid, and position:sticky sticks against this
    // scrollport (sticky-top needs the grid, not the page, to scroll).
    expect(container.className).toContain("overflow-auto");
  });

  it("day-header row is sticky-top; corner + Total header sit above it", async () => {
    await renderGrid();

    // Every day header sticks to the top of the scrollport.
    const mon = screen.getByRole("columnheader", { name: /Mon 20/ });
    expectStickyOpaque(mon);
    expect(mon.className).toContain("top-0");
    expect(mon.className).toContain("z-20");

    // The top-LEFT corner (row-label header) is sticky on BOTH axes and
    // layers above the day headers so both crossings occlude correctly.
    const corner = screen.getByRole("columnheader", { name: "Project · Task" });
    expectStickyOpaque(corner);
    expect(corner.className).toContain("top-0");
    expect(corner.className).toContain("left-0");
    expect(corner.className).toContain("z-30");

    // The top-RIGHT corner (Total header) mirrors it on the right edge.
    const total = screen.getByRole("columnheader", { name: "Total" });
    expectStickyOpaque(total);
    expect(total.className).toContain("top-0");
    expect(total.className).toContain("right-0");
    expect(total.className).toContain("z-30");
  });

  it("today's header cell keeps a SOLID (pre-mixed) highlight, not a wash", async () => {
    await renderGrid();
    const today = screen.getByRole("columnheader", { name: /Wed 22/ });
    expect(today).toHaveAttribute("data-today", "true");
    // The opaque --grid-today-bg mix, not the translucent bg-black/5 overlay
    // (which would let scrolled content show through a sticky cell).
    expect(today.className).toContain("bg-[var(--grid-today-bg)]");
    expect(today.className).not.toContain("bg-black/5");
  });

  it("row labels stick left and row Totals stick right, opaquely", async () => {
    await renderGrid();

    const label = screen.getByRole("rowheader", {
      name: "Website Rebuild · Development",
    });
    expectStickyOpaque(label);
    expect(label.className).toContain("left-0");

    const rowTotal = screen.getByTestId("row-total-proj-1-task-1");
    expectStickyOpaque(rowTotal);
    expect(rowTotal.className).toContain("right-0");
  });

  it("footer: Daily-total label sticks left, grand total sticks right", async () => {
    await renderGrid();

    const label = screen.getByRole("rowheader", { name: "Daily total" });
    expectStickyOpaque(label);
    expect(label.className).toContain("left-0");

    const grand = screen.getByTestId("grand-total");
    expectStickyOpaque(grand);
    expect(grand.className).toContain("right-0");
  });
});

import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { useRovingFocus, type GridNav } from "./gridNav";

// Regression: the roving-focus `active` coordinate must survive the grid
// SHRINKING under it (ARCHITECTURE §6 keyboard model). Scenario: focus a Cell
// in the LAST row, delete that row's only Entry — the week refetch drops the
// row, `rowCount` shrinks, and the stored `active.row` now points past the
// end. Before the clamp fix, `isActive` was then false for every Cell, every
// Cell rendered `tabIndex=-1`, and a keyboard user could never Tab back into
// the grid. These tests drive `useRovingFocus` through a minimal harness
// (WeekGrid-integration is covered elsewhere; the bug lives entirely in the
// hook, so we test it at the hook's seam).

const DAYS = 7;

/** Mutable slot the harness fills with the CURRENT render's nav api, so the
 *  test can drive `move`/read `active` directly (written in an effect, not
 *  during render, to stay within the Rules of React). */
type NavRef = { current: GridNav | null };

/** Minimal roving-tabIndex grid: `rows × 7` buttons wired exactly like
 *  WeekGrid's Cells (register / isActive→tabIndex / syncActive on focus). */
function Harness({ rows, navRef }: { rows: number; navRef: NavRef }) {
  const nav = useRovingFocus(rows, DAYS);
  useEffect(() => {
    navRef.current = nav;
  });
  return (
    <div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r}>
          {Array.from({ length: DAYS }, (_, d) => (
            <button
              key={d}
              type="button"
              data-testid={`cell-${r}-${d}`}
              ref={(el) => nav.register(r, d, el)}
              tabIndex={nav.isActive(r, d) ? 0 : -1}
              onFocus={() => nav.syncActive(r, d)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Every rendered cell whose tabIndex is 0 (the Tab entry points). */
function tabbableCells(): HTMLElement[] {
  return screen
    .getAllByRole("button")
    .filter((el) => el.tabIndex === 0);
}

describe("useRovingFocus — clamping when the grid shrinks", () => {
  it("keeps exactly one tabbable cell after rows are removed under the focus", async () => {
    const navRef: NavRef = { current: null };
    const { rerender } = render(<Harness rows={3} navRef={navRef} />);

    // Focus a cell in the LAST row (syncActive stores row 2).
    act(() => screen.getByTestId("cell-2-3").focus());
    expect(screen.getByTestId("cell-2-3")).toHaveAttribute("tabindex", "0");

    // The refetch drops two rows: active.row (2) is now out of bounds.
    rerender(<Harness rows={1} navRef={navRef} />);

    // Exactly ONE cell is still the Tab entry point — the clamped coordinate
    // (last surviving row, same day) — not zero, which would strand keyboard
    // users outside the grid forever.
    const tabbable = tabbableCells();
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(screen.getByTestId("cell-0-3"));
  });

  it("exposes the clamped coordinate as `active` (consumers compare it directly)", () => {
    const navRef: NavRef = { current: null };
    const { rerender } = render(<Harness rows={3} navRef={navRef} />);

    act(() => screen.getByTestId("cell-2-5").focus());
    expect(navRef.current?.active).toEqual({ row: 2, day: 5 });

    rerender(<Harness rows={2} navRef={navRef} />);

    // WeekGrid's Cell compares `nav.active.row === row` directly, so the
    // EXPOSED coordinate must be the clamped one, matching `isActive`.
    expect(navRef.current?.active).toEqual({ row: 1, day: 5 });
    expect(navRef.current?.isActive(1, 5)).toBe(true);
  });

  it("move from a stale (out-of-bounds) coordinate lands on a real cell", () => {
    const navRef: NavRef = { current: null };
    const { rerender } = render(<Harness rows={3} navRef={navRef} />);

    act(() => screen.getByTestId("cell-2-3").focus());
    rerender(<Harness rows={1} navRef={navRef} />);

    // A key handler may still hold the pre-shrink coordinate (2,3). `move`
    // clamps its base first, so "down" from a vanished row focuses the last
    // real row instead of computing a coordinate past the end.
    act(() => navRef.current?.move(2, 3, "down"));
    expect(screen.getByTestId("cell-0-3")).toHaveFocus();
    expect(tabbableCells()).toHaveLength(1);
  });
});

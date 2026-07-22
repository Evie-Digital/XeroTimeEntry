"use client";

// Roving-focus model for the weekly grid (ARCHITECTURE §6 keyboard model).
//
// The grid is a `rowCount × dayCount` matrix of Cells. Exactly ONE Cell is
// tabbable at a time (roving `tabIndex`): the `active` `(row, day)` Cell carries
// `tabIndex=0`, every other Cell `tabIndex=-1`, so Tab enters/leaves the grid at
// a single point while the arrow/Tab/Enter keys move focus WITHIN it.
//
// Each Cell registers its focusable DOM element by `(row, day)` via `register`;
// `move`/`focusCell` set the `active` coordinate and an effect focuses the
// registered element (also after new rows mount — the pending flag survives the
// re-render, so "add a row then focus into it" just works). `syncActive` keeps
// `active` in step when the user clicks or Tabs onto a Cell directly.
//
// Kept deliberately generic (no Slot/Entry knowledge) so #08 (descriptions) and
// #09 (prefill) can drive focus through the same seam. `WeekGrid` owns the hook
// and shares the api down through `GridNavContext`.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type Coord = { row: number; day: number };
export type Direction = "up" | "down" | "left" | "right";

export type GridNav = {
  /** The currently-focused Cell (roving tabIndex anchor). */
  active: Coord;
  /** True for the one tabbable Cell. */
  isActive: (row: number, day: number) => boolean;
  /** A Cell registers/unregisters its focusable element (callback ref). */
  register: (row: number, day: number, el: HTMLElement | null) => void;
  /** Sync `active` when a Cell is focused by click/Tab (no programmatic focus). */
  syncActive: (row: number, day: number) => void;
  /** Programmatically move focus to a Cell (used after add-row). */
  focusCell: (row: number, day: number) => void;
  /** Move focus one step; Tab passes `{ wrap: true }` to wrap across rows. */
  move: (
    row: number,
    day: number,
    dir: Direction,
    opts?: { wrap?: boolean },
  ) => void;
};

const cellKey = (row: number, day: number) => `${row}:${day}`;

/**
 * The roving-focus state machine for a `rowCount × dayCount` grid. Owns the
 * `active` coordinate, the registered-element map, and the deferred-focus effect
 * (so focusing a Cell in a row that only just mounted still lands).
 */
export function useRovingFocus(rowCount: number, dayCount = 7): GridNav {
  const [active, setActive] = useState<Coord>({ row: 0, day: 0 });
  const cells = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef(false);

  const register = useCallback(
    (row: number, day: number, el: HTMLElement | null) => {
      const k = cellKey(row, day);
      if (el) cells.current.set(k, el);
      else cells.current.delete(k);
    },
    [],
  );

  const focusCell = useCallback((row: number, day: number) => {
    pendingFocus.current = true;
    setActive({ row, day });
  }, []);

  const syncActive = useCallback((row: number, day: number) => {
    setActive((prev) =>
      prev.row === row && prev.day === day ? prev : { row, day },
    );
  }, []);

  const move = useCallback(
    (
      row: number,
      day: number,
      dir: Direction,
      opts?: { wrap?: boolean },
    ) => {
      if (rowCount === 0 || dayCount === 0) return;

      let nextRow = row;
      let nextDay = day;

      if (opts?.wrap && (dir === "left" || dir === "right")) {
        // Tab / Shift+Tab: treat the grid as one ring and wrap across rows.
        const total = rowCount * dayCount;
        const idx = row * dayCount + day;
        const next =
          dir === "right" ? (idx + 1) % total : (idx - 1 + total) % total;
        nextRow = Math.floor(next / dayCount);
        nextDay = next % dayCount;
      } else {
        // Arrows: clamp within the grid (no wrap).
        switch (dir) {
          case "right":
            nextDay = Math.min(day + 1, dayCount - 1);
            break;
          case "left":
            nextDay = Math.max(day - 1, 0);
            break;
          case "up":
            nextRow = Math.max(row - 1, 0);
            break;
          case "down":
            nextRow = Math.min(row + 1, rowCount - 1);
            break;
        }
      }
      focusCell(nextRow, nextDay);
    },
    [focusCell, rowCount, dayCount],
  );

  // Focus the target element only after a programmatic move (`focusCell`), never
  // on plain re-renders or a click-driven `syncActive` — so mounting the grid
  // doesn't steal focus, but navigation (incl. into a freshly-added row) does.
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    cells.current.get(cellKey(active.row, active.day))?.focus();
  }, [active]);

  const isActive = useCallback(
    (row: number, day: number) => active.row === row && active.day === day,
    [active],
  );

  return useMemo(
    () => ({ active, isActive, register, syncActive, focusCell, move }),
    [active, isActive, register, syncActive, focusCell, move],
  );
}

const GridNavContext = createContext<GridNav | null>(null);

export function GridNavProvider({
  nav,
  children,
}: {
  nav: GridNav;
  children: ReactNode;
}) {
  return (
    <GridNavContext.Provider value={nav}>{children}</GridNavContext.Provider>
  );
}

/** Read the grid's roving-focus api from context (throws outside the grid). */
export function useGridNav(): GridNav {
  const nav = useContext(GridNavContext);
  if (!nav) throw new Error("useGridNav must be used within a GridNavProvider");
  return nav;
}

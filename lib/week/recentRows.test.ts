import { afterEach, describe, expect, it } from "vitest";
import {
  RECENT_ROWS_KEY,
  addRecentRow,
  readRecentRows,
} from "./recentRows";
import type { ExtraRow } from "./grid";

// Unit: the prefill "recent rows" localStorage set (source B). Pure jsdom
// localStorage — no network, no React.

const rowA: ExtraRow = {
  projectId: "proj-1",
  taskId: "task-1",
  projectName: "Website Rebuild",
  taskName: "Development",
};
const rowB: ExtraRow = {
  projectId: "proj-2",
  taskId: "task-2",
  projectName: "Mobile App",
  taskName: "Design",
};

describe("recentRows", () => {
  afterEach(() => localStorage.clear());

  it("reads an empty set when nothing is stored", () => {
    expect(readRecentRows()).toEqual([]);
  });

  it("round-trips an added row", () => {
    addRecentRow(rowA);
    expect(readRecentRows()).toEqual([rowA]);
  });

  it("unions distinct rows and de-dupes by (projectId, taskId)", () => {
    addRecentRow(rowA);
    addRecentRow(rowB);
    addRecentRow({ ...rowA, taskName: "Development (renamed)" });

    const rows = readRecentRows();
    expect(rows).toHaveLength(2);
    // The re-added row keeps the latest names and moves to the end.
    expect(rows.map((r) => r.taskName)).toEqual([
      "Design",
      "Development (renamed)",
    ]);
  });

  it("stores only the four ExtraRow fields (no leakage)", () => {
    addRecentRow({ ...rowA, extra: "junk" } as unknown as ExtraRow);
    expect(readRecentRows()).toEqual([rowA]);
  });

  it("degrades to empty on corrupt JSON rather than throwing", () => {
    localStorage.setItem(RECENT_ROWS_KEY, "{not json");
    expect(readRecentRows()).toEqual([]);
  });

  it("ignores a stored value that is not an array", () => {
    localStorage.setItem(RECENT_ROWS_KEY, JSON.stringify({ foo: 1 }));
    expect(readRecentRows()).toEqual([]);
  });
});

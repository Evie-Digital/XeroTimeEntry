// lib/week/recentRows.ts — the "recent rows" localStorage set (ARCHITECTURE §6,
// prefill source B). A Row added via the ⌘/Ctrl+K picker but not yet logged has
// no Xero Entry, so source A ("copy last week" = the previous week's entries)
// can't carry it. We persist each added Row's (projectId, taskId, +names) here
// and UNION it into every week's seed, so an empty Row you just added isn't
// forgotten across week navigation or a reload.
//
// Shape: JSON array of ExtraRow under a single versioned key. All access is
// window-guarded and try/caught — SSR, disabled storage, or corrupt JSON degrade
// to "no recent rows" rather than throwing (resilience #10).

import { rowKey, type ExtraRow } from "./grid";

/** Versioned so a future shape change can't collide with old persisted data. */
export const RECENT_ROWS_KEY = "timeentry.recent-rows.v1";

/** Project/task ids are PER-ORGANISATION, so the recent set is scoped by the
 *  active tenantId (org switcher) — otherwise a row remembered in one org
 *  would seed unusable ids into another org's grid. Empty scope (tests,
 *  pre-auth) keeps the unscoped legacy key. */
const storageKey = (scope?: string): string =>
  scope ? `${RECENT_ROWS_KEY}.${scope}` : RECENT_ROWS_KEY;

function isExtraRow(v: unknown): v is ExtraRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.projectId === "string" &&
    typeof r.taskId === "string" &&
    typeof r.projectName === "string" &&
    typeof r.taskName === "string"
  );
}

/** The persisted recent Rows (most-recently-added last). Never throws. */
export function readRecentRows(scope?: string): ExtraRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isExtraRow);
  } catch {
    return [];
  }
}

/**
 * Remember a Row in the recent set (de-duped by `rowKey`, moved to the end so
 * it's the most-recent). Stores only the four ExtraRow fields. No-op on the
 * server or if storage is unavailable.
 */
export function addRecentRow(row: ExtraRow, scope?: string): void {
  if (typeof window === "undefined") return;
  const key = rowKey(row.projectId, row.taskId);
  const next: ExtraRow[] = [
    ...readRecentRows(scope).filter(
      (r) => rowKey(r.projectId, r.taskId) !== key,
    ),
    {
      projectId: row.projectId,
      taskId: row.taskId,
      projectName: row.projectName,
      taskName: row.taskName,
    },
  ];
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(next));
  } catch {
    /* quota exceeded / storage disabled — recent-rows is best-effort */
  }
}

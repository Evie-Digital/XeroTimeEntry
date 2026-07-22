"use client";

// Client data hook for a week's time entries (ARCHITECTURE §6). Follows the
// same query-key + getJson style as hooks/lists.ts. Unlike the cached lists,
// the week is fetched per visited week and will be invalidated on every write
// (slices #05/#06) via the `weekKey` — keep that key shape stable.

import { useQuery } from "@tanstack/react-query";
import type { WeekEntry } from "@/lib/week/types";
import { getJson } from "./lists";

export type { WeekEntry } from "@/lib/week/types";

/** Query key for a week window. Writes invalidate `weekKey(from, to)`. */
export const weekKey = (from: string, to: string) =>
  ["week", from, to] as const;

/**
 * The week's merged, enriched Xero entries for `[from, to]`
 * (both "YYYY-MM-DD"). Disabled until both bounds are present.
 */
export function useWeek(from: string, to: string) {
  return useQuery({
    queryKey: weekKey(from, to),
    queryFn: () =>
      getJson<WeekEntry[]>(
        `/api/week?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    enabled: Boolean(from && to),
  });
}

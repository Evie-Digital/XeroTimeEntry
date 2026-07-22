"use client";

// Client write hook for creating a time entry (ARCHITECTURE §5/§6). Mirrors the
// query hooks' envelope-aware fetch (hooks/lists.ts `ApiError`) but is a
// TanStack `useMutation`: a Cell calls `useCreateTimeEntry(from, to)`, then
// `mutate(vars)` on Enter. On success we INVALIDATE `weekKey(from, to)` so the
// grid refetches and re-derives — the created Entry then flows back into its
// Slot as `saved`. On failure the mutation rejects with an `ApiError` carrying
// the envelope `code` (a `validation` surfaces per-Cell) and the Cell rolls
// back. #06 edit/delete and #07 keyboard reuse this same mutation machinery.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WeekEntry } from "@/lib/week/types";
import { ApiError } from "./lists";
import { weekKey } from "./week";

/** The create payload (matches the `POST /api/timeentries` body). */
export type CreateTimeEntryVars = {
  projectId: string;
  taskId: string;
  dateUtc: string; // "<localDate>T00:00:00Z"
  duration: number; // integer minutes
  description?: string;
};

/** POST the create, mapping a non-ok envelope to `ApiError` (shared code). */
async function postTimeEntry(vars: CreateTimeEntryVars): Promise<WeekEntry> {
  const res = await fetch("/api/timeentries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string; retryAfter?: number };
    } | null;
    throw new ApiError(
      body?.error?.code ?? "upstream",
      body?.error?.message ?? `Request failed: ${res.status}`,
      body?.error?.retryAfter,
    );
  }
  return res.json() as Promise<WeekEntry>;
}

/**
 * Create-a-time-entry mutation, scoped to the visible week window so success
 * invalidates exactly that week's query. Each Cell instantiates its own so its
 * `saving`/`error` state is independent.
 */
export function useCreateTimeEntry(from: string, to: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postTimeEntry,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: weekKey(from, to) }),
  });
}

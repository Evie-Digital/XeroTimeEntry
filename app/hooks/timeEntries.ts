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
  if (!res.ok) throw await toApiError(res);
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

/** The full-replace edit payload (matches `PUT /api/timeentries/{id}` body +
 *  the id in the path). `taskId`/`dateUtc`/`description` are carried over from
 *  the existing Entry; the Cell changes `duration`. */
export type UpdateTimeEntryVars = {
  timeEntryId: string;
  projectId: string;
  taskId: string;
  dateUtc: string;
  duration: number;
  description?: string;
};

/** PUT the full-replace edit (204, no body), mapping a non-ok envelope to
 *  the shared `ApiError`. */
async function putTimeEntry(vars: UpdateTimeEntryVars): Promise<void> {
  const { timeEntryId, ...body } = vars;
  const res = await fetch(`/api/timeentries/${timeEntryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);
}

/** The delete payload — the id (path) + its projectId (query). */
export type DeleteTimeEntryVars = { timeEntryId: string; projectId: string };

/** DELETE the entry (204, no body), mapping a non-ok envelope to `ApiError`. */
async function deleteTimeEntryReq(vars: DeleteTimeEntryVars): Promise<void> {
  const res = await fetch(
    `/api/timeentries/${vars.timeEntryId}?projectId=${encodeURIComponent(vars.projectId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw await toApiError(res);
}

/** Parse a non-ok API error envelope into the shared `ApiError`. */
async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string; retryAfter?: number };
  } | null;
  return new ApiError(
    body?.error?.code ?? "upstream",
    body?.error?.message ?? `Request failed: ${res.status}`,
    body?.error?.retryAfter,
  );
}

/**
 * Full-replace edit mutation, scoped to the visible week window so success
 * invalidates exactly that week's query (the grid refetches and re-derives the
 * Cell + totals). Same shape as `useCreateTimeEntry`.
 */
export function useUpdateTimeEntry(from: string, to: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: putTimeEntry,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: weekKey(from, to) }),
  });
}

/**
 * Delete mutation, scoped to the visible week window so success invalidates
 * that week's query (the Cell re-derives as `empty`, totals drop).
 */
export function useDeleteTimeEntry(from: string, to: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTimeEntryReq,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: weekKey(from, to) }),
  });
}

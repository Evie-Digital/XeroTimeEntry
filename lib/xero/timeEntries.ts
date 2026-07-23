// lib/xero/timeEntries.ts — the Xero time-entry write wrappers (ARCHITECTURE
// §8.B). Every write funnels through the shared `xeroFetch` (lib/xero/client),
// which injects the bearer token + tenant header and does the reactive 401
// refresh-and-retry, so this layer only shapes the body and maps the write-
// specific status codes onto the Xero error taxonomy that `withErrorEnvelope`
// turns into the uniform envelope (§5).
//
// Slice #05 implements CREATE. #06 adds PUT (full-replace) + DELETE, which
// follow the exact same shape (see the trailing note).

import { throwForXeroStatus, xeroFetch } from "./client";
import { getCurrentSession } from "./session";

/** A new time entry to POST. `dateUtc` is `<localDate>T00:00:00Z` (§2). */
export type NewTimeEntry = {
  projectId: string;
  taskId: string;
  dateUtc: string; // "2026-07-20T00:00:00Z"
  duration: number; // integer minutes, 1..59940
  description?: string;
};

/**
 * `POST /Projects/{projectId}/Time` — create one Xero time entry for the
 * session's resolved `userId` (§4). Returns the created Entry (incl.
 * `timeEntryId`, `status: "ACTIVE"`). Xero errors propagate as the taxonomy
 * types so the route's `withErrorEnvelope` maps them (429→rate_limited,
 * 400→validation, else→upstream).
 */
export async function createTimeEntry(entry: NewTimeEntry) {
  const s = getCurrentSession();

  const res = await xeroFetch(`/Projects/${entry.projectId}/Time`, {
    method: "POST",
    body: JSON.stringify({
      userId: s.userId, // resolved once at login via /projectsusers email-match
      taskId: entry.taskId,
      dateUtc: entry.dateUtc,
      duration: entry.duration,
      ...(entry.description ? { description: entry.description } : {}),
    }),
  });

  await throwForXeroStatus(res);
  return res.json();
}

/** A full-replace edit of an existing Entry (§8.B). Carries EVERY field Xero
 *  needs — a PUT is a full replace, not a patch — so the caller passes the
 *  Entry's existing `taskId`/`dateUtc`/`description` back verbatim, changing
 *  only what the Cell edited (typically `duration`). */
export type UpdateTimeEntry = {
  projectId: string;
  timeEntryId: string;
  taskId: string;
  dateUtc: string; // carried verbatim from the existing Entry (§2)
  duration: number; // integer minutes, 1..59940
  description?: string;
};

/**
 * `PUT /Projects/{projectId}/Time/{timeEntryId}` — full-replace an existing
 * Entry for the session's `userId` (§4). Xero returns 204 (no body). Errors
 * propagate as the taxonomy types (429→rate_limited, 400→validation,
 * else→upstream) for `withErrorEnvelope`.
 */
export async function updateTimeEntry(entry: UpdateTimeEntry): Promise<void> {
  const s = getCurrentSession();

  const res = await xeroFetch(
    `/Projects/${entry.projectId}/Time/${entry.timeEntryId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        userId: s.userId, // injected server-side, same as create
        taskId: entry.taskId,
        dateUtc: entry.dateUtc,
        duration: entry.duration,
        ...(entry.description ? { description: entry.description } : {}),
      }),
    },
  );

  await throwForXeroStatus(res);
  // 204 No Content — nothing to return.
}

/**
 * `DELETE /Projects/{projectId}/Time/{timeEntryId}` — remove an Entry (only
 * while `status === "ACTIVE"`; the grid never offers delete on a locked Cell).
 * Xero returns 204. 429→rate_limited, else→upstream.
 */
export async function deleteTimeEntry(params: {
  projectId: string;
  timeEntryId: string;
}): Promise<void> {
  // No body/userId needed; auth is enforced by `xeroFetch` (ambient session).
  const res = await xeroFetch(
    `/Projects/${params.projectId}/Time/${params.timeEntryId}`,
    { method: "DELETE" },
  );

  await throwForXeroStatus(res);
  // 204 No Content.
}

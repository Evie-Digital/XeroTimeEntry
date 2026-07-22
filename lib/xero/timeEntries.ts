// lib/xero/timeEntries.ts — the Xero time-entry write wrappers (ARCHITECTURE
// §8.B). Every write funnels through the shared `xeroFetch` (lib/xero/client),
// which injects the bearer token + tenant header and does the reactive 401
// refresh-and-retry, so this layer only shapes the body and maps the write-
// specific status codes onto the Xero error taxonomy that `withErrorEnvelope`
// turns into the uniform envelope (§5).
//
// Slice #05 implements CREATE. #06 adds PUT (full-replace) + DELETE, which
// follow the exact same shape (see the trailing note).

import {
  RateLimited,
  UpstreamError,
  XeroValidation,
  xeroFetch,
} from "./client";
import { getSession, ReauthRequired } from "./session";

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
  const s = getSession();
  if (!s) throw new ReauthRequired("no session");

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

  if (res.status === 429) {
    throw new RateLimited(Number(res.headers.get("Retry-After") ?? 1));
  }
  if (res.status === 400) {
    throw new XeroValidation(await res.json().catch(() => null));
  }
  if (!res.ok) throw new UpstreamError(`Xero ${res.status}`);
  return res.json();
}

// #06 will add, same wrapper shape:
//   PUT    /Projects/{projectId}/Time/{timeEntryId}   (full-replace body → 204)
//   DELETE /Projects/{projectId}/Time/{timeEntryId}   (→ 204, only while ACTIVE)

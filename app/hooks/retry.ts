"use client";

// Shared client retry policy (ARCHITECTURE §5 "Retry split"). The client half
// of the split retries a 429 `rate_limited` (honoring the envelope's
// `retryAfter`), an `upstream` 5xx, and plain network failures (fetch rejects
// with something that isn't an `ApiError`) — all within a bounded exponential
// backoff window. `validation` and `reauth_required` are NEVER retried:
// retrying can't fix a rejected body or an expired session.
//
// Originally built for the write mutations (slice #10, ticket 0011), but §5
// prescribes the SAME policy for reads, so this lives in its own module used
// from both sides: queries get `shouldRetry`/`retryDelay` as the QueryClient
// defaults (app/providers.tsx) and every write mutation spreads the identical
// pair per-hook (hooks/timeEntries.ts). hooks/timeEntries.ts re-exports these
// under their original `write*` names for backward compatibility.

import { ApiError } from "./lists";

/** Bounded retry window: up to 3 retries after the first attempt (4 total). */
export const MAX_RETRIES = 3;
/** Backoff base; the nth retry waits `BASE * 2^(n-1)`, capped at `MAX`. */
export const RETRY_BASE_MS = 500;
export const RETRY_MAX_MS = 30_000;

/** Envelope codes we DON'T retry — retrying can't change the outcome. */
const NON_RETRYABLE_CODES = new Set(["validation", "reauth_required"]);

/** Is this failure worth another attempt? Network errors (non-`ApiError`) and
 *  every envelope code except validation/reauth are retryable. */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) return !NON_RETRYABLE_CODES.has(error.code);
  return true; // network / fetch rejection → retry
}

/** React Query `retry`: keep retrying a retryable error within the bounded
 *  window. `failureCount` is 0-based (0 at the first failure), mirroring the
 *  numeric `retry: n` form — so `< MAX_RETRIES` yields exactly N retries. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && isRetryableError(error);
}

/** React Query `retryDelay`: honor `Retry-After` (seconds) on `rate_limited`
 *  (ARCHITECTURE §5), else exponential backoff. `failureCount` is 0-based, so
 *  the delays are BASE·2^0, BASE·2^1, BASE·2^2 … capped at `MAX`. */
export function retryDelay(failureCount: number, error: unknown): number {
  if (
    error instanceof ApiError &&
    error.code === "rate_limited" &&
    typeof error.retryAfter === "number"
  ) {
    return Math.max(0, error.retryAfter * 1000);
  }
  const backoff = RETRY_BASE_MS * 2 ** failureCount;
  return Math.min(backoff, RETRY_MAX_MS);
}

/** The policy as a ready-to-spread options pair. Mutations spread this
 *  per-hook (hooks/timeEntries.ts); queries receive the same pair via the
 *  QueryClient's `defaultOptions.queries` (app/providers.tsx). */
export const retryOptions = {
  retry: shouldRetry,
  retryDelay,
} as const;

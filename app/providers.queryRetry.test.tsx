import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ApiError } from "./hooks/lists";
import { MAX_RETRIES, RETRY_BASE_MS } from "./hooks/retry";
import { makeQueryClient } from "./providers";

// ARCHITECTURE §5 "Retry split", READ side. The QueryClient built by
// `makeQueryClient` (the real one <Providers/> renders with) must give every
// query the shared policy from hooks/retry.ts as its DEFAULT `retry` /
// `retryDelay`: never retry `validation` or `reauth_required`, honor the
// envelope's `retryAfter` on `rate_limited`, and bound `upstream`/network
// retries with exponential backoff. Before this wiring, queries fell through
// to React Query's defaults — 3 retries on EVERYTHING (including a 401
// reauth_required) with a delay that ignored Retry-After. Fake timers + a call
// counter make the backoff timing exact, mirroring the mutation-side spec in
// hooks/timeEntries.retry.test.tsx.

/** Fresh real QueryClient per test so retry counts/caches don't bleed over. */
function wrapper() {
  const client = makeQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("query default retry policy — makeQueryClient (fake timers)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does NOT retry reauth_required — one attempt, then error", async () => {
    let calls = 0;
    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ["retry-spec", "reauth"],
          queryFn: async () => {
            calls++;
            throw new ApiError("reauth_required", "session expired");
          },
        }),
      { wrapper: wrapper() },
    );

    // Let far more time pass than any backoff — a retryable error would have
    // fired more attempts within this window.
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(calls).toBe(1);
    expect(result.current.isError).toBe(true);
    expect((result.current.error as ApiError).code).toBe("reauth_required");
  });

  it("does NOT retry validation — one attempt, then error", async () => {
    let calls = 0;
    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ["retry-spec", "validation"],
          queryFn: async () => {
            calls++;
            throw new ApiError("validation", "bad request");
          },
        }),
      { wrapper: wrapper() },
    );

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(calls).toBe(1);
    expect(result.current.isError).toBe(true);
    expect((result.current.error as ApiError).code).toBe("validation");
  });

  it("retries rate_limited and HONORS the envelope's retryAfter delay", async () => {
    let calls = 0;
    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ["retry-spec", "rate-limited"],
          queryFn: async () => {
            calls++;
            if (calls === 1) {
              throw new ApiError("rate_limited", "Too many requests", 2);
            }
            return "ok";
          },
        }),
      { wrapper: wrapper() },
    );

    // First attempt resolves and fails with the 429 envelope.
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(calls).toBe(1);

    // Backoff honors Retry-After (2 s), NOT the default exponential ~1 s:
    // no retry until the full 2 s have elapsed.
    await act(() => vi.advanceTimersByTimeAsync(1999));
    expect(calls).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(calls).toBe(2);

    // Second attempt succeeds; flush settling.
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(result.current.data).toBe("ok");
  });

  it("retries upstream (5xx) with bounded backoff, then surfaces the error", async () => {
    let calls = 0;
    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ["retry-spec", "upstream"],
          queryFn: async () => {
            calls++;
            throw new ApiError("upstream", "Xero 500");
          },
        }),
      { wrapper: wrapper() },
    );

    // First failure, then exponential backoff BASE·2^0, ·2^1, ·2^2 — check
    // the first delay boundary exactly, then let the rest run out.
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(calls).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(RETRY_BASE_MS - 1));
    expect(calls).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(calls).toBe(2);

    // Bounded: MAX_RETRIES retries after the first attempt, then error out.
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(calls).toBe(1 + MAX_RETRIES);
    expect(result.current.isError).toBe(true);
    expect((result.current.error as ApiError).code).toBe("upstream");
  });
});

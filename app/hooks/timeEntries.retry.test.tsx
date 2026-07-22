import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { ApiError } from "./lists";
import {
  WRITE_MAX_RETRIES,
  WRITE_RETRY_BASE_MS,
  isRetryableWriteError,
  useCreateTimeEntry,
  writeRetryDelay,
  writeShouldRetry,
} from "./timeEntries";

// Slice #10 — transient-failure resilience. Seam 1: a 429 surfaces
// `rate_limited` + `retryAfter` through the envelope and the client backoff
// HONORS it; only retryable codes retry; validation/reauth never do. The pure
// helpers are asserted directly (fast/deterministic); the end-to-end retry uses
// fake timers + a call counter so the backoff timing is exact.

const FROM = "2026-07-20";
const TO = "2026-07-26";
const VARS = {
  projectId: "proj-1",
  taskId: "task-1",
  dateUtc: "2026-07-21T00:00:00Z",
  duration: 90,
};

describe("write retry policy — which errors retry", () => {
  it("retries upstream (5xx), rate_limited (429) and network errors", () => {
    expect(isRetryableWriteError(new ApiError("upstream", "boom"))).toBe(true);
    expect(isRetryableWriteError(new ApiError("rate_limited", "slow", 3))).toBe(
      true,
    );
    // A bare fetch rejection (network drop) is not an ApiError → retry.
    expect(isRetryableWriteError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("NEVER retries validation or reauth_required", () => {
    expect(isRetryableWriteError(new ApiError("validation", "bad body"))).toBe(
      false,
    );
    expect(
      isRetryableWriteError(new ApiError("reauth_required", "expired")),
    ).toBe(false);
  });

  it("stops after the bounded number of retries", () => {
    const err = new ApiError("upstream", "boom");
    // failureCount is 0-based (0 at the first failure), mirroring `retry: n`.
    expect(writeShouldRetry(0, err)).toBe(true);
    expect(writeShouldRetry(WRITE_MAX_RETRIES - 1, err)).toBe(true);
    expect(writeShouldRetry(WRITE_MAX_RETRIES, err)).toBe(false);
    // A non-retryable code short-circuits regardless of count.
    expect(writeShouldRetry(0, new ApiError("validation", "x"))).toBe(false);
  });
});

describe("write backoff delay — honors Retry-After, else exponential", () => {
  it("uses retryAfter (seconds → ms) on rate_limited", () => {
    expect(writeRetryDelay(0, new ApiError("rate_limited", "x", 2))).toBe(2000);
    expect(writeRetryDelay(2, new ApiError("rate_limited", "x", 5))).toBe(5000);
  });

  it("falls back to exponential backoff when there's no retryAfter", () => {
    expect(writeRetryDelay(0, new ApiError("upstream", "x"))).toBe(
      WRITE_RETRY_BASE_MS, // 2^0
    );
    expect(writeRetryDelay(1, new ApiError("upstream", "x"))).toBe(
      WRITE_RETRY_BASE_MS * 2,
    );
    expect(writeRetryDelay(2, new TypeError("net"))).toBe(
      WRITE_RETRY_BASE_MS * 4,
    );
  });

  it("caps the exponential backoff at the ceiling", () => {
    expect(writeRetryDelay(99, new ApiError("upstream", "x"))).toBe(30_000);
  });
});

function wrapper() {
  const client = new QueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useCreateTimeEntry — end-to-end auto-retry (fake timers)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a 429 surfaces rate_limited + retryAfter and the retry HONORS the delay", async () => {
    let calls = 0;
    server.use(
      http.post("*/api/timeentries", () => {
        calls++;
        if (calls <= 2) {
          return HttpResponse.json(
            {
              error: {
                code: "rate_limited",
                message: "Too many requests",
                retryAfter: 2,
              },
              status: 429,
            },
            { status: 429 },
          );
        }
        return HttpResponse.json(
          { timeEntryId: "te-created", ...VARS, status: "ACTIVE" },
          { status: 201 },
        );
      }),
    );

    const { result } = renderHook(() => useCreateTimeEntry(FROM, TO), {
      wrapper: wrapper(),
    });

    act(() => {
      result.current.mutate(VARS);
    });

    // First attempt resolves and fails with the 429 envelope.
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(calls).toBe(1);
    expect(result.current.isPending).toBe(true);
    expect(result.current.failureCount).toBe(1);
    // Seam 1: the envelope surfaced rate_limited + retryAfter as an ApiError.
    const reason = result.current.failureReason as ApiError;
    expect(reason).toBeInstanceOf(ApiError);
    expect(reason.code).toBe("rate_limited");
    expect(reason.retryAfter).toBe(2);

    // Backoff honors Retry-After: no retry until 2s have elapsed.
    await act(() => vi.advanceTimersByTimeAsync(1999));
    expect(calls).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(calls).toBe(2);

    // Second 429 → another 2s wait → third attempt succeeds.
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(calls).toBe(3);
    // Flush the success response + onSuccess invalidate settling.
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(result.current.isSuccess).toBe(true);
  });

  it("does NOT retry a validation (400) failure — one attempt, then error", async () => {
    let calls = 0;
    server.use(
      http.post("*/api/timeentries", () => {
        calls++;
        return HttpResponse.json(
          { error: { code: "validation", message: "bad" }, status: 400 },
          { status: 400 },
        );
      }),
    );

    const { result } = renderHook(() => useCreateTimeEntry(FROM, TO), {
      wrapper: wrapper(),
    });

    act(() => {
      result.current.mutate(VARS);
    });

    // Let plenty of time pass — a retryable error would have fired more calls.
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(calls).toBe(1);
    expect(result.current.isError).toBe(true);
    expect((result.current.error as ApiError).code).toBe("validation");
  });
});

import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { ApiError } from "./hooks/lists";
import { makeQueryClient } from "./providers";

// ARCHITECTURE §5: 401 → back to login. `makeQueryClient` installs a global
// QueryCache/MutationCache `onError` that, on a settled `reauth_required`
// failure, flips the ["auth-status"] query data to `{ authenticated: false }`
// — <AuthStatus/> then renders the "Connect Xero" button, this app's login
// screen (a deliberate softening of §5's "redirect to /auth/login"; see
// providers.tsx). The scenario that motivated this: a dev-server restart drops
// the in-memory session while the browser keeps its cookie, so the week/list
// queries fail with reauth_required while a cached auth-status still says
// "Logged in as…". No fake timers needed — reauth_required is never retried,
// so the failure settles immediately.

/** The cached "still logged in" status the handler must overwrite. */
const LOGGED_IN = {
  authenticated: true,
  user: { name: "Gavin", email: "gavin@example.com" },
  org: "Example Org",
};

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("global reauth_required handler — flips ['auth-status']", () => {
  it("a reauth_required QUERY error sets auth-status to unauthenticated", async () => {
    const client = makeQueryClient();
    client.setQueryData(["auth-status"], LOGGED_IN);

    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ["week", "2026-07-20", "2026-07-26"],
          queryFn: async () => {
            throw new ApiError("reauth_required", "session expired");
          },
        }),
      { wrapper: wrapperFor(client) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(["auth-status"])).toEqual({
      authenticated: false,
    });
  });

  it("a reauth_required MUTATION error sets auth-status to unauthenticated", async () => {
    const client = makeQueryClient();
    client.setQueryData(["auth-status"], LOGGED_IN);

    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: async () => {
            throw new ApiError("reauth_required", "session expired");
          },
        }),
      { wrapper: wrapperFor(client) },
    );

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(["auth-status"])).toEqual({
      authenticated: false,
    });
  });

  it("other errors leave the cached auth-status untouched", async () => {
    const client = makeQueryClient();
    client.setQueryData(["auth-status"], LOGGED_IN);

    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ["week", "2026-07-20", "2026-07-26"],
          queryFn: async () => {
            // `validation` is also never retried, so this settles immediately
            // — but it is NOT a reauth signal and must not log the user out.
            throw new ApiError("validation", "bad request");
          },
        }),
      { wrapper: wrapperFor(client) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(["auth-status"])).toEqual(LOGGED_IN);
  });
});

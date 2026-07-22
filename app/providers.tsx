"use client";

import type { ReactNode } from "react";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  isServer,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { authStatusKey } from "./hooks/auth";
import { ApiError } from "./hooks/lists";
import { retryDelay, shouldRetry } from "./hooks/retry";

/**
 * App-root client providers. TanStack Query owns server-state caching,
 * retry/backoff and de-dupe (ARCHITECTURE §5). The cached lists (active
 * projects + tasks) are persisted to `localStorage` with a ~10 min
 * stale-while-revalidate window so the pickers are warm on start (§6). The
 * week's entries are fetched per-visit and are not part of this cache.
 */
const STALE_MS = 600_000; // ~10 min
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // keep persisted cache for a day

/**
 * Global `reauth_required` handler (ARCHITECTURE §5: 401 → back to login).
 * By the time the client sees `reauth_required` the server has already tried
 * its one refresh-and-retry, so the session is truly gone (e.g. a dev-server
 * restart dropped the in-memory session while the browser kept its cookie).
 * Flip the cached ["auth-status"] data to unauthenticated so <AuthStatus/>
 * (and the components that dedupe on the same key) immediately render the
 * "Connect Xero" button — this single-user app's login screen.
 *
 * Deliberate softening of §5's "redirect to /auth/login": auto-navigating to
 * /api/xero/login would be a surprising full-page OAuth redirect (possibly
 * mid-edit), so we surface the button and let the user click it.
 */
function flipAuthStatusOnReauth(queryClient: QueryClient, error: unknown) {
  if (error instanceof ApiError && error.code === "reauth_required") {
    queryClient.setQueryData(authStatusKey, { authenticated: false });
  }
}

/**
 * Build the app's QueryClient. Exported so tests can assert the real default
 * retry policy and the global reauth handler without rendering <Providers/>.
 */
export function makeQueryClient(): QueryClient {
  // QueryCache/MutationCache `onError` are the only GLOBAL error hooks React
  // Query offers — per-query `onError` was removed in v5 — so the reauth
  // handler lives here, firing once per settled failure (after retries).
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => flipAuthStatusOnReauth(queryClient, error),
    }),
    mutationCache: new MutationCache({
      onError: (error) => flipAuthStatusOnReauth(queryClient, error),
    }),
    defaultOptions: {
      queries: {
        staleTime: STALE_MS,
        // gcTime must outlive the persisted maxAge for warm-start to work.
        gcTime: CACHE_MAX_AGE_MS,
        refetchOnWindowFocus: false,
        // §5 retry split, read side: retry 429 (honoring the envelope's
        // `retryAfter`) and 5xx/network with bounded backoff; NEVER retry
        // `validation` or `reauth_required`. Same shared policy the write
        // mutations spread per-hook (hooks/retry.ts) — without this, React
        // Query's default would retry EVERYTHING 3× (including a 401) with
        // an exponential delay that ignores Retry-After.
        retry: shouldRetry,
        retryDelay,
      },
    },
  });
  return queryClient;
}

let browserQueryClient: QueryClient | undefined;

/**
 * TanStack's documented advanced-SSR pattern. Server: ALWAYS a fresh client,
 * so no state ever leaks across requests. Browser: create once, reuse forever.
 * Deliberately NOT `useState(() => new QueryClient())`: if anything below the
 * provider suspends before the first render commits, React discards that
 * state and a re-render would rebuild the client — throwing the cache away.
 */
function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}

/**
 * One persister for the app, created module-side. `storage` is documented as
 * "for SSR pass in `undefined`", and the package source confirms an absent
 * storage yields a NO-OP persister (persist/restore/remove all no-ops) — so a
 * single always-rendered <PersistQueryClientProvider/> serves both the server
 * render (no-op persistence) and the browser (localStorage), instead of two
 * divergent provider trees.
 */
const persister = createSyncStoragePersister({
  storage: typeof window === "undefined" ? undefined : window.localStorage,
  key: "xero-timesheet-cache",
});

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE_MS,
        // Persist ONLY the cached lists — never the week (ARCHITECTURE §6: the
        // week is the live editing surface, fetched per-visit and invalidated
        // on every write, so it must not warm-start from a stale localStorage
        // snapshot) and never auth-status (it mirrors the server's IN-MEMORY
        // session: a warm-started `authenticated: false` from before the OAuth
        // round-trip would mask a live login — the "stuck on Connect Xero"
        // bug). Keep the default success-only rule for everything else.
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" &&
            !(
              Array.isArray(query.queryKey) &&
              (query.queryKey[0] === "week" ||
                query.queryKey[0] === "auth-status")
            ),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

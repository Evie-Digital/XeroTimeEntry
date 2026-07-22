"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

/**
 * App-root client providers. TanStack Query owns server-state caching,
 * retry/backoff and de-dupe (ARCHITECTURE §5). The cached lists (active
 * projects + tasks) are persisted to `localStorage` with a ~10 min
 * stale-while-revalidate window so the pickers are warm on start (§6). The
 * week's entries are fetched per-visit and are not part of this cache.
 */
const STALE_MS = 600_000; // ~10 min
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // keep persisted cache for a day

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per browser session, created lazily so it survives
  // re-renders but is never shared across requests on the server.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: STALE_MS,
            // gcTime must outlive the persisted maxAge for warm-start to work.
            gcTime: CACHE_MAX_AGE_MS,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // localStorage only exists in the browser — on the server render a plain
  // provider (no persistence). Created once, lazily.
  const [persister] = useState(() =>
    typeof window === "undefined"
      ? null
      : createSyncStoragePersister({
          storage: window.localStorage,
          key: "xero-timesheet-cache",
        }),
  );

  if (!persister) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE_MS,
        // Persist ONLY the cached lists — never the week (ARCHITECTURE §6: the
        // week is the live editing surface, fetched per-visit and invalidated
        // on every write, so it must not warm-start from a stale localStorage
        // snapshot). Keep the default success-only rule for everything else.
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" &&
            !(Array.isArray(query.queryKey) && query.queryKey[0] === "week"),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * App-root client providers. TanStack Query owns server-state caching,
 * retry/backoff and de-dupe (ARCHITECTURE.md §5). Later slices add
 * `localStorage` persistence here to warm the pickers on start.
 */
export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per browser session, created lazily so it survives
  // re-renders but is never shared across requests on the server.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

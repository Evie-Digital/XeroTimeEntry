"use client";

import { useQuery } from "@tanstack/react-query";

type Health = { status: string; service: string };

async function fetchHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Example client component: fetches JSON over HTTP via `fetch` (wrapped in
 * React Query) and renders the result. Its test mounts it with an MSW
 * handler mocking `/api/health`, proving the seam-2 mocking approach works.
 */
export function HealthStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  if (isPending) return <p role="status">Checking…</p>;
  if (isError) return <p role="alert">Unavailable</p>;

  return (
    <p data-testid="health">
      {data.service}: {data.status}
    </p>
  );
}

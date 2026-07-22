"use client";

import { useQuery } from "@tanstack/react-query";

type Status = {
  authenticated: boolean;
  user?: { name: string; email: string };
  org?: string;
};

async function fetchStatus(): Promise<Status> {
  const res = await fetch("/api/xero/status");
  if (!res.ok) throw new Error(`status check failed: ${res.status}`);
  return res.json();
}

/**
 * Reads /api/xero/status and renders identity. Unauthenticated → a "Connect
 * Xero" link that kicks off the OAuth flow; authenticated → "Logged in as
 * {name} at {org}". Later slices replace this area with the weekly grid.
 */
export function AuthStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["auth-status"],
    queryFn: fetchStatus,
  });

  if (isPending) return <p role="status">Checking sign-in…</p>;
  if (isError) return <p role="alert">Could not check sign-in status.</p>;

  if (!data.authenticated) {
    return (
      <a
        href="/api/xero/login"
        className="inline-flex w-fit items-center rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        Connect Xero
      </a>
    );
  }

  return (
    <p data-testid="auth-identity">
      Logged in as <strong>{data.user?.name}</strong> at{" "}
      <strong>{data.org}</strong>
    </p>
  );
}

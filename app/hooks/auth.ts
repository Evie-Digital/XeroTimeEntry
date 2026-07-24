"use client";

// Shared auth-status hook. The ["auth-status"] query is the client's ONE view
// of "is this browser's session live on the server" — and unlike the cached
// lists it must NEVER be served warm: the OAuth callback lands the browser
// back on "/" moments after this query cached `authenticated: false`, so any
// staleTime (or a localStorage warm-start — see the dehydrate filter in
// app/providers.tsx) leaves the UI stuck on "Connect Xero" while the server
// session is already live. `staleTime: 0` + `refetchOnMount: "always"` force a
// real /api/xero/status round-trip on every mount (the shared key still
// de-dupes the three consumers into one request per mount cycle).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./lists";

/** One connected Xero organisation (mirrors the server's TenantRef). */
export type OrgRef = { tenantId: string; tenantName: string };

export type AuthStatusData = {
  authenticated: boolean;
  user?: { name: string; email: string };
  org?: string;
  /** The ACTIVE organisation's tenantId (drives the org switcher + scopes
   *  the recent-rows prefill). */
  tenantId?: string;
  /** Every organisation this login has connected — 2+ enables the switcher. */
  orgs?: OrgRef[];
};

/** Query key. The reauth flip in providers.tsx and the persistence exclusion
 *  key off this same value — keep them in sync. */
export const authStatusKey = ["auth-status"] as const;

async function fetchStatus(): Promise<AuthStatusData> {
  const res = await fetch("/api/xero/status");
  if (!res.ok) throw new Error(`status check failed: ${res.status}`);
  return res.json();
}

/** Live auth status — always refetched on mount, never persisted. */
export function useAuthStatus() {
  return useQuery({
    queryKey: authStatusKey,
    queryFn: fetchStatus,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

/** POST the switch, mapping a non-ok envelope to the shared `ApiError`. */
async function postSwitchTenant(tenantId: string): Promise<void> {
  const res = await fetch("/api/xero/tenant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string; fields?: Record<string, string> };
    } | null;
    throw new ApiError(
      body?.error?.code ?? "upstream",
      // The switch route puts its human-readable reason in fields.tenantId
      // (e.g. "not a Projects user in <org>"); fall back to the envelope
      // message.
      body?.error?.fields?.tenantId ??
        body?.error?.message ??
        `Switch failed: ${res.status}`,
    );
  }
}

/**
 * Switch the active organisation (no re-auth — the server just re-points the
 * tenant header + re-resolves the Projects userId). EVERYTHING cached is
 * tenant-scoped (projects, tasks, week), so success invalidates the whole
 * query cache: auth-status refetches (new org name), the grid and pickers
 * refetch against the new tenant. Failure leaves the server on the old org
 * (the route rolls back) — the caller surfaces the error message.
 */
export function useSwitchTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postSwitchTenant,
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/** POST the logout, mapping a non-ok response to a plain Error. */
async function postLogout(): Promise<void> {
  const res = await fetch("/api/xero/logout", { method: "POST" });
  if (!res.ok) throw new Error(`logout failed: ${res.status}`);
}

/**
 * Sign out: expire the server session cookie, then drop every cached query.
 * All cached data is tenant/session-scoped, so we `clear()` the whole cache
 * rather than leave a previous org's projects/week visible, and seed
 * auth-status to unauthenticated so the UI flips to "Connect Xero" without
 * waiting on a refetch (the always-on-mount refetch then confirms it).
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postLogout,
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData<AuthStatusData>(authStatusKey, {
        authenticated: false,
      });
    },
  });
}

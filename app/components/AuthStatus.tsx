"use client";

import { useEffect, useState } from "react";
import { useAuthStatus, useSwitchTenant } from "../hooks/auth";

/**
 * Reads /api/xero/status (via the shared, never-cached `useAuthStatus` hook)
 * and renders identity. Unauthenticated → a "Connect Xero" link that kicks off
 * the OAuth flow; authenticated → "Logged in as {name} at {org}" plus, when
 * the login has 2+ connected organisations, the org switcher (a select — one
 * token serves every connected org, so switching never re-authenticates; the
 * server re-resolves the per-tenant Projects userId and the client refetches
 * everything). Connecting an ADDITIONAL org later = the same "Connect Xero"
 * flow again; Xero adds the new connection and the list grows.
 *
 * Also surfaces a failed OAuth callback: /api/xero/callback error-redirects to
 * `/?auth_error=<code>&auth_error_message=<text>`, which previously nothing
 * rendered — a failed login looked identical to "not logged in yet". The
 * params are read post-mount (an effect, not render) so the server render and
 * hydration stay identical.
 */
export function AuthStatus() {
  const { data, isPending, isError } = useAuthStatus();
  const switchTenant = useSwitchTenant();

  // The callback's error message, if we landed here from a failed login.
  const [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("auth_error");
    if (!code) return;
    // Intentional: window.location is only readable post-mount (SSR renders
    // without it), so this is React's documented "sync from an external
    // system" case for setting state in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuthError(params.get("auth_error_message") ?? code);
    // One-shot: strip the params so a reload/bookmark doesn't re-show it.
    params.delete("auth_error");
    params.delete("auth_error_message");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
  }, []);

  if (isPending) return <p role="status">Checking sign-in…</p>;
  if (isError) return <p role="alert">Could not check sign-in status.</p>;

  if (!data.authenticated) {
    return (
      <div className="flex flex-col gap-2">
        {authError && (
          <p role="alert" data-testid="auth-error" className="text-sm text-red-600 dark:text-red-400">
            {authError}
          </p>
        )}
        <a
          href="/api/xero/login"
          className="inline-flex w-fit items-center rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Connect Xero
        </a>
      </div>
    );
  }

  const orgs = data.orgs ?? [];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p data-testid="auth-identity">
        Logged in as <strong>{data.user?.name}</strong> at{" "}
        <strong>{data.org}</strong>
      </p>
      {orgs.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          <span className="opacity-70">Organisation:</span>
          <select
            data-testid="org-switcher"
            aria-label="Switch organisation"
            value={data.tenantId}
            disabled={switchTenant.isPending}
            onChange={(e) => switchTenant.mutate(e.target.value)}
            className="rounded border border-black/15 bg-transparent px-2 py-1 text-sm disabled:opacity-50 dark:border-white/20 dark:bg-neutral-900"
          >
            {orgs.map((o) => (
              <option key={o.tenantId} value={o.tenantId}>
                {o.tenantName}
              </option>
            ))}
          </select>
          {switchTenant.isPending && (
            <span role="status" className="text-xs opacity-70">
              Switching…
            </span>
          )}
        </label>
      )}
      {switchTenant.isError && (
        <p
          role="alert"
          data-testid="org-switch-error"
          className="text-sm text-red-600 dark:text-red-400"
        >
          {switchTenant.error instanceof Error
            ? switchTenant.error.message
            : "Couldn't switch organisation."}
        </p>
      )}
    </div>
  );
}

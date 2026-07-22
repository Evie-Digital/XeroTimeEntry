// lib/xero/session.ts — in-memory Xero token session (ARCHITECTURE §4/§8.A).
//
// Tokens live ONLY in this server process's memory and are never written to
// disk. Stopping the app discards the session → a fresh Xero login next start.
// This module is reused by every later data slice, so its surface is kept small
// and explicit.

// Poison-pill: this module holds OAuth tokens, so importing it from a client
// component must be a BUILD error, not a silent secret leak. (Tests alias this
// to an empty stub — see vitest.config.ts.)
import "server-only";

/** Thrown when there is no usable session and the caller must re-authenticate. */
export class ReauthRequired extends Error {
  constructor(message = "reauth_required") {
    super(message);
    this.name = "ReauthRequired";
  }
}

/** One connected Xero organisation (from GET /connections). */
export type TenantRef = { tenantId: string; tenantName: string };

export type XeroSession = {
  accessToken: string;
  accessTokenExpiry: number; // epoch ms
  refreshToken: string;
  /** The ACTIVE organisation — every Projects call sends this tenant header. */
  tenantId: string;
  /** The Projects userId resolved in the ACTIVE organisation (re-resolved on
   *  switch — userIds are per-tenant). */
  userId: string;
  email: string;
  name: string;
  tenantName: string;
  /** EVERY organisation this login has connected to the app. One token serves
   *  them all (switching = changing the tenant header, no re-auth); adding a
   *  new org later means running the consent flow again, which re-populates
   *  this list from /connections. */
  tenants: TenantRef[];
};

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const EXPIRY_SKEW_MS = 90_000; // refresh ~90s before the access token expires

// Single-user app ⇒ exactly one session. It MUST be a true per-process
// singleton: Next.js gives each route handler its own module instance (and dev
// HMR reloads modules), so a bare module-level `let` is NOT shared between e.g.
// /api/xero/callback (which sets it) and /api/xero/status (which reads it). We
// therefore anchor the state on `globalThis`, the one object all module
// instances in the process share. (Mocked tests happen to share a module graph,
// so this bug only surfaces in the real runtime.)
type SessionStore = {
  session: XeroSession | null;
  sessionId: string | null; // signed session-cookie id marking the authorized browser
  refreshInFlight: Promise<XeroSession> | null;
};

const globalRef = globalThis as unknown as {
  __xeroSessionStore?: SessionStore;
};

const store: SessionStore = (globalRef.__xeroSessionStore ??= {
  session: null,
  sessionId: null,
  refreshInFlight: null,
});

export const getSession = (): XeroSession | null => store.session;
export const setSession = (s: XeroSession): void => {
  store.session = s;
};
export const clearSession = (): void => {
  store.session = null;
  store.sessionId = null;
  store.refreshInFlight = null;
};

export const getSessionId = (): string | null => store.sessionId;
export const setSessionId = (id: string): void => {
  store.sessionId = id;
};

/** Returns a valid access token, refreshing proactively if near expiry. */
export async function getFreshAccessToken(): Promise<string> {
  if (!store.session) throw new ReauthRequired("no session");
  if (Date.now() < store.session.accessTokenExpiry - EXPIRY_SKEW_MS) {
    return store.session.accessToken;
  }
  return (await refreshTokens()).accessToken;
}

/**
 * Single-flight refresh: concurrent callers share exactly one round-trip.
 * The rotated refresh token Xero returns is persisted (the old one discarded).
 */
export function refreshTokens(): Promise<XeroSession> {
  if (!store.session) return Promise.reject(new ReauthRequired("no session"));
  if (store.refreshInFlight) return store.refreshInFlight;
  const current = store.session;
  store.refreshInFlight = doRefresh(current).finally(() => {
    store.refreshInFlight = null;
  });
  return store.refreshInFlight;
}

async function doRefresh(current: XeroSession): Promise<XeroSession> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`,
        ).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
    }),
  });

  if (!res.ok) {
    clearSession(); // expired / revoked → force re-auth
    throw new ReauthRequired(`refresh failed: ${res.status}`);
  }

  const tok = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Xero ROTATES the refresh token every use — persist the new one, drop the old.
  store.session = {
    ...current,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    accessTokenExpiry: Date.now() + tok.expires_in * 1000,
  };
  return store.session;
}

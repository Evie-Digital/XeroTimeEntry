// lib/xero/session.ts — in-memory Xero token session (ARCHITECTURE §4/§8.A).
//
// Tokens live ONLY in this server process's memory and are never written to
// disk. Stopping the app discards the session → a fresh Xero login next start.
// This module is reused by every later data slice, so its surface is kept small
// and explicit.

/** Thrown when there is no usable session and the caller must re-authenticate. */
export class ReauthRequired extends Error {
  constructor(message = "reauth_required") {
    super(message);
    this.name = "ReauthRequired";
  }
}

export type XeroSession = {
  accessToken: string;
  accessTokenExpiry: number; // epoch ms
  refreshToken: string;
  tenantId: string;
  userId: string;
  email: string;
  name: string;
  tenantName: string;
};

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const EXPIRY_SKEW_MS = 90_000; // refresh ~90s before the access token expires

// Module-level singleton state. Single-user app ⇒ exactly one session.
let session: XeroSession | null = null;
let refreshInFlight: Promise<XeroSession> | null = null;

// The signed session-cookie id that marks the currently-authorized browser.
// Kept alongside the token session (not inside XeroSession, which mirrors the
// ARCHITECTURE §8.A shape exactly) and cleared together with it.
let sessionId: string | null = null;

export const getSession = (): XeroSession | null => session;
export const setSession = (s: XeroSession): void => {
  session = s;
};
export const clearSession = (): void => {
  session = null;
  sessionId = null;
  refreshInFlight = null;
};

export const getSessionId = (): string | null => sessionId;
export const setSessionId = (id: string): void => {
  sessionId = id;
};

/** Returns a valid access token, refreshing proactively if near expiry. */
export async function getFreshAccessToken(): Promise<string> {
  if (!session) throw new ReauthRequired("no session");
  if (Date.now() < session.accessTokenExpiry - EXPIRY_SKEW_MS) {
    return session.accessToken;
  }
  return (await refreshTokens()).accessToken;
}

/**
 * Single-flight refresh: concurrent callers share exactly one round-trip.
 * The rotated refresh token Xero returns is persisted (the old one discarded).
 */
export function refreshTokens(): Promise<XeroSession> {
  if (!session) return Promise.reject(new ReauthRequired("no session"));
  if (refreshInFlight) return refreshInFlight;
  const current = session;
  refreshInFlight = doRefresh(current).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
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
  session = {
    ...current,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    accessTokenExpiry: Date.now() + tok.expires_in * 1000,
  };
  return session;
}

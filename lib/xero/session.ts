import "server-only";

// lib/xero/session.ts — the Xero token session (ARCHITECTURE §4).
//
// SERVERLESS-SAFE STORAGE (Vercel): there is no shared server memory across
// function instances, so the session can't live in a module global. Instead
// each request DECRYPTS its session from the httpOnly cookie into a
// request-scoped context held in an `AsyncLocalStorage`, mutates it in place
// (token refresh rotates the tokens; the tenant switch re-points it), and the
// route wrapper (lib/api/with-session) RE-ENCRYPTS it back onto the response
// cookie when it changed. Tokens still never reach the client JS — the cookie
// is httpOnly and AES-256-GCM encrypted with the server secret.
//
// The single-flight refresh here dedupes concurrent calls WITHIN one request
// (e.g. the /week fan-out sharing one refresh); it can't dedupe across separate
// serverless instances (two parallel routes may each refresh and rotate). Xero
// grants a ~30-min grace window on a rotated refresh token, which self-heals
// that race — the accepted trade-off of the cookie (no-infra) storage model.

import { AsyncLocalStorage } from "node:async_hooks";

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
  /** EVERY organisation this login has connected. One token serves them all
   *  (switching = changing the tenant header, no re-auth). */
  tenants: TenantRef[];
};

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const EXPIRY_SKEW_MS = 90_000; // refresh ~90s before the access token expires

/** The per-request session context carried through `AsyncLocalStorage`. */
export type SessionContext = {
  session: XeroSession;
  /** Set when tokens were refreshed or the session was replaced, so the route
   *  wrapper knows to re-persist the cookie. */
  dirty: boolean;
  refreshInFlight: Promise<XeroSession> | null;
};

const als = new AsyncLocalStorage<SessionContext>();

/**
 * Run `fn` with `session` as the ambient request session. Returns `fn`'s result
 * plus the (possibly refreshed / replaced) session and whether it changed, so
 * the caller can persist it back onto the response cookie.
 */
export async function runWithSession<T>(
  session: XeroSession,
  fn: () => Promise<T>,
): Promise<{ result: T; session: XeroSession; dirty: boolean }> {
  const ctx: SessionContext = { session, dirty: false, refreshInFlight: null };
  const result = await als.run(ctx, fn);
  return { result, session: ctx.session, dirty: ctx.dirty };
}

function ctxOrThrow(): SessionContext {
  const ctx = als.getStore();
  if (!ctx) throw new ReauthRequired("no session");
  return ctx;
}

/** The ambient request session (throws `ReauthRequired` outside a run scope). */
export function getCurrentSession(): XeroSession {
  return ctxOrThrow().session;
}

/**
 * Replace the ambient session (tenant switch, callback identity resolution) and
 * mark the context dirty so the wrapper re-persists the cookie.
 */
export function updateCurrentSession(next: XeroSession): void {
  const ctx = ctxOrThrow();
  ctx.session = next;
  ctx.dirty = true;
}

/** Returns a valid access token, refreshing proactively if near expiry. */
export async function getFreshAccessToken(): Promise<string> {
  const ctx = ctxOrThrow();
  if (Date.now() < ctx.session.accessTokenExpiry - EXPIRY_SKEW_MS) {
    return ctx.session.accessToken;
  }
  return (await refreshTokens()).accessToken;
}

/**
 * Single-flight refresh WITHIN this request: concurrent callers (the /week
 * fan-out) share one round-trip. The rotated refresh token Xero returns
 * replaces the old one and marks the context dirty (→ new cookie).
 */
export function refreshTokens(): Promise<XeroSession> {
  const ctx = als.getStore();
  if (!ctx) return Promise.reject(new ReauthRequired("no session"));
  if (ctx.refreshInFlight) return ctx.refreshInFlight;
  ctx.refreshInFlight = doRefresh(ctx).finally(() => {
    ctx.refreshInFlight = null;
  });
  return ctx.refreshInFlight;
}

async function doRefresh(ctx: SessionContext): Promise<XeroSession> {
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
      refresh_token: ctx.session.refreshToken,
    }),
  });

  if (!res.ok) {
    // Expired / revoked → the wrapper clears the cookie and forces re-auth.
    throw new ReauthRequired(`refresh failed: ${res.status}`);
  }

  const tok = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Xero ROTATES the refresh token every use — persist the new one, drop the old.
  ctx.session = {
    ...ctx.session,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    accessTokenExpiry: Date.now() + tok.expires_in * 1000,
  };
  ctx.dirty = true;
  return ctx.session;
}

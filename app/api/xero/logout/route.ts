import { NextResponse } from "next/server";
import { cookieOptions, SESSION_COOKIE } from "@/lib/xero/cookie";

// POST /api/xero/logout — sign out by expiring the encrypted session cookie.
//
// Deliberately NOT wrapped in `withSession`: that guard 401s on a missing or
// stale cookie, but logout must succeed unconditionally (idempotent — logging
// out when already logged out is fine). It never reads the session; it just
// clears it. The whole session lives in this one cookie (serverless: there is
// no server-side session to invalidate), so expiring it fully signs out — the
// next /api/xero/status decrypts nothing and returns `authenticated: false`.
//
// POST, not GET, so a link prefetch or an <img>/GET-style CSRF can't silently
// sign the user out; the client calls it via fetch. The Xero tokens are not
// revoked upstream (they simply expire), but they only ever lived inside this
// httpOnly cookie, so clearing it makes them unreachable.
export function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}

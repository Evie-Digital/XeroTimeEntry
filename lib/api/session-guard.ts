// lib/api/session-guard.ts — the auth guard every data/write route uses.
//
// A route is authorized only when the request carries the signed session cookie
// whose id matches the current in-memory session id AND a token session exists
// (ARCHITECTURE §4/§5: "all routes except login/callback require the session
// cookie"). Mirrors the check in /api/xero/status. On failure it throws
// `ReauthRequired`, which `withErrorEnvelope` maps to the 401 `reauth_required`
// envelope.

import type { NextRequest } from "next/server";
import {
  getSession,
  getSessionId,
  ReauthRequired,
  type XeroSession,
} from "@/lib/xero/session";
import { SESSION_COOKIE, verifyValue } from "@/lib/xero/cookie";

/** Returns the live session, or throws `ReauthRequired` if the request is not
 *  from the authorized browser / there is no session. */
export function requireSession(req: NextRequest): XeroSession {
  const sid = verifyValue(req.cookies.get(SESSION_COOKIE)?.value);
  const session = getSession();
  if (!sid || sid !== getSessionId() || !session) {
    throw new ReauthRequired("no session");
  }
  return session;
}

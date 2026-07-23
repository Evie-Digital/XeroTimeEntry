// lib/api/with-session.ts — the auth + session wrapper every protected route
// uses (ARCHITECTURE §4/§5). Replaces the old `requireSession` guard now that
// the session lives in the (encrypted) cookie rather than server memory.
//
// It:
//   1. decrypts the session from the cookie — no session → 401 `reauth_required`
//      (and clears any stale cookie),
//   2. runs the handler inside an `AsyncLocalStorage` session context so the
//      shared Xero client (lib/xero/client) can read/refresh tokens without the
//      session being threaded through every call,
//   3. if the session changed during the request (a token refresh rotated the
//      tokens, or a tenant switch replaced it), RE-ENCRYPTS it onto the response
//      cookie so the next request sees the new tokens,
//   4. maps any thrown Xero-taxonomy error to the uniform envelope (like the old
//      `withErrorEnvelope`), clearing the cookie on `reauth_required`.
//
// Uses a rest-tuple for trailing args so a static route stays `(req, session)`
// and a dynamic route keeps its typed `{ params }` context.

import { NextResponse, type NextRequest } from "next/server";
import {
  ReauthRequired,
  runWithSession,
  type XeroSession,
} from "@/lib/xero/session";
import {
  cookieOptions,
  decryptSession,
  encryptSession,
  SESSION_COOKIE,
} from "@/lib/xero/cookie";
import { toErrorEnvelope } from "./errors";

/** Clear the session cookie on a response (reauth). */
function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

export function withSession<Args extends unknown[]>(
  handler: (
    req: NextRequest,
    session: XeroSession,
    ...args: Args
  ) => NextResponse | Promise<NextResponse>,
): (req: NextRequest, ...args: Args) => Promise<NextResponse> {
  return async (req, ...args) => {
    const session = decryptSession(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const envelope = toErrorEnvelope(new ReauthRequired());
      const res = NextResponse.json(envelope, { status: envelope.status });
      clearSessionCookie(res);
      return res;
    }

    try {
      const {
        result,
        session: finalSession,
        dirty,
      } = await runWithSession(session, () =>
        Promise.resolve(handler(req, session, ...args)),
      );
      if (dirty) {
        result.cookies.set(
          SESSION_COOKIE,
          encryptSession(finalSession),
          cookieOptions,
        );
      }
      return result;
    } catch (err) {
      const envelope = toErrorEnvelope(err);
      const res = NextResponse.json(envelope, { status: envelope.status });
      if (envelope.error.code === "reauth_required") clearSessionCookie(res);
      return res;
    }
  };
}

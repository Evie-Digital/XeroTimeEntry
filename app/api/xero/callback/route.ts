import { NextResponse, type NextRequest } from "next/server";
import {
  getCurrentSession,
  runWithSession,
  updateCurrentSession,
  type XeroSession,
} from "@/lib/xero/session";
import { paginate, xeroFetch, XERO_API_BASE } from "@/lib/xero/client";
import { decodeJwtPayload, exchangeCodeForTokens } from "@/lib/xero/oauth";
import {
  cookieOptions,
  encryptSession,
  SESSION_COOKIE,
  STATE_COOKIE,
  verifyValue,
} from "@/lib/xero/cookie";

type Connection = { tenantId: string; tenantName: string; tenantType?: string };
type ProjectsUser = { userId: string; name: string; email: string };

/** Carries the errorRedirect code + message out of the resolution step. */
class CallbackError extends Error {
  constructor(
    public code: string,
    public userMessage: string,
  ) {
    super(code);
  }
}

// GET /api/xero/callback — the OAuth redirect target. Verify CSRF state,
// exchange the code, resolve tenant(s) (/connections) + userId (/projectsusers
// email-match) inside a session context, then ENCRYPT the resolved session into
// the httpOnly cookie and land the user home. (Serverless-safe: the session
// travels in the cookie, not server memory.)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { origin, searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = verifyValue(req.cookies.get(STATE_COOKIE)?.value);

  // CSRF: the state in the query must match the one we signed into the cookie.
  if (!code || !state || !expectedState || state !== expectedState) {
    return errorRedirect(
      origin,
      "invalid_state",
      "Sign-in could not be verified (state mismatch). Please try connecting again.",
    );
  }

  // 1) Exchange the code for tokens (confidential client).
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch {
    return errorRedirect(
      origin,
      "token_exchange_failed",
      "Could not exchange the Xero authorization code.",
    );
  }

  // Caller identity from the id_token.
  const claims = decodeJwtPayload(tokens.id_token);
  const email = String(claims.email ?? "").toLowerCase();
  const name = String(claims.name ?? claims.given_name ?? email);

  // The session we'll resolve identity into. Tenant + user filled in below.
  const initial: XeroSession = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessTokenExpiry: Date.now() + tokens.expires_in * 1000,
    tenantId: "",
    userId: "",
    email,
    name,
    tenantName: "",
    tenants: [],
  };

  let resolved: XeroSession;
  try {
    const out = await runWithSession(initial, async () => {
      // 2) Resolve the tenant(s) via /connections (no tenant header yet). KEEP
      // the full org list so the switcher can swap without re-auth; first
      // org starts active.
      let tenants: Connection[];
      try {
        const res = await xeroFetch("/connections", { base: XERO_API_BASE });
        if (!res.ok) throw new Error(`connections ${res.status}`);
        const conns = (await res.json()) as Connection[];
        tenants = conns.filter(
          (c) => !c.tenantType || c.tenantType === "ORGANISATION",
        );
        if (!tenants.length) throw new Error("no connections");
      } catch {
        throw new CallbackError(
          "no_tenant",
          "No Xero organisation is connected to this login.",
        );
      }
      updateCurrentSession({
        ...getCurrentSession(),
        tenantId: tenants[0].tenantId,
        tenantName: tenants[0].tenantName,
        tenants: tenants.map((c) => ({
          tenantId: c.tenantId,
          tenantName: c.tenantName,
        })),
      });

      // 3) Resolve the Projects userId by email-matching /projectsusers.
      let userId: string;
      try {
        const users = await paginate<ProjectsUser>("/projectsusers");
        const match = users.find(
          (u) => (u.email ?? "").toLowerCase() === email,
        );
        if (!match) {
          throw new CallbackError(
            "not_projects_user",
            "This Xero login is not a Projects user in this organisation, so you cannot log time here.",
          );
        }
        userId = match.userId;
      } catch (err) {
        if (err instanceof CallbackError) throw err;
        throw new CallbackError(
          "projectsusers_failed",
          "Could not load Projects users from Xero.",
        );
      }
      updateCurrentSession({ ...getCurrentSession(), userId });
    });
    resolved = out.session;
  } catch (err) {
    if (err instanceof CallbackError) {
      return errorRedirect(origin, err.code, err.userMessage);
    }
    return errorRedirect(
      origin,
      "unexpected",
      "Sign-in failed unexpectedly. Please try connecting again.",
    );
  }

  // Success: encrypt the resolved session into the httpOnly cookie (tokens
  // never reach the client JS) and land home.
  const res = NextResponse.redirect(new URL("/", origin), 302);
  res.cookies.set(SESSION_COOKIE, encryptSession(resolved), cookieOptions);
  return res;
}

function errorRedirect(
  origin: string,
  code: string,
  message: string,
): NextResponse {
  const dest = new URL("/", origin);
  dest.searchParams.set("auth_error", code);
  dest.searchParams.set("auth_error_message", message);
  return NextResponse.redirect(dest, 302);
}

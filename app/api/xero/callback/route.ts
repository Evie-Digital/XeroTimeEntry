import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  clearSession,
  getSession,
  setSession,
  setSessionId,
} from "@/lib/xero/session";
import { paginate, xeroFetch, XERO_API_BASE } from "@/lib/xero/client";
import { decodeJwtPayload, exchangeCodeForTokens } from "@/lib/xero/oauth";
import {
  cookieOptions,
  SESSION_COOKIE,
  signValue,
  STATE_COOKIE,
  verifyValue,
} from "@/lib/xero/cookie";

type Connection = { tenantId: string; tenantName: string; tenantType?: string };
type ProjectsUser = { userId: string; name: string; email: string };

// GET /api/xero/callback — the OAuth redirect target. Verify CSRF state,
// exchange the code, populate the in-memory session, resolve tenantId
// (/connections) + userId (/projectsusers email-match), then set the signed
// httpOnly session cookie and land the user home.
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

  // Establish the in-memory session; tenant + user are resolved next.
  setSession({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessTokenExpiry: Date.now() + tokens.expires_in * 1000,
    tenantId: "",
    userId: "",
    email,
    name,
    tenantName: "",
    tenants: [],
  });

  // 2) Resolve the tenant(s) via /connections (no tenant header needed yet).
  // KEEP the full organisation list: one token serves every connected org, so
  // the org switcher (POST /api/xero/tenant) can swap the active tenant
  // without re-authenticating. The first org starts active.
  let tenants: { tenantId: string; tenantName: string }[] = [];
  try {
    const res = await xeroFetch("/connections", { base: XERO_API_BASE });
    if (!res.ok) throw new Error(`connections ${res.status}`);
    const conns = (await res.json()) as Connection[];
    tenants = conns
      .filter((c) => !c.tenantType || c.tenantType === "ORGANISATION")
      .map((c) => ({ tenantId: c.tenantId, tenantName: c.tenantName }));
    if (!tenants.length) throw new Error("no connections");
  } catch {
    clearSession();
    return errorRedirect(
      origin,
      "no_tenant",
      "No Xero organisation is connected to this login.",
    );
  }
  setSession({
    ...getSession()!,
    tenantId: tenants[0].tenantId,
    tenantName: tenants[0].tenantName,
    tenants,
  });

  // 3) Resolve the Projects userId by email-matching /projectsusers.
  let userId = "";
  try {
    const users = await paginate<ProjectsUser>("/projectsusers");
    const match = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!match) {
      clearSession();
      return errorRedirect(
        origin,
        "not_projects_user",
        "This Xero login is not a Projects user in this organisation, so you cannot log time here.",
      );
    }
    userId = match.userId;
  } catch {
    clearSession();
    return errorRedirect(
      origin,
      "projectsusers_failed",
      "Could not load Projects users from Xero.",
    );
  }
  setSession({ ...getSession()!, userId });

  // Success: mint a signed httpOnly session cookie (tokens stay server-side).
  const sessionId = crypto.randomBytes(24).toString("hex");
  setSessionId(sessionId);
  const res = NextResponse.redirect(new URL("/", origin), 302);
  res.cookies.set(SESSION_COOKIE, signValue(sessionId), cookieOptions);
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

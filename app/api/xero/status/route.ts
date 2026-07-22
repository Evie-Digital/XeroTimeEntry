import { NextResponse, type NextRequest } from "next/server";
import { getSession, getSessionId } from "@/lib/xero/session";
import { SESSION_COOKIE, verifyValue } from "@/lib/xero/cookie";

// GET /api/xero/status → identity from the in-memory session (no Xero call).
// Authorized only when the signed cookie's session id matches the current
// server-side session id AND a session exists.
export function GET(req: NextRequest): NextResponse {
  const sid = verifyValue(req.cookies.get(SESSION_COOKIE)?.value);
  const session = getSession();

  if (!sid || sid !== getSessionId() || !session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    user: { name: session.name, email: session.email },
    org: session.tenantName,
    // The org switcher: the ACTIVE tenant + every connected organisation
    // (switching is POST /api/xero/tenant — no re-auth needed).
    tenantId: session.tenantId,
    orgs: session.tenants,
  });
}

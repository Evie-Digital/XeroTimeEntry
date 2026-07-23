import { NextResponse, type NextRequest } from "next/server";
import { decryptSession, SESSION_COOKIE } from "@/lib/xero/cookie";

// GET /api/xero/status → identity from the encrypted session cookie (no Xero
// call). Authorized iff the cookie decrypts to a session — decryption success
// (AES-256-GCM auth tag) proves this server minted it, so no separate id check
// is needed (the old in-memory session-id comparison is obsolete).
export function GET(req: NextRequest): NextResponse {
  const session = decryptSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
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

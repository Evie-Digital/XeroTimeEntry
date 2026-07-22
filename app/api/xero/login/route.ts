import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/xero/oauth";
import { cookieOptions, signValue, STATE_COOKIE } from "@/lib/xero/cookie";

// GET /api/xero/login → build the Xero authorize URL with a CSRF `state`,
// stash the state in a short-lived signed httpOnly cookie, and 302 to Xero.
export function GET() {
  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthorizeUrl(state), 302);
  res.cookies.set(STATE_COOKIE, signValue(state), {
    ...cookieOptions,
    maxAge: 600, // 10 minutes — just long enough to complete the round-trip
  });
  return res;
}

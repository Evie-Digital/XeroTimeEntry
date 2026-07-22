// lib/xero/cookie.ts — HMAC-signed cookie values (Node built-in `crypto`, no
// extra dependency). We only ever store opaque, non-secret ids in cookies (a
// random session id, a random CSRF state) — the tokens themselves stay in
// server memory — so a signed-but-not-encrypted cookie is sufficient: the
// signature proves the value was minted by this server and not tampered with.

import crypto from "node:crypto";

export const SESSION_COOKIE = "xero_session";
export const STATE_COOKIE = "xero_oauth_state";

/** Shared cookie attributes. `secure` only in production so localhost http works. */
export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const, // allow the cookie on the top-level OAuth redirect back
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

function secret(): string {
  return process.env.SESSION_COOKIE_SECRET ?? "";
}

function hmac(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

/** `value.signature` — signature is over `value` with the cookie secret. */
export function signValue(value: string): string {
  return `${value}.${hmac(value)}`;
}

/** Returns the original value if the signature verifies, else `null`. */
export function verifyValue(signed: string | undefined | null): string | null {
  if (!signed) return null;
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = hmac(value);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  return value;
}

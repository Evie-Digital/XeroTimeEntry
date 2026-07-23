// lib/xero/cookie.ts — cookie helpers (Node built-in `crypto`, no extra deps).
//
// Two shapes:
//   • STATE_COOKIE — a short-lived HMAC-SIGNED (not encrypted) random CSRF
//     state; the value is non-secret, the signature just proves we minted it.
//   • SESSION_COOKIE — the AES-256-GCM ENCRYPTED Xero token session. Because
//     the app runs on serverless (no shared server memory), the tokens travel
//     in this httpOnly cookie rather than server RAM — so it must be encrypted,
//     not merely signed. GCM gives confidentiality AND integrity in one pass.

import crypto from "node:crypto";
import type { XeroSession } from "./session";

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

// --- Session encryption (AES-256-GCM) ---------------------------------------

// Derive a 32-byte key from the cookie secret once per secret value (scrypt is
// deliberately slow, so we memoise rather than pay it per request).
let cachedKey: { secret: string; key: Buffer } | null = null;
function encKey(): Buffer {
  const s = secret();
  if (!cachedKey || cachedKey.secret !== s) {
    cachedKey = { secret: s, key: crypto.scryptSync(s, "xero-session-enc", 32) };
  }
  return cachedKey.key;
}

/** Encrypt a session into a compact `base64url(iv | tag | ciphertext)` cookie
 *  value. Throws only if the environment secret is unusable. */
export function encryptSession(session: XeroSession): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(session), "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64url");
}

/** Decrypt a session cookie value. Returns `null` on any tampering, wrong key,
 *  or malformed input — the caller treats `null` as "not authenticated". */
export function decryptSession(
  value: string | undefined | null,
): XeroSession | null {
  if (!value) return null;
  try {
    const buf = Buffer.from(value, "base64url");
    if (buf.length < 28) return null; // 12 iv + 16 tag + ≥0 ciphertext
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(pt.toString("utf8")) as XeroSession;
  } catch {
    return null;
  }
}

// lib/xero/oauth.ts — the Authorization-Code flow bits used by the auth routes:
// building the authorize URL, exchanging the code (confidential client, Basic
// auth), and decoding the id_token to read the caller's email claim.

import { IDENTITY_BASE } from "./client";

// Scopes (ARCHITECTURE §4). `projects` = read+write, `offline_access` = refresh
// token, `email` = required to resolve the Projects userId at callback.
export const SCOPES = "openid profile email projects offline_access";

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";

/** Build the Xero authorize URL with the CSRF `state`. */
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID ?? "",
    redirect_uri: process.env.XERO_REDIRECT_URI ?? "",
    scope: SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type XeroTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  id_token: string;
  token_type: string;
  scope?: string;
};

/** Exchange the authorization `code` for tokens (grant_type=authorization_code). */
export async function exchangeCodeForTokens(
  code: string,
): Promise<XeroTokenResponse> {
  const res = await fetch(`${IDENTITY_BASE}/connect/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`,
        ).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.XERO_REDIRECT_URI ?? "",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  return (await res.json()) as XeroTokenResponse;
}

/**
 * Decode a JWT payload without signature verification. The id_token arrives
 * directly from Xero's token endpoint over TLS, so we trust its claims and only
 * need the `email` (+ `name`) to resolve identity (ARCHITECTURE §4).
 */
export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length < 2) throw new Error("invalid jwt");
  const json = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

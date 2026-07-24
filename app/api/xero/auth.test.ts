import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { GET as loginGET } from "./login/route";
import { GET as callbackGET } from "./callback/route";
import { GET as statusGET } from "./status/route";
import { POST as logoutPOST } from "./logout/route";
import {
  getFreshAccessToken,
  runWithSession,
  type XeroSession,
} from "@/lib/xero/session";
import { xeroFetch } from "@/lib/xero/client";
import {
  decryptSession,
  SESSION_COOKIE,
  signValue,
  STATE_COOKIE,
  verifyValue,
} from "@/lib/xero/cookie";
import { makeIdToken } from "@/test/msw/xero";

// Seam 1: exercise the API route handlers directly, with Xero mocked via MSW.
// No live OAuth ever runs. The session now lives in the encrypted cookie, not
// server memory, so tests read it back by decrypting the response cookie.

function callbackRequest(code: string, state: string, cookieState = state) {
  return new NextRequest(
    `http://localhost:3000/api/xero/callback?code=${code}&state=${state}`,
    { headers: { cookie: `${STATE_COOKIE}=${signValue(cookieState)}` } },
  );
}

function baseSession(overrides: Partial<XeroSession> = {}): XeroSession {
  return {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    accessTokenExpiry: Date.now() + 5 * 60_000,
    tenantId: "tenant-abc",
    userId: "user-2",
    email: "gavin@evie.digital",
    name: "Gavin Harris",
    tenantName: "Evie Digital",
    tenants: [{ tenantId: "tenant-abc", tenantName: "Evie Digital" }],
    ...overrides,
  };
}

describe("GET /api/xero/login", () => {
  it("redirects to the Xero authorize URL and sets a signed state cookie", () => {
    const res = loginGET();
    expect(res.status).toBe(302);

    const loc = res.headers.get("location")!;
    expect(loc).toContain("https://login.xero.com/identity/connect/authorize");

    const u = new URL(loc);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("test-client-id");
    expect(u.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/xero/callback",
    );
    expect(u.searchParams.get("scope")).toBe(
      "openid profile email projects offline_access",
    );

    const state = u.searchParams.get("state")!;
    expect(state).toBeTruthy();
    const cookie = res.cookies.get(STATE_COOKIE)!;
    expect(cookie).toBeTruthy();
    expect(cookie.httpOnly).toBe(true);
    // The cookie's signed value must decode back to the URL's state.
    expect(verifyValue(cookie.value)).toBe(state);
  });
});

describe("GET /api/xero/callback", () => {
  it("exchanges the code, resolves tenant + user, sets the session cookie, and exposes identity via /status", async () => {
    const res = await callbackGET(callbackRequest("auth-code", "state-xyz"));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");

    const cookie = res.cookies.get(SESSION_COOKIE);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);

    // Tokens + resolved identity are ENCRYPTED into the cookie (never server
    // memory, never client JS). Decrypting proves the round-trip.
    const session = decryptSession(cookie!.value);
    expect(session?.accessToken).toBe("access-initial");
    expect(session?.refreshToken).toBe("refresh-initial");
    expect(session?.tenantId).toBe("tenant-abc");
    expect(session?.tenantName).toBe("Evie Digital");
    expect(session?.userId).toBe("user-2");
    expect(session?.email).toBe("gavin@evie.digital");

    // /status reads identity back through the encrypted session cookie.
    const statusReq = new NextRequest("http://localhost:3000/api/xero/status", {
      headers: { cookie: `${SESSION_COOKIE}=${cookie!.value}` },
    });
    const statusRes = statusGET(statusReq);
    await expect(statusRes.json()).resolves.toMatchObject({
      authenticated: true,
      org: "Evie Digital",
      user: { name: "Gavin Harris", email: "gavin@evie.digital" },
    });
  });

  it("rejects a callback whose state does not match the signed cookie (CSRF)", async () => {
    const res = await callbackGET(
      callbackRequest("auth-code", "state-xyz", "attacker-state"),
    );
    expect(res.headers.get("location")).toContain("auth_error=invalid_state");
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("guards a login with no matching Projects user (no licence) and does NOT log in", async () => {
    server.use(
      http.get(
        "https://api.xero.com/projects.xro/2.0/projectsusers",
        () =>
          HttpResponse.json({
            pagination: { page: 1, pageCount: 1, pageSize: 50, itemCount: 1 },
            items: [
              { userId: "u9", name: "Nobody", email: "nobody@example.com" },
            ],
          }),
      ),
    );

    const res = await callbackGET(callbackRequest("auth-code", "state-xyz"));

    expect(res.headers.get("location")).toContain("auth_error=not_projects_user");
    // No session cookie set (login did not complete).
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });
});

describe("GET /api/xero/status", () => {
  it("reports unauthenticated when there is no valid session cookie", async () => {
    const req = new NextRequest("http://localhost:3000/api/xero/status");
    await expect(statusGET(req).json()).resolves.toEqual({
      authenticated: false,
    });
  });
});

describe("POST /api/xero/logout", () => {
  it("expires the session cookie so a subsequent /status is unauthenticated", async () => {
    const res = logoutPOST();
    await expect(res.json()).resolves.toEqual({ ok: true });

    // The cookie is cleared (empty value, immediate expiry).
    const cookie = res.cookies.get(SESSION_COOKIE)!;
    expect(cookie.value).toBe("");
    expect(cookie.maxAge).toBe(0);
    expect(cookie.httpOnly).toBe(true);

    // An empty session cookie decrypts to nothing → /status is unauthenticated.
    const statusReq = new NextRequest("http://localhost:3000/api/xero/status", {
      headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` },
    });
    await expect(statusGET(statusReq).json()).resolves.toEqual({
      authenticated: false,
    });
  });

  it("is idempotent — logging out with no session still succeeds", async () => {
    const res = logoutPOST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});

describe("token refresh", () => {
  it("refreshes exactly once under concurrent callers and persists the rotated refresh token (single-flight)", async () => {
    let refreshCalls = 0;
    server.use(
      http.post(
        "https://identity.xero.com/connect/token",
        async ({ request }) => {
          const body = new URLSearchParams(await request.text());
          if (body.get("grant_type") === "refresh_token") {
            refreshCalls += 1;
            return HttpResponse.json({
              access_token: "access-2",
              refresh_token: "refresh-2",
              expires_in: 1800,
              token_type: "Bearer",
              id_token: makeIdToken({ email: "gavin@evie.digital" }),
            });
          }
          return new HttpResponse(null, { status: 400 });
        },
      ),
    );

    // Access token already expired ⇒ next use must proactively refresh. The
    // single-flight is per-request-context, so we run inside runWithSession.
    const { session, dirty } = await runWithSession(
      baseSession({ accessTokenExpiry: Date.now() - 1_000 }),
      async () => {
        const tokens = await Promise.all([
          getFreshAccessToken(),
          getFreshAccessToken(),
          getFreshAccessToken(),
        ]);
        expect(tokens).toEqual(["access-2", "access-2", "access-2"]);
      },
    );

    expect(refreshCalls).toBe(1); // single-flight: one round-trip for all three
    expect(session.refreshToken).toBe("refresh-2"); // rotated + persisted
    expect(dirty).toBe(true); // → the wrapper re-persists the cookie
  });

  it("on a 401 refreshes once and retries the request once", async () => {
    let refreshCalls = 0;
    let pingHits = 0;
    server.use(
      http.post(
        "https://identity.xero.com/connect/token",
        async ({ request }) => {
          const body = new URLSearchParams(await request.text());
          if (body.get("grant_type") === "refresh_token") {
            refreshCalls += 1;
            return HttpResponse.json({
              access_token: "access-2",
              refresh_token: "refresh-2",
              expires_in: 1800,
              token_type: "Bearer",
              id_token: makeIdToken({}),
            });
          }
          return new HttpResponse(null, { status: 400 });
        },
      ),
      http.get("https://api.xero.com/projects.xro/2.0/ping", () => {
        pingHits += 1;
        if (pingHits === 1) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json({ ok: true });
      }),
    );

    const { session } = await runWithSession(baseSession(), async () => {
      const res = await xeroFetch("/ping"); // fresh token; 401 forces a refresh
      expect(res.ok).toBe(true);
    });

    expect(pingHits).toBe(2); // original + one retry
    expect(refreshCalls).toBe(1); // reactive refresh happened once
    expect(session.accessToken).toBe("access-2");
  });
});

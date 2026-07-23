import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import {
  getCurrentSession,
  getFreshAccessToken,
  ReauthRequired,
  runWithSession,
  updateCurrentSession,
  type XeroSession,
} from "./session";
import { decryptSession, encryptSession } from "./cookie";

// The serverless-safe session model (ARCHITECTURE §4): the session is encrypted
// into the cookie (no server memory), and each request runs inside a
// `runWithSession` context that the Xero client reads/refreshes and the route
// wrapper re-persists when it changed.

function sample(overrides: Partial<XeroSession> = {}): XeroSession {
  return {
    accessToken: "access-1",
    accessTokenExpiry: Date.now() + 30 * 60_000,
    refreshToken: "refresh-1",
    tenantId: "tenant-1",
    userId: "user-1",
    email: "gavin@evie.digital",
    name: "Gavin",
    tenantName: "Acme Ltd",
    tenants: [{ tenantId: "tenant-1", tenantName: "Acme Ltd" }],
    ...overrides,
  };
}

describe("session cookie encryption", () => {
  it("round-trips a session through encrypt → decrypt", () => {
    const s = sample();
    expect(decryptSession(encryptSession(s))).toEqual(s);
  });

  it("returns null for a missing, malformed, or tampered cookie", () => {
    expect(decryptSession(undefined)).toBeNull();
    expect(decryptSession("")).toBeNull();
    expect(decryptSession("not-a-real-cipher")).toBeNull();
    const good = encryptSession(sample());
    const tampered = good.slice(0, -2) + (good.endsWith("AA") ? "BB" : "AA");
    expect(decryptSession(tampered)).toBeNull(); // GCM auth-tag rejects it
  });
});

describe("runWithSession — ambient session + refresh", () => {
  it("throws ReauthRequired when read outside a session scope", () => {
    expect(() => getCurrentSession()).toThrow(ReauthRequired);
  });

  it("exposes the ambient session inside the scope", async () => {
    const { result } = await runWithSession(sample(), async () =>
      getCurrentSession().userId,
    );
    expect(result).toBe("user-1");
  });

  it("does not refresh a still-fresh token (session stays clean)", async () => {
    const { session, dirty } = await runWithSession(sample(), async () => {
      expect(await getFreshAccessToken()).toBe("access-1");
    });
    expect(dirty).toBe(false);
    expect(session.accessToken).toBe("access-1");
  });

  it("refreshes an expired token once under concurrent callers and marks dirty", async () => {
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
              id_token: "x.y.z",
            });
          }
          return new HttpResponse(null, { status: 400 });
        },
      ),
    );

    const { session, dirty } = await runWithSession(
      sample({ accessTokenExpiry: Date.now() - 1_000 }),
      async () => {
        const tokens = await Promise.all([
          getFreshAccessToken(),
          getFreshAccessToken(),
          getFreshAccessToken(),
        ]);
        expect(tokens).toEqual(["access-2", "access-2", "access-2"]);
      },
    );

    expect(refreshCalls).toBe(1); // single-flight within the request
    expect(session.refreshToken).toBe("refresh-2"); // rotated + persisted
    expect(dirty).toBe(true);
  });

  it("surfaces ReauthRequired (and marks nothing) when the refresh is rejected", async () => {
    server.use(
      http.post("https://identity.xero.com/connect/token", () =>
        HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    );

    await expect(
      runWithSession(
        sample({ accessTokenExpiry: Date.now() - 1_000 }),
        async () => {
          await getFreshAccessToken();
        },
      ),
    ).rejects.toBeInstanceOf(ReauthRequired);
  });

  it("updateCurrentSession replaces the session and marks it dirty", async () => {
    const { session, dirty } = await runWithSession(sample(), async () => {
      updateCurrentSession({ ...getCurrentSession(), userId: "user-9" });
    });
    expect(session.userId).toBe("user-9");
    expect(dirty).toBe(true);
  });
});

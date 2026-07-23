import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { POST as tenantPOST } from "./tenant/route";
import type { XeroSession } from "@/lib/xero/session";
import {
  decryptSession,
  encryptSession,
  SESSION_COOKIE,
} from "@/lib/xero/cookie";

// Seam 1: drive POST /api/xero/tenant (the org switcher) directly, Xero mocked
// via MSW. Switching re-points the session's tenant header and RE-RESOLVES the
// per-tenant Projects userId (/projectsusers email-match); on success the new
// session is re-persisted onto the RESPONSE cookie, on failure the cookie is
// left unchanged. Tests read state back by decrypting the response cookie.

const ORG_A = { tenantId: "tenant-abc", tenantName: "Evie Digital" };
const ORG_B = { tenantId: "tenant-xyz", tenantName: "Main Employer" };

function baseSession(overrides: Partial<XeroSession> = {}): XeroSession {
  return {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    accessTokenExpiry: Date.now() + 5 * 60_000,
    tenantId: ORG_A.tenantId,
    userId: "user-2",
    email: "gavin@evie.digital",
    name: "Gavin Harris",
    tenantName: ORG_A.tenantName,
    tenants: [ORG_A, ORG_B],
    ...overrides,
  };
}

/** A switch request carrying the encrypted session cookie. */
function switchRequest(tenantId: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/xero/tenant", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE}=${encryptSession(baseSession())}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ tenantId }),
  });
}

/** Decrypt the session the route re-persisted onto the response (or null if it
 *  did not set one). */
function responseSession(res: Awaited<ReturnType<typeof tenantPOST>>) {
  const value = res.cookies.get(SESSION_COOKIE)?.value;
  return value ? decryptSession(value) : null;
}

/** MSW: /projectsusers for ORG_B (keyed off the Xero-tenant-id header). */
function orgBProjectsUsers(
  items: { userId: string; name: string; email: string }[],
) {
  server.use(
    http.get(
      "https://api.xero.com/projects.xro/2.0/projectsusers",
      ({ request }) => {
        if (request.headers.get("xero-tenant-id") !== ORG_B.tenantId) {
          return undefined; // fall through to the default handler (org A)
        }
        return HttpResponse.json({
          pagination: {
            page: 1,
            pageCount: 1,
            pageSize: 50,
            itemCount: items.length,
          },
          items,
        });
      },
    ),
  );
}

describe("POST /api/xero/tenant", () => {
  it("switches the active org, re-resolves the userId, and re-persists the cookie", async () => {
    orgBProjectsUsers([
      { userId: "user-b-9", name: "Gavin Harris", email: "gavin@evie.digital" },
    ]);

    const res = await tenantPOST(switchRequest(ORG_B.tenantId));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      tenantId: ORG_B.tenantId,
      org: ORG_B.tenantName,
    });

    const persisted = responseSession(res)!;
    expect(persisted.tenantId).toBe(ORG_B.tenantId);
    expect(persisted.tenantName).toBe(ORG_B.tenantName);
    expect(persisted.userId).toBe("user-b-9"); // re-resolved, NOT org A's user-2
    expect(persisted.tenants).toEqual([ORG_A, ORG_B]); // list untouched
  });

  it("is idempotent when the target is already active (no cookie rewrite)", async () => {
    const res = await tenantPOST(switchRequest(ORG_A.tenantId));
    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined(); // session unchanged
  });

  it("rejects a tenant that is not in the connected list (validation, no rewrite)", async () => {
    const res = await tenantPOST(switchRequest("tenant-unknown"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "validation" },
    });
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("rolls back (no cookie rewrite) when the login is not a Projects user there", async () => {
    orgBProjectsUsers([
      { userId: "user-x", name: "Someone Else", email: "other@corp.com" },
    ]);

    const res = await tenantPOST(switchRequest(ORG_B.tenantId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("validation");
    expect(body.error.fields.tenantId).toContain("Main Employer");
    // The previous org stays live — the cookie was never rewritten.
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("rolls back when the target org's /projectsusers call fails upstream", async () => {
    server.use(
      http.get(
        "https://api.xero.com/projects.xro/2.0/projectsusers",
        ({ request }) =>
          request.headers.get("xero-tenant-id") === ORG_B.tenantId
            ? new HttpResponse(null, { status: 500 })
            : undefined,
      ),
    );

    const res = await tenantPOST(switchRequest(ORG_B.tenantId));
    expect(res.status).toBe(502);
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("401s without the session cookie", async () => {
    const res = await tenantPOST(
      new NextRequest("http://localhost:3000/api/xero/tenant", {
        method: "POST",
        body: JSON.stringify({ tenantId: ORG_B.tenantId }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

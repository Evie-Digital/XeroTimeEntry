import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { POST as timeentriesPOST } from "./route";
import {
  clearSession,
  setSession,
  setSessionId,
  type XeroSession,
} from "@/lib/xero/session";
import { SESSION_COOKIE, signValue } from "@/lib/xero/cookie";

// Seam 1: drive the POST /api/timeentries handler directly, Xero mocked via MSW
// (test/msw/xero.ts default POST /Projects/:id/Time handler). No live Xero runs.

const SID = "sid-timeentries-test";
const TIME_URL = "https://api.xero.com/projects.xro/2.0/Projects/:projectId/Time";

beforeEach(() => clearSession());

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
    ...overrides,
  };
}

/** Authorized POST request with a JSON body + matching signed cookie. */
function authedPost(body: unknown): NextRequest {
  setSession(baseSession());
  setSessionId(SID);
  return new NextRequest("http://localhost:3000/api/timeentries", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE}=${signValue(SID)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const CREATE_BODY = {
  projectId: "proj-1",
  taskId: "task-1",
  dateUtc: "2026-07-20T00:00:00Z",
  duration: 90,
};

describe("POST /api/timeentries", () => {
  it("maps to POST /Projects/{projectId}/Time with the session userId + body", async () => {
    let seenPath: string | null = null;
    let seenBody: Record<string, unknown> | null = null;
    server.use(
      http.post(TIME_URL, async ({ request, params }) => {
        seenPath = params.projectId as string;
        seenBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { timeEntryId: "te-created", status: "ACTIVE", ...seenBody },
          { status: 201 },
        );
      }),
    );

    const res = await timeentriesPOST(authedPost(CREATE_BODY));

    expect(res.status).toBe(201);
    // Routed to the Slot's project.
    expect(seenPath).toBe("proj-1");
    // Body carries the SESSION userId (injected server-side) + the Slot fields.
    expect(seenBody).toEqual({
      userId: "user-2",
      taskId: "task-1",
      dateUtc: "2026-07-20T00:00:00Z",
      duration: 90,
    });
    // The created Entry is returned to the caller.
    await expect(res.json()).resolves.toMatchObject({
      timeEntryId: "te-created",
      status: "ACTIVE",
    });
  });

  it("includes an optional description when provided", async () => {
    let seenBody: Record<string, unknown> | null = null;
    server.use(
      http.post(TIME_URL, async ({ request }) => {
        seenBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ timeEntryId: "te", status: "ACTIVE" }, { status: 201 });
      }),
    );

    await timeentriesPOST(
      authedPost({ ...CREATE_BODY, description: "fixed the auth bug" }),
    );

    expect(seenBody).toMatchObject({ description: "fixed the auth bug" });
  });

  it("surfaces the validation envelope on a Xero 400", async () => {
    server.use(
      http.post(TIME_URL, () =>
        HttpResponse.json(
          { ModelState: { duration: ["Duration must be positive"] } },
          { status: 400 },
        ),
      ),
    );

    const res = await timeentriesPOST(authedPost(CREATE_BODY));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: {
        code: "validation",
        message: expect.any(String),
        fields: { duration: "Duration must be positive" },
      },
      status: 400,
    });
  });

  it("returns the reauth_required envelope when unauthenticated", async () => {
    const req = new NextRequest("http://localhost:3000/api/timeentries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(CREATE_BODY),
    });
    const res = await timeentriesPOST(req);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: { code: "reauth_required", message: expect.any(String) },
      status: 401,
    });
  });
});

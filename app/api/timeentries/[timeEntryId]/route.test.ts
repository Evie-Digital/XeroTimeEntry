import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { PUT as timeentryPUT, DELETE as timeentryDELETE } from "./route";
import { type XeroSession } from "@/lib/xero/session";
import { SESSION_COOKIE, encryptSession } from "@/lib/xero/cookie";

// Seam 1: drive the PUT/DELETE /api/timeentries/[id] handlers directly, Xero
// mocked via MSW (test/msw/xero.ts default 204 handlers). No live Xero runs.

const ID = "te-42";
const TIME_ID_URL =
  "https://api.xero.com/projects.xro/2.0/Projects/:projectId/Time/:timeEntryId";


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

const ctx = (timeEntryId: string) => ({
  params: Promise.resolve({ timeEntryId }),
});

function authedPut(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/timeentries/${id}`, {
    method: "PUT",
    headers: {
      cookie: `${SESSION_COOKIE}=${encryptSession(baseSession())}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function authedDelete(id: string, projectId: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/timeentries/${id}?projectId=${projectId}`,
    {
      method: "DELETE",
      headers: { cookie: `${SESSION_COOKIE}=${encryptSession(baseSession())}` },
    },
  );
}

const PUT_BODY = {
  projectId: "proj-1",
  taskId: "task-1",
  dateUtc: "2026-07-20T09:30:00Z",
  duration: 150,
  description: "carried over",
};

describe("PUT /api/timeentries/[timeEntryId]", () => {
  it("maps to PUT /Projects/{projectId}/Time/{id} with the full-replace body", async () => {
    let seenProject: string | null = null;
    let seenId: string | null = null;
    let seenBody: Record<string, unknown> | null = null;
    server.use(
      http.put(TIME_ID_URL, async ({ request, params }) => {
        seenProject = params.projectId as string;
        seenId = params.timeEntryId as string;
        seenBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const res = await timeentryPUT(authedPut(ID, PUT_BODY), ctx(ID));

    expect(res.status).toBe(204);
    // Routed to the Slot's project + the entry id in the path.
    expect(seenProject).toBe("proj-1");
    expect(seenId).toBe(ID);
    // Full-replace body: SESSION userId injected + every carried field.
    expect(seenBody).toEqual({
      userId: "user-2",
      taskId: "task-1",
      dateUtc: "2026-07-20T09:30:00Z",
      duration: 150,
      description: "carried over",
    });
  });

  it("omits the description from the Xero body when it is empty (note cleared)", async () => {
    let seenBody: Record<string, unknown> | null = null;
    server.use(
      http.put(TIME_ID_URL, async ({ request }) => {
        seenBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const res = await timeentryPUT(
      authedPut(ID, { ...PUT_BODY, description: "" }),
      ctx(ID),
    );

    expect(res.status).toBe(204);
    // A full-replace with no `description` key → Xero drops the note.
    expect(seenBody).not.toBeNull();
    expect(seenBody!).not.toHaveProperty("description");
  });

  it("surfaces the validation envelope on a Xero 400", async () => {
    server.use(
      http.put(TIME_ID_URL, () =>
        HttpResponse.json(
          { ModelState: { duration: ["Duration must be positive"] } },
          { status: 400 },
        ),
      ),
    );

    const res = await timeentryPUT(authedPut(ID, PUT_BODY), ctx(ID));

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
    const req = new NextRequest(`http://localhost:3000/api/timeentries/${ID}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(PUT_BODY),
    });
    const res = await timeentryPUT(req, ctx(ID));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: { code: "reauth_required", message: expect.any(String) },
      status: 401,
    });
  });
});

describe("DELETE /api/timeentries/[timeEntryId]", () => {
  it("maps to DELETE /Projects/{projectId}/Time/{id} using the projectId query", async () => {
    let seenProject: string | null = null;
    let seenId: string | null = null;
    server.use(
      http.delete(TIME_ID_URL, ({ params }) => {
        seenProject = params.projectId as string;
        seenId = params.timeEntryId as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const res = await timeentryDELETE(authedDelete(ID, "proj-9"), ctx(ID));

    expect(res.status).toBe(204);
    expect(seenProject).toBe("proj-9");
    expect(seenId).toBe(ID);
  });

  it("returns the reauth_required envelope when unauthenticated", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/timeentries/${ID}?projectId=proj-1`,
      { method: "DELETE" },
    );
    const res = await timeentryDELETE(req, ctx(ID));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: { code: "reauth_required", message: expect.any(String) },
      status: 401,
    });
  });
});

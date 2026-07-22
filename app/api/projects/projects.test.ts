import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { GET as projectsGET } from "./route";
import { GET as tasksGET } from "./[projectId]/tasks/route";
import {
  clearSession,
  setSession,
  setSessionId,
  type XeroSession,
} from "@/lib/xero/session";
import { SESSION_COOKIE, signValue } from "@/lib/xero/cookie";

// Seam 1: exercise the data route handlers directly, with Xero mocked via MSW
// (test/msw/xero.ts default Projects/Tasks handlers). No live Xero ever runs.

const SID = "sid-projects-test";

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

/** Establish an authorized in-memory session + a matching signed cookie. */
function authed(url: string): NextRequest {
  setSession(baseSession());
  setSessionId(SID);
  return new NextRequest(url, {
    headers: { cookie: `${SESSION_COOKIE}=${signValue(SID)}` },
  });
}

const tasksCtx = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

describe("GET /api/projects", () => {
  it("follows pagination to pageCount and returns only INPROGRESS projects", async () => {
    const res = await projectsGET(authed("http://localhost:3000/api/projects"));

    expect(res.status).toBe(200);
    const body = await res.json();
    // Two INPROGRESS projects, spread across two pages (pageSize 1); the CLOSED
    // one is excluded by the states filter.
    expect(body).toEqual([
      { projectId: "proj-1", name: "Website Rebuild" },
      { projectId: "proj-2", name: "Mobile App" },
    ]);
  });

  it("returns the reauth_required envelope when unauthenticated", async () => {
    const req = new NextRequest("http://localhost:3000/api/projects");
    const res = await projectsGET(req);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: { code: "reauth_required", message: expect.any(String) },
      status: 401,
    });
  });

  it("surfaces the rate_limited envelope with retryAfter on a Xero 429", async () => {
    server.use(
      http.get("https://api.xero.com/projects.xro/2.0/Projects", () =>
        HttpResponse.json(
          { Message: "rate limited" },
          { status: 429, headers: { "Retry-After": "7" } },
        ),
      ),
    );

    const res = await projectsGET(authed("http://localhost:3000/api/projects"));

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: {
        code: "rate_limited",
        message: expect.any(String),
        retryAfter: 7,
      },
      status: 429,
    });
  });
});

describe("GET /api/projects/{projectId}/tasks", () => {
  it("returns only ACTIVE tasks (excludes INVOICED/LOCKED), paginated", async () => {
    const res = await tasksGET(
      authed("http://localhost:3000/api/projects/proj-1/tasks"),
      tasksCtx("proj-1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // task-3 (INVOICED) and task-4 (LOCKED) are filtered out.
    expect(body).toEqual([
      { taskId: "task-1", name: "Development", status: "ACTIVE" },
      { taskId: "task-2", name: "Design", status: "ACTIVE" },
    ]);
  });

  it("returns the reauth_required envelope when unauthenticated", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/projects/proj-1/tasks",
    );
    const res = await tasksGET(req, tasksCtx("proj-1"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "reauth_required" },
      status: 401,
    });
  });
});

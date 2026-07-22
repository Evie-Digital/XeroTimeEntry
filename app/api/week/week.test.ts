import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { GET as weekGET } from "./route";
import {
  clearSession,
  setSession,
  setSessionId,
  type XeroSession,
} from "@/lib/xero/session";
import { SESSION_COOKIE, signValue } from "@/lib/xero/cookie";

// Seam 1: drive the /week route handler directly, Xero mocked via MSW
// (test/msw/xero.ts default Projects/Tasks/Time handlers). No live Xero runs.

const SID = "sid-week-test";
const FROM = "2026-07-20";
const TO = "2026-07-26";

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
    tenants: [{ tenantId: "tenant-abc", tenantName: "Evie Digital" }],
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

const weekUrl = (from = FROM, to = TO) =>
  `http://localhost:3000/api/week?from=${from}&to=${to}`;

describe("GET /api/week", () => {
  it("fans out across all active projects and merges every entry, enriched", async () => {
    const res = await weekGET(authed(weekUrl()));

    expect(res.status).toBe(200);
    const body = await res.json();
    // 3 entries from proj-1 + 1 from proj-2, merged across the fan-out.
    expect(body).toHaveLength(4);

    const ids = body.map((e: { timeEntryId: string }) => e.timeEntryId).sort();
    expect(ids).toEqual(["te-1", "te-2", "te-3", "te-4"]);

    // Each entry is enriched with a human-readable project + task name.
    const te1 = body.find((e: { timeEntryId: string }) => e.timeEntryId === "te-1");
    expect(te1).toMatchObject({
      projectId: "proj-1",
      projectName: "Website Rebuild",
      taskId: "task-1",
      taskName: "Development",
      dateUtc: "2026-07-20T09:30:00Z",
      duration: 90,
      description: "Standup + dev",
      status: "ACTIVE",
    });

    // A non-ACTIVE (invoiced) entry still resolves its task name because the
    // route reads the UNFILTERED Tasks list.
    const te3 = body.find((e: { timeEntryId: string }) => e.timeEntryId === "te-3");
    expect(te3).toMatchObject({ taskName: "Invoiced Work", status: "INVOICED" });
  });

  it("buckets a non-midnight dateUtc to its verbatim date portion (no off-by-one)", async () => {
    const res = await weekGET(authed(weekUrl()));
    const body = await res.json();
    const te1 = body.find((e: { timeEntryId: string }) => e.timeEntryId === "te-1");
    // 09:30Z must NOT roll to an adjacent day — the raw string is preserved so
    // the grid can slice its date portion verbatim.
    expect(te1.dateUtc).toBe("2026-07-20T09:30:00Z");
  });

  it("passes userId + the date range through to each per-project Time call", async () => {
    const seen: Array<Record<string, string | null>> = [];
    server.use(
      http.get(
        "https://api.xero.com/projects.xro/2.0/Projects/:projectId/Time",
        ({ request }) => {
          const u = new URL(request.url);
          seen.push({
            userId: u.searchParams.get("userId"),
            dateAfterUtc: u.searchParams.get("dateAfterUtc"),
            dateBeforeUtc: u.searchParams.get("dateBeforeUtc"),
          });
          return HttpResponse.json({
            pagination: { page: 1, pageCount: 1, pageSize: 500, itemCount: 0 },
            items: [],
          });
        },
      ),
    );

    await weekGET(authed(weekUrl("2026-07-20", "2026-07-26")));

    expect(seen.length).toBeGreaterThan(0);
    for (const params of seen) {
      expect(params).toEqual({
        userId: "user-2",
        // Both bounds are full ISO instants (Xero declares them as
        // `format: date-time`; both inclusive) spanning the entire week:
        // Monday's midnight through the very end of Sunday. The end-of-day
        // upper bound keeps a last-day Entry with a time-of-day in range (see
        // the inclusion regression test below).
        dateAfterUtc: "2026-07-20T00:00:00Z",
        dateBeforeUtc: "2026-07-26T23:59:59.999Z",
      });
    }
  });

  it("includes a last-day entry authored with a time-of-day (widened upper bound)", async () => {
    // A Sunday (the week's last day) Entry stamped mid-afternoon in the Xero UI.
    // With a midnight upper bound this would fall AFTER `dateBeforeUtc` and be
    // silently excluded; the widened end-of-day bound keeps it in range (spec
    // story 11 — see time logged from anywhere, including the Xero UI).
    const lastDay = {
      timeEntryId: "te-sunday",
      taskId: "task-1",
      userId: "user-2",
      dateUtc: "2026-07-26T15:00:00Z", // Sunday, 15:00Z
      duration: 45,
      description: "Late Sunday session",
      status: "ACTIVE",
    };

    // A Time handler that faithfully honours Xero's date filtering (the default
    // fixture handler ignores the bounds), so this test actually exercises the
    // widened `dateBeforeUtc`.
    server.use(
      http.get(
        "https://api.xero.com/projects.xro/2.0/Projects/:projectId/Time",
        ({ request, params }) => {
          const url = new URL(request.url);
          const after = url.searchParams.get("dateAfterUtc");
          const before = url.searchParams.get("dateBeforeUtc");
          const all =
            params.projectId === "proj-1" ? [lastDay] : [];
          const items = all.filter((e) => {
            const t = Date.parse(e.dateUtc);
            return (
              (!after || t >= Date.parse(after)) &&
              (!before || t <= Date.parse(before))
            );
          });
          return HttpResponse.json({
            pagination: { page: 1, pageCount: 1, pageSize: 500, itemCount: items.length },
            items,
          });
        },
      ),
    );

    const res = await weekGET(authed(weekUrl()));
    const body = await res.json();

    const found = body.find(
      (e: { timeEntryId: string }) => e.timeEntryId === "te-sunday",
    );
    expect(found).toBeDefined();
    expect(found).toMatchObject({
      dateUtc: "2026-07-26T15:00:00Z",
      duration: 45,
      taskName: "Development",
    });
  });

  it("never exceeds 5 concurrent per-project Time calls during the fan-out", async () => {
    // 8 active projects, so an uncapped fan-out would put 8 in flight.
    const manyProjects = Array.from({ length: 8 }, (_, i) => ({
      projectId: `p-${i}`,
      name: `Project ${i}`,
      status: "INPROGRESS",
    }));
    let inFlight = 0;
    let maxInFlight = 0;

    server.use(
      http.get("https://api.xero.com/projects.xro/2.0/Projects", ({ request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get("page") ?? "1");
        // Single page of all 8 active projects.
        return HttpResponse.json({
          pagination: { page, pageCount: 1, pageSize: 500, itemCount: 8 },
          items: manyProjects,
        });
      }),
      http.get(
        "https://api.xero.com/projects.xro/2.0/Projects/:projectId/Time",
        async () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 20)); // hold the slot open
          inFlight -= 1;
          return HttpResponse.json({
            pagination: { page: 1, pageCount: 1, pageSize: 500, itemCount: 0 },
            items: [],
          });
        },
      ),
    );

    await weekGET(authed(weekUrl()));

    expect(maxInFlight).toBeGreaterThan(1); // proves it actually parallelises
    expect(maxInFlight).toBeLessThanOrEqual(5); // …but caps at 5
  });

  it("returns the reauth_required envelope when unauthenticated", async () => {
    const req = new NextRequest(weekUrl());
    const res = await weekGET(req);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: { code: "reauth_required", message: expect.any(String) },
      status: 401,
    });
  });
});

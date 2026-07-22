import { http, HttpResponse } from "msw";

/**
 * Default MSW mocks for the Xero endpoints the auth spine touches:
 * the token endpoint (code exchange + refresh), /connections, and the
 * paginated /projectsusers. Individual tests override any of these via
 * `server.use(...)`. Reused by later data slices.
 */

export const TEST_TENANT = {
  tenantId: "tenant-abc",
  tenantName: "Evie Digital",
  tenantType: "ORGANISATION",
};

export const TEST_USER_EMAIL = "gavin@evie.digital";
export const TEST_USER_NAME = "Gavin Harris";

export const TEST_PROJECTS_USERS = [
  { userId: "user-1", name: "Someone Else", email: "other@evie.digital" },
  { userId: "user-2", name: TEST_USER_NAME, email: TEST_USER_EMAIL },
];

// Projects fixture: two INPROGRESS + one CLOSED so the `states=INPROGRESS`
// filter and the pagination loop are both exercised (pageSize 1 ⇒ 2 pages of
// active projects).
export const TEST_PROJECTS = [
  { projectId: "proj-1", name: "Website Rebuild", status: "INPROGRESS" },
  { projectId: "proj-2", name: "Mobile App", status: "INPROGRESS" },
  { projectId: "proj-closed", name: "Old Retainer", status: "CLOSED" },
];

// Tasks fixture for proj-1: two ACTIVE + one INVOICED + one LOCKED. Xero has no
// task-status query, so the route filters ACTIVE client-side (pageSize 2 ⇒ 2
// pages).
export const TEST_TASKS = [
  { taskId: "task-1", name: "Development", status: "ACTIVE" },
  { taskId: "task-2", name: "Design", status: "ACTIVE" },
  { taskId: "task-3", name: "Invoiced Work", status: "INVOICED" },
  { taskId: "task-4", name: "Locked Work", status: "LOCKED" },
];

/** Slice `items` into a Xero-style paginated envelope for the requested page. */
function paginatedJson<T>(items: T[], url: URL, pageSize: number) {
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const start = (page - 1) * pageSize;
  return HttpResponse.json({
    pagination: { page, pageCount, pageSize, itemCount: items.length },
    items: items.slice(start, start + pageSize),
  });
}

/** Build an unsigned JWT (header.payload.sig) carrying the given claims. */
export function makeIdToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.sig`;
}

export const xeroHandlers = [
  http.post("https://identity.xero.com/connect/token", async ({ request }) => {
    const body = new URLSearchParams(await request.text());
    const idToken = makeIdToken({
      email: TEST_USER_EMAIL,
      name: TEST_USER_NAME,
    });
    if (body.get("grant_type") === "refresh_token") {
      return HttpResponse.json({
        access_token: "access-refreshed",
        refresh_token: "refresh-rotated",
        expires_in: 1800,
        token_type: "Bearer",
        id_token: idToken,
      });
    }
    return HttpResponse.json({
      access_token: "access-initial",
      refresh_token: "refresh-initial",
      expires_in: 1800,
      token_type: "Bearer",
      id_token: idToken,
    });
  }),

  http.get("https://api.xero.com/connections", () =>
    HttpResponse.json([TEST_TENANT]),
  ),

  http.get(
    "https://api.xero.com/projects.xro/2.0/projectsusers",
    () =>
      HttpResponse.json({
        pagination: {
          page: 1,
          pageCount: 1,
          pageSize: 50,
          itemCount: TEST_PROJECTS_USERS.length,
        },
        items: TEST_PROJECTS_USERS,
      }),
  ),

  // GET /Projects — honours the `states` filter (Xero filters server-side) and
  // paginates one project per page so the loop must follow pageCount.
  http.get("https://api.xero.com/projects.xro/2.0/Projects", ({ request }) => {
    const url = new URL(request.url);
    const states = (url.searchParams.get("states") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const filtered = states.length
      ? TEST_PROJECTS.filter((p) => states.includes(p.status))
      : TEST_PROJECTS;
    return paginatedJson(filtered, url, 1);
  }),

  // GET /Projects/{id}/Tasks — returns ALL tasks (no status filter server-side);
  // the route filters ACTIVE. Paginated two per page.
  http.get(
    "https://api.xero.com/projects.xro/2.0/Projects/:projectId/Tasks",
    ({ request }) => paginatedJson(TEST_TASKS, new URL(request.url), 2),
  ),
];

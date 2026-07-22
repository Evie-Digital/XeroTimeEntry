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
];

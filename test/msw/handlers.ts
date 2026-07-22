import { http, HttpResponse } from "msw";

/**
 * Default MSW request handlers shared by the Node (test) server.
 * Later slices add Xero endpoint mocks here. Individual tests can
 * override any of these per-case via `server.use(...)`.
 */
export const handlers = [
  http.get("*/api/health", () =>
    HttpResponse.json({ status: "ok", service: "fast-time-entry" }),
  ),
];

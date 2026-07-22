import { http, HttpResponse } from "msw";
import { xeroHandlers } from "./xero";

/**
 * Default MSW request handlers shared by the Node (test) server. Includes the
 * app health endpoint plus the default Xero endpoint mocks (token exchange,
 * /connections, /projectsusers). Individual tests override any of these
 * per-case via `server.use(...)`.
 */
export const handlers = [
  http.get("*/api/health", () =>
    HttpResponse.json({ status: "ok", service: "fast-time-entry" }),
  ),
  ...xeroHandlers,
];

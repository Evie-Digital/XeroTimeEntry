import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./msw/server";

// Start the MSW server before any tests run; fail loud on un-mocked requests
// so a missing handler is a test error, not a silent network call.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

// Reset handlers and unmount React trees between tests for isolation.
afterEach(() => {
  server.resetHandlers();
  cleanup();
  // The grid's "recent rows" prefill persists to localStorage (#09); clear it
  // so seeded rows don't leak between tests.
  localStorage.clear();
});

afterAll(() => server.close());

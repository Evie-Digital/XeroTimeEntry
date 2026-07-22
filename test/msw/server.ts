import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * MSW request-mocking server for the Node test environment (Vitest).
 * Lifecycle (listen / resetHandlers / close) is wired in test/setup.ts.
 */
export const server = setupServer(...handlers);

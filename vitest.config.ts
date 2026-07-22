import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // Fake Xero credentials for the auth-spine tests (Xero is mocked via MSW;
    // no real OAuth ever runs). Kept here so specs don't each set process.env.
    env: {
      XERO_CLIENT_ID: "test-client-id",
      XERO_CLIENT_SECRET: "test-client-secret",
      XERO_REDIRECT_URI: "http://localhost:3000/api/xero/callback",
      SESSION_COOKIE_SECRET: "test-session-cookie-secret-value",
    },
    // Exclude Playwright/e2e and build output; only unit/integration specs.
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "dist"],
  },
});

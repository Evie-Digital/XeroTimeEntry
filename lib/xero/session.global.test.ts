import { describe, it, expect, beforeEach, vi } from "vitest";
import type { XeroSession } from "./session";

// Regression for the live bug: Next.js gives each route handler its own module
// instance, so the session MUST live on globalThis, not a module-level `let`.
// This test simulates that isolation by re-importing the module (vi.resetModules
// clears the module registry but NOT globalThis) and asserting the session set
// in the first instance is visible from the second. With a module-level `let`
// this fails (the second instance sees null) — which is exactly what broke
// /api/xero/status after a successful /api/xero/callback.
describe("session is a true per-process singleton (survives module re-instantiation)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as unknown as { __xeroSessionStore?: unknown })
      .__xeroSessionStore;
  });

  const sample: XeroSession = {
    accessToken: "access-1",
    accessTokenExpiry: Date.now() + 1_000_000,
    refreshToken: "refresh-1",
    tenantId: "tenant-1",
    userId: "user-1",
    email: "gavin@example.com",
    name: "Gavin",
    tenantName: "Acme Ltd",
    tenants: [{ tenantId: "tenant-1", tenantName: "Acme Ltd" }],
  };

  it("a session set in one module instance is visible from a freshly-imported instance", async () => {
    const modA = await import("./session");
    modA.setSession(sample);
    modA.setSessionId("sid-abc");

    // Simulate a second route handler receiving its own module instance.
    vi.resetModules();
    const modB = await import("./session");

    expect(modB.getSession()?.accessToken).toBe("access-1");
    expect(modB.getSessionId()).toBe("sid-abc");
  });

  it("clearSession in one instance is observed by another", async () => {
    const modA = await import("./session");
    modA.setSession(sample);
    modA.setSessionId("sid-abc");

    vi.resetModules();
    const modB = await import("./session");
    modB.clearSession();

    vi.resetModules();
    const modC = await import("./session");
    expect(modC.getSession()).toBeNull();
    expect(modC.getSessionId()).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithClient } from "@/test/render";
import { HealthStatus } from "./HealthStatus";

describe("HealthStatus", () => {
  it("renders JSON fetched over HTTP (mocked by MSW)", async () => {
    // Seam 2: intercept the component's `fetch('/api/health')` at the network
    // boundary and return a canned payload — no real server involved.
    server.use(
      http.get("*/api/health", () =>
        HttpResponse.json({ status: "ok", service: "fast-time-entry" }),
      ),
    );

    renderWithClient(<HealthStatus />);

    const result = await screen.findByTestId("health");
    expect(result).toHaveTextContent("fast-time-entry: ok");
  });

  it("shows an error state when the request fails", async () => {
    server.use(
      http.get("*/api/health", () => new HttpResponse(null, { status: 500 })),
    );

    renderWithClient(<HealthStatus />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unavailable");
  });
});

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithClient } from "@/test/render";
import { AuthStatus } from "./AuthStatus";

describe("AuthStatus", () => {
  it("offers a Connect Xero link when unauthenticated", async () => {
    server.use(
      http.get("*/api/xero/status", () =>
        HttpResponse.json({ authenticated: false }),
      ),
    );

    renderWithClient(<AuthStatus />);

    const link = await screen.findByRole("link", { name: /connect xero/i });
    expect(link).toHaveAttribute("href", "/api/xero/login");
  });

  it("shows the logged-in identity and organisation when authenticated", async () => {
    server.use(
      http.get("*/api/xero/status", () =>
        HttpResponse.json({
          authenticated: true,
          user: { name: "Gavin Harris", email: "gavin@evie.digital" },
          org: "Evie Digital",
        }),
      ),
    );

    renderWithClient(<AuthStatus />);

    const identity = await screen.findByTestId("auth-identity");
    expect(identity).toHaveTextContent("Logged in as Gavin Harris at Evie Digital");
  });
});

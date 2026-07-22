import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithClient } from "@/test/render";
import { ProjectTaskPicker } from "./ProjectTaskPicker";

// Seam 2: the picker against our own /api routes mocked via MSW. Proves the
// React Query hooks render cached active projects and load a project's active
// tasks on selection.

function mockAuthed() {
  server.use(
    http.get("*/api/xero/status", () =>
      HttpResponse.json({ authenticated: true }),
    ),
  );
}

describe("ProjectTaskPicker", () => {
  it("renders active projects and loads a project's active tasks on selection", async () => {
    mockAuthed();
    server.use(
      http.get("*/api/projects", () =>
        HttpResponse.json([
          { projectId: "proj-1", name: "Website Rebuild" },
          { projectId: "proj-2", name: "Mobile App" },
        ]),
      ),
      http.get("*/api/projects/proj-1/tasks", () =>
        HttpResponse.json([
          { taskId: "task-1", name: "Development", status: "ACTIVE" },
          { taskId: "task-2", name: "Design", status: "ACTIVE" },
        ]),
      ),
    );

    renderWithClient(<ProjectTaskPicker />);

    // Cached active projects render.
    const projectButton = await screen.findByRole("button", {
      name: "Website Rebuild",
    });
    expect(
      screen.getByRole("button", { name: "Mobile App" }),
    ).toBeInTheDocument();

    // Selecting a project loads its active tasks.
    await userEvent.click(projectButton);
    expect(await screen.findByText("Development")).toBeInTheDocument();
    expect(screen.getByText("Design")).toBeInTheDocument();
  });

  it("renders nothing until the browser is authenticated", async () => {
    server.use(
      http.get("*/api/xero/status", () =>
        HttpResponse.json({ authenticated: false }),
      ),
    );

    const { container } = renderWithClient(<ProjectTaskPicker />);

    // Give the auth query a tick to resolve; the picker stays absent.
    await new Promise((r) => setTimeout(r, 0));
    expect(
      screen.queryByTestId("project-task-picker"),
    ).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});

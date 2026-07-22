import { describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "@/test/msw/server";
import { AddRowPicker } from "./AddRowPicker";
import { projectsKey, type Project } from "../hooks/lists";

// Regression: the picker's selection `index` only resets on typing, but the
// options list can shrink UNDER it (a background refetch after staleTime
// returning fewer items). Before the clamp fix a stranded index left no
// option aria-selected, made Enter a no-op, and ↑ never re-entered range.
// We shrink the list the same way a refetch would — by writing shorter data
// into the query cache the picker's `useProjects` reads — so the component
// itself is untouched.

const THREE_PROJECTS: Project[] = [
  { projectId: "proj-1", name: "Alpha" },
  { projectId: "proj-2", name: "Beta" },
  { projectId: "proj-3", name: "Gamma" },
];

/** Like test/render.tsx's renderWithClient, but hands back the QueryClient so
 *  the test can shrink cached data mid-flight (the refetch stand-in). */
function renderWithOwnedClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { queryClient, ...render(ui, { wrapper: Wrapper }) };
}

function mockLists() {
  server.use(
    http.get("*/api/projects", () => HttpResponse.json(THREE_PROJECTS)),
    // Enter on a project flips to the task stage, which fetches its tasks.
    http.get("*/api/projects/:id/tasks", () =>
      HttpResponse.json([{ taskId: "task-1", name: "Development", status: "ACTIVE" }]),
    ),
  );
}

/** Render the picker and walk the selection to the LAST project (index 2). */
async function openOnLastOption() {
  mockLists();
  const onAdd = vi.fn();
  const rendered = renderWithOwnedClient(
    <AddRowPicker existingRowKeys={new Set()} onAdd={onAdd} onClose={vi.fn()} />,
  );
  const user = userEvent.setup();

  const picker = await screen.findByTestId("add-row-picker");
  await within(picker).findByTestId("add-row-option-proj-3");
  await user.keyboard("{ArrowDown}{ArrowDown}"); // index 0 → 2 (Gamma)
  expect(within(picker).getByTestId("add-row-option-proj-3")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  return { ...rendered, user, picker, onAdd };
}

/** Shrink the cached projects list under the open picker, as a background
 *  refetch after staleTime would. React Query v5 flushes observer
 *  notifications on a `setTimeout(0)` macrotask, so the act must yield one
 *  timer tick before the test asserts against the re-rendered DOM. */
async function shrinkProjects(queryClient: QueryClient, to: Project[]) {
  await act(async () => {
    queryClient.setQueryData(projectsKey, to);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("AddRowPicker — selection clamping when options shrink", () => {
  it("keeps aria-selected on a real option and Enter chooses the last remaining one", async () => {
    const { queryClient, user, picker } = await openOnLastOption();

    // The refetch dropped Gamma: only 2 options remain, index (2) is stale.
    await shrinkProjects(queryClient, THREE_PROJECTS.slice(0, 2));

    // The clamped selection sits on the last REAL option (Beta), not nowhere.
    expect(
      within(picker).queryByTestId("add-row-option-proj-3"),
    ).not.toBeInTheDocument();
    expect(within(picker).getByTestId("add-row-option-proj-2")).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Enter is NOT a no-op: it chooses Beta and advances to its task stage.
    await user.keyboard("{Enter}");
    expect(await within(picker).findByTestId("picker-project")).toHaveTextContent(
      "Beta",
    );
  });

  it("ArrowUp from a stranded index steps from the clamped selection", async () => {
    const { queryClient, user, picker } = await openOnLastOption();

    await shrinkProjects(queryClient, THREE_PROJECTS.slice(0, 2));

    // ↑ steps from the clamped selection (1 → 0), not from the stale 2 → 1.
    await user.keyboard("{ArrowUp}");
    expect(within(picker).getByTestId("add-row-option-proj-1")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

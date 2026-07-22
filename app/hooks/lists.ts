"use client";

// Client data hooks for the cached lists (ARCHITECTURE §6): active projects and
// a project's active tasks. These query keys + hook names are the stable
// contract later slices (week grid, add-row picker) reuse — do not rename
// without updating consumers.

import { useQuery, useQueryClient } from "@tanstack/react-query";

export type Project = { projectId: string; name: string };
export type Task = { taskId: string; name: string; status: string };

/** Root key for everything list-related, so one invalidate refreshes all. */
export const listsRootKey = ["projects"] as const;
export const projectsKey = ["projects"] as const;
export const tasksKey = (projectId: string) =>
  ["projects", projectId, "tasks"] as const;

// ~10 min stale-while-revalidate (ARCHITECTURE §6). Persisted to localStorage
// via the root Providers, so the pickers are warm on start.
const LISTS_STALE_MS = 600_000;

/** Error carrying the parsed envelope `code` (+ `retryAfter`) for callers. */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string; retryAfter?: number };
    } | null;
    throw new ApiError(
      body?.error?.code ?? "upstream",
      body?.error?.message ?? `Request failed: ${res.status}`,
      body?.error?.retryAfter,
    );
  }
  return res.json() as Promise<T>;
}

/** Cached list of active (INPROGRESS) projects. */
export function useProjects() {
  return useQuery({
    queryKey: projectsKey,
    queryFn: () => getJson<Project[]>("/api/projects"),
    staleTime: LISTS_STALE_MS,
  });
}

/** Cached active tasks for a project. Disabled until a project is selected. */
export function useTasks(projectId: string | null) {
  return useQuery({
    queryKey: tasksKey(projectId ?? "__none__"),
    queryFn: () => getJson<Task[]>(`/api/projects/${projectId}/tasks`),
    enabled: Boolean(projectId),
    staleTime: LISTS_STALE_MS,
  });
}

/**
 * Manual "refresh lists" action — invalidates every projects/tasks query so
 * React Query refetches the active ones (ARCHITECTURE §6).
 */
export function useRefreshLists() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: listsRootKey });
}

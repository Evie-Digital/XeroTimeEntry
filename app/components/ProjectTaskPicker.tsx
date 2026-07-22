"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProjects, useTasks, useRefreshLists } from "../hooks/lists";

// Minimal proof-of-end-to-end UI (ARCHITECTURE §6): lists active projects and,
// on selecting one, its active tasks — via the cached React Query hooks. The
// real keyboard-driven weekly grid arrives in a later slice; this only proves
// the read + cache path is wired.

type Status = { authenticated: boolean };

/** Only render the picker once the browser is authenticated. Shares the
 *  ["auth-status"] query key with <AuthStatus/>, so this dedupes rather than
 *  issuing a second /status request. */
export function ProjectTaskPicker() {
  const { data: status } = useQuery<Status>({
    queryKey: ["auth-status"],
    queryFn: async () => {
      const res = await fetch("/api/xero/status");
      if (!res.ok) throw new Error(`status check failed: ${res.status}`);
      return res.json();
    },
  });

  if (!status?.authenticated) return null;
  return <Picker />;
}

function Picker() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const projects = useProjects();
  const tasks = useTasks(projectId);
  const refreshLists = useRefreshLists();

  return (
    <div className="flex flex-col gap-4" data-testid="project-task-picker">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Active projects</h2>
        <button
          type="button"
          onClick={() => refreshLists()}
          className="rounded border border-black/15 px-2 py-1 text-xs dark:border-white/20"
        >
          Refresh lists
        </button>
      </div>

      {projects.isPending && <p role="status">Loading projects…</p>}
      {projects.isError && <p role="alert">Could not load projects.</p>}

      {projects.data && (
        <ul className="flex flex-col gap-1">
          {projects.data.map((p) => (
            <li key={p.projectId}>
              <button
                type="button"
                aria-pressed={projectId === p.projectId}
                onClick={() => setProjectId(p.projectId)}
                className={`w-full rounded px-2 py-1 text-left text-sm ${
                  projectId === p.projectId
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {projectId && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Active tasks</h3>
          {tasks.isPending && <p role="status">Loading tasks…</p>}
          {tasks.isError && <p role="alert">Could not load tasks.</p>}
          {tasks.data && (
            <ul className="flex flex-col gap-0.5">
              {tasks.data.map((t) => (
                <li key={t.taskId} className="text-sm opacity-80">
                  {t.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

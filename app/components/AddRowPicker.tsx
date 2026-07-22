"use client";

// The ⌘/Ctrl+K add-row picker (ARCHITECTURE §6): a command-palette-style
// typeahead that walks active projects → their active tasks (via the cached
// `useProjects` / `useTasks` hooks) so a Row can be added without the mouse.
//
// Two stages, one keyboard idiom throughout: type to filter, ↑↓ to move the
// selection, Enter to choose (a project advances to its tasks; a task adds the
// Row), Esc to close. Tasks whose `(projectId, taskId)` is already a grid Row
// are marked "Already added" and are non-addable, so the picker never creates a
// duplicate. Adding calls `onAdd`; `WeekGrid` appends the extra Row and moves
// focus into it.

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjects, useTasks } from "../hooks/lists";
import { rowKey, type ExtraRow } from "@/lib/week/grid";

type Option = { id: string; name: string; disabled: boolean };

export function AddRowPicker({
  existingRowKeys,
  onAdd,
  onClose,
}: {
  /** rowKey(projectId, taskId) of every Row already in the grid. */
  existingRowKeys: Set<string>;
  onAdd: (row: ExtraRow) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<"project" | "task">("project");
  const [project, setProject] = useState<{
    projectId: string;
    name: string;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const projects = useProjects();
  const tasks = useTasks(stage === "task" ? (project?.projectId ?? null) : null);

  // Focus the search box on open and whenever the stage flips.
  useEffect(() => {
    inputRef.current?.focus();
  }, [stage]);

  const options: Option[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (stage === "project") {
      return (projects.data ?? [])
        .filter((p) => p.name.toLowerCase().includes(q))
        .map((p) => ({ id: p.projectId, name: p.name, disabled: false }));
    }
    return (tasks.data ?? [])
      .filter((t) => t.name.toLowerCase().includes(q))
      .map((t) => ({
        id: t.taskId,
        name: t.name,
        disabled: project
          ? existingRowKeys.has(rowKey(project.projectId, t.taskId))
          : false,
      }));
  }, [stage, query, projects.data, tasks.data, project, existingRowKeys]);

  function choose(i: number) {
    const opt = options[i];
    if (!opt) return;
    if (stage === "project") {
      const p = (projects.data ?? []).find((p) => p.projectId === opt.id);
      if (!p) return;
      setProject({ projectId: p.projectId, name: p.name });
      setStage("task");
      setQuery("");
      setIndex(0);
      return;
    }
    if (opt.disabled) return; // already added — no dupes
    const t = (tasks.data ?? []).find((t) => t.taskId === opt.id);
    if (!t || !project) return;
    onAdd({
      projectId: project.projectId,
      projectName: project.name,
      taskId: t.taskId,
      taskName: t.name,
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        choose(index);
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }

  const loading =
    stage === "project" ? projects.isPending : tasks.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a row"
        data-testid="add-row-picker"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-lg border border-black/10 bg-white shadow-xl dark:border-white/15 dark:bg-neutral-900"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0); // filtering changes the list — reset the selection
          }}
          onKeyDown={onKeyDown}
          placeholder={
            stage === "project" ? "Search projects…" : "Search tasks…"
          }
          aria-label={stage === "project" ? "Search projects" : "Search tasks"}
          className="w-full border-b border-black/10 bg-transparent px-4 py-3 text-sm outline-none dark:border-white/15"
        />

        {stage === "task" && project && (
          <p className="px-4 pt-2 text-xs opacity-60" data-testid="picker-project">
            {project.name}
          </p>
        )}

        <ul role="listbox" className="max-h-72 overflow-y-auto p-1">
          {loading && (
            <li role="status" className="px-3 py-2 text-sm opacity-60">
              Loading…
            </li>
          )}
          {!loading && options.length === 0 && (
            <li className="px-3 py-2 text-sm opacity-60">No matches.</li>
          )}
          {options.map((opt, i) => (
            <li key={opt.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                aria-disabled={opt.disabled || undefined}
                data-testid={`add-row-option-${opt.id}`}
                onClick={() => choose(i)}
                onMouseEnter={() => setIndex(i)}
                className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${
                  i === index
                    ? "bg-black/10 dark:bg-white/15"
                    : "hover:bg-black/5 dark:hover:bg-white/10"
                } ${opt.disabled ? "opacity-50" : ""}`}
              >
                <span>{opt.name}</span>
                {opt.disabled && (
                  <span
                    data-testid={`already-added-${opt.id}`}
                    className="text-xs opacity-70"
                  >
                    Already added
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

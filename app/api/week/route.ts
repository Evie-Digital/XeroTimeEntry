import { NextResponse, type NextRequest } from "next/server";
import { paginate } from "@/lib/xero/client";
import { mapWithConcurrency } from "@/lib/xero/concurrency";
import { withErrorEnvelope } from "@/lib/api/errors";
import { requireSession } from "@/lib/api/session-guard";
import type { WeekEntry } from "@/lib/week/types";

// GET /api/week?from=YYYY-MM-DD&to=YYYY-MM-DD — the composed full-scan week
// loader (ARCHITECTURE §5). Xero has NO global time-entry list, so we:
//   1. list the active (INPROGRESS) projects,
//   2. fan out `GET /Projects/{id}/Time?userId&dateAfterUtc&dateBeforeUtc`
//      across ALL of them, capped at ≤ 5 concurrent (Xero's per-tenant limit),
//   3. merge every Entry, enriched with projectName + taskName so the grid can
//      render `Project · Task` rows without a second round-trip.
//
// taskName resolution: for each project that returned entries we ALSO paginate
// its Tasks and map taskId→name. This is done server-side (rather than joining
// on the client from `useTasks`) because `useTasks` only exposes ACTIVE tasks —
// an invoiced/locked Entry's task would otherwise be unresolvable. Fetching the
// unfiltered Tasks list here makes every Entry self-describing. The Tasks call
// runs INSIDE the per-project worker (sequentially, after Time) so it stays
// within the same ≤ 5 concurrency budget, and is skipped for empty projects.

const MAX_CONCURRENCY = 5;

type XeroProject = { projectId: string; name: string };
type XeroTask = { taskId: string; name: string };
type XeroTimeEntry = {
  timeEntryId: string;
  taskId: string;
  userId: string;
  dateUtc: string;
  duration: number;
  description?: string;
  status: string;
};

export const GET = withErrorEnvelope(async (req: NextRequest) => {
  const session = requireSession(req);
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const projects = await paginate<XeroProject>("/Projects", {
    states: "INPROGRESS",
  });

  const perProject = await mapWithConcurrency(
    projects,
    MAX_CONCURRENCY,
    async (project): Promise<WeekEntry[]> => {
      const entries = await paginate<XeroTimeEntry>(
        `/Projects/${project.projectId}/Time`,
        { userId: session.userId, dateAfterUtc: from, dateBeforeUtc: to },
      );
      if (entries.length === 0) return [];

      // Resolve task names (unfiltered — invoiced/locked tasks included).
      const tasks = await paginate<XeroTask>(
        `/Projects/${project.projectId}/Tasks`,
      );
      const taskName = new Map(tasks.map((t) => [t.taskId, t.name]));

      return entries.map((e) => ({
        timeEntryId: e.timeEntryId,
        projectId: project.projectId,
        projectName: project.name,
        taskId: e.taskId,
        taskName: taskName.get(e.taskId) ?? e.taskId,
        dateUtc: e.dateUtc,
        duration: e.duration,
        description: e.description ?? "",
        status: e.status,
      }));
    },
  );

  return NextResponse.json(perProject.flat());
});

import { NextResponse, type NextRequest } from "next/server";
import { paginate } from "@/lib/xero/client";
import { withErrorEnvelope } from "@/lib/api/errors";
import { requireSession } from "@/lib/api/session-guard";

// GET /api/projects/{projectId}/tasks → the project's ACTIVE tasks only.
// Xero has NO task-status query param, so we paginate all tasks and filter
// `status === "ACTIVE"` client-side (ARCHITECTURE §5). Non-active tasks
// (INVOICED / LOCKED) are excluded. Returns `{ taskId, name, status }[]`.

type XeroTask = { taskId: string; name: string; status: string };

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = withErrorEnvelope(async (req: NextRequest, ctx: Ctx) => {
  requireSession(req);
  const { projectId } = await ctx.params;
  const tasks = await paginate<XeroTask>(`/Projects/${projectId}/Tasks`);
  return NextResponse.json(
    tasks
      .filter((t) => t.status === "ACTIVE")
      .map((t) => ({ taskId: t.taskId, name: t.name, status: t.status })),
  );
});

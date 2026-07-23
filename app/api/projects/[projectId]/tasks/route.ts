import { NextResponse, type NextRequest } from "next/server";
import { paginate } from "@/lib/xero/client";
import { withSession } from "@/lib/api/with-session";
import type { XeroSession } from "@/lib/xero/session";

// GET /api/projects/{projectId}/tasks → the project's ACTIVE tasks only.
// Xero has NO task-status query param, so we paginate all tasks and filter
// `status === "ACTIVE"` client-side (ARCHITECTURE §5). Non-active tasks
// (INVOICED / LOCKED) are excluded. Returns `{ taskId, name, status }[]`.

type XeroTask = { taskId: string; name: string; status: string };

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = withSession(
  async (_req: NextRequest, _session: XeroSession, ctx: Ctx) => {
    const { projectId } = await ctx.params;
    const tasks = await paginate<XeroTask>(`/Projects/${projectId}/Tasks`);
    return NextResponse.json(
      tasks
        .filter((t) => t.status === "ACTIVE")
        .map((t) => ({ taskId: t.taskId, name: t.name, status: t.status })),
    );
  },
);

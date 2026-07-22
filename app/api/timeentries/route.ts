import { NextResponse, type NextRequest } from "next/server";
import { withErrorEnvelope } from "@/lib/api/errors";
import { requireSession } from "@/lib/api/session-guard";
import { createTimeEntry } from "@/lib/xero/timeEntries";

// POST /api/timeentries — create one Xero time entry (ARCHITECTURE §5, §8.B).
// A flat write route: `projectId` rides in the body (a Cell always knows its
// projectId) so the route stays 1:1 with `POST /Projects/{projectId}/Time`.
// The session's `userId` is injected server-side by `createTimeEntry`.
//
// Body: { projectId, taskId, dateUtc, duration, description? }
//   dateUtc = "<localDate>T00:00:00Z" (the client builds it via `slotDateUtc`).
//
// Thin proxy: validation is Xero's to do — a Xero 400 surfaces as the
// `validation` envelope (per-Cell `fields`), unauth as `reauth_required`.

type CreateBody = {
  projectId?: string;
  taskId?: string;
  dateUtc?: string;
  duration?: number;
  description?: string;
};

export const POST = withErrorEnvelope(async (req: NextRequest) => {
  requireSession(req);

  const body = (await req.json().catch(() => ({}))) as CreateBody;
  const created = await createTimeEntry({
    projectId: String(body.projectId ?? ""),
    taskId: String(body.taskId ?? ""),
    dateUtc: String(body.dateUtc ?? ""),
    duration: Number(body.duration ?? 0),
    description: body.description,
  });

  return NextResponse.json(created, { status: 201 });
});

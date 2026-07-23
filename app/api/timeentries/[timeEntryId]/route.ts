import { NextResponse, type NextRequest } from "next/server";
import { withSession } from "@/lib/api/with-session";
import type { XeroSession } from "@/lib/xero/session";
import { deleteTimeEntry, updateTimeEntry } from "@/lib/xero/timeEntries";

// PUT/DELETE /api/timeentries/{timeEntryId} — edit + delete one Xero time entry
// (ARCHITECTURE §5, §8.B). Flat write routes: `projectId` rides in the PUT body
// / the DELETE query (a Cell always knows its projectId) so each stays 1:1 with
// `PUT|DELETE /Projects/{projectId}/Time/{timeEntryId}`. The session's `userId`
// is injected server-side by the Xero wrapper.
//
// PUT body: { projectId, taskId, dateUtc, duration, description? } — a FULL
//   replace (Xero PUT is not a patch), so the client sends back the Entry's
//   existing taskId/dateUtc/description alongside the changed duration.
// DELETE:   ?projectId=... — no body.
//
// Both return 204 (Xero returns 204). Thin proxy: a Xero 400 surfaces as the
// `validation` envelope, unauth as `reauth_required`.

type PutBody = {
  projectId?: string;
  taskId?: string;
  dateUtc?: string;
  duration?: number;
  description?: string;
};

type Ctx = { params: Promise<{ timeEntryId: string }> };

export const PUT = withSession(
  async (req: NextRequest, _session: XeroSession, ctx: Ctx) => {
    const { timeEntryId } = await ctx.params;

    const body = (await req.json().catch(() => ({}))) as PutBody;
    await updateTimeEntry({
      projectId: String(body.projectId ?? ""),
      timeEntryId,
      taskId: String(body.taskId ?? ""),
      dateUtc: String(body.dateUtc ?? ""),
      duration: Number(body.duration ?? 0),
      description: body.description,
    });

    return new NextResponse(null, { status: 204 });
  },
);

export const DELETE = withSession(
  async (req: NextRequest, _session: XeroSession, ctx: Ctx) => {
    const { timeEntryId } = await ctx.params;
    const projectId = new URL(req.url).searchParams.get("projectId") ?? "";

    await deleteTimeEntry({ projectId, timeEntryId });

    return new NextResponse(null, { status: 204 });
  },
);

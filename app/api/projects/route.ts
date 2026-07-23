import { NextResponse } from "next/server";
import { paginate } from "@/lib/xero/client";
import { withSession } from "@/lib/api/with-session";

// GET /api/projects → active projects only.
// Thin proxy over `GET /Projects?states=INPROGRESS`, paginated to pageCount
// (ARCHITECTURE §5). Returns a clean `{ projectId, name }[]` shape.

type XeroProject = { projectId: string; name: string; status?: string };

export const GET = withSession(async () => {
  const projects = await paginate<XeroProject>("/Projects", {
    states: "INPROGRESS",
  });
  return NextResponse.json(
    projects.map((p) => ({ projectId: p.projectId, name: p.name })),
  );
});

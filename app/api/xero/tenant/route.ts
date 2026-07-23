import { NextResponse, type NextRequest } from "next/server";
import {
  getCurrentSession,
  updateCurrentSession,
  type XeroSession,
} from "@/lib/xero/session";
import { paginate, XeroValidation } from "@/lib/xero/client";
import { withSession } from "@/lib/api/with-session";

type ProjectsUser = { userId: string; name: string; email: string };

// POST /api/xero/tenant — switch the ACTIVE organisation. Body: { tenantId }.
//
// One Xero token serves EVERY connected organisation (ARCHITECTURE §4: the
// tenant is just a header), so switching needs no re-auth — but the Projects
// `userId` is PER-TENANT, so it must be re-resolved in the target org via the
// same /projectsusers email-match the callback uses. The switch is
// transactional: the userId is resolved BEFORE the swap is kept, and any
// failure (not a Projects user there, upstream error) rolls the session back
// to the previous org. On success the wrapper re-persists the (now dirty)
// session to the cookie so the new active org sticks.
//
// A tenantId not in the session's connected list, or a login with no Projects
// licence in the target org, surfaces as the `validation` envelope.

type SwitchBody = { tenantId?: string };

export const POST = withSession(
  async (req: NextRequest, session: XeroSession) => {
    const body = (await req.json().catch(() => ({}))) as SwitchBody;
    const tenantId = String(body.tenantId ?? "");
    const target = session.tenants.find((t) => t.tenantId === tenantId);
    if (!target) {
      throw new XeroValidation({
        fields: { tenantId: "Unknown or unconnected organisation." },
      });
    }

    // Already active — nothing to do (idempotent; session stays clean, so no
    // cookie rewrite).
    if (target.tenantId === session.tenantId) {
      return NextResponse.json({
        tenantId: session.tenantId,
        org: session.tenantName,
      });
    }

    const prev = session;

    // Point the ambient session at the TARGET tenant (xeroFetch reads its
    // tenantId per call), resolve the userId there, and only then keep the
    // switch. Any throw rolls back to the previous org.
    updateCurrentSession({
      ...session,
      tenantId: target.tenantId,
      tenantName: target.tenantName,
    });
    try {
      const users = await paginate<ProjectsUser>("/projectsusers");
      const match = users.find(
        (u) => (u.email ?? "").toLowerCase() === session.email,
      );
      if (!match) {
        throw new XeroValidation({
          fields: {
            tenantId: `Your login is not a Projects user in ${target.tenantName}.`,
          },
        });
      }
      updateCurrentSession({ ...getCurrentSession(), userId: match.userId });
    } catch (err) {
      updateCurrentSession(prev); // roll back — old org stays live
      throw err;
    }

    return NextResponse.json({
      tenantId: target.tenantId,
      org: target.tenantName,
    });
  },
);

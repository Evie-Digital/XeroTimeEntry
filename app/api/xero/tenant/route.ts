import { NextResponse, type NextRequest } from "next/server";
import { getSession, setSession } from "@/lib/xero/session";
import { paginate, XeroValidation } from "@/lib/xero/client";
import { withErrorEnvelope } from "@/lib/api/errors";
import { requireSession } from "@/lib/api/session-guard";

type ProjectsUser = { userId: string; name: string; email: string };

// POST /api/xero/tenant — switch the ACTIVE organisation. Body: { tenantId }.
//
// One Xero token serves EVERY connected organisation (ARCHITECTURE §4: the
// tenant is just a header), so switching needs no re-auth — but the Projects
// `userId` is PER-TENANT, so it must be re-resolved in the target org via the
// same /projectsusers email-match the callback uses. The switch is
// transactional: the userId is resolved BEFORE the swap is kept, and any
// failure (not a Projects user there, upstream error) rolls the session back
// to the previous org so the grid keeps working.
//
// A tenantId not in the session's connected list, or a login with no Projects
// licence in the target org, surfaces as the `validation` envelope.

type SwitchBody = { tenantId?: string };

export const POST = withErrorEnvelope(async (req: NextRequest) => {
  const session = requireSession(req);

  const body = (await req.json().catch(() => ({}))) as SwitchBody;
  const tenantId = String(body.tenantId ?? "");
  const target = session.tenants.find((t) => t.tenantId === tenantId);
  if (!target) {
    throw new XeroValidation({
      fields: { tenantId: "Unknown or unconnected organisation." },
    });
  }

  // Already active — nothing to do (idempotent).
  if (target.tenantId === session.tenantId) {
    return NextResponse.json({
      tenantId: session.tenantId,
      org: session.tenantName,
    });
  }

  const prev = {
    tenantId: session.tenantId,
    tenantName: session.tenantName,
    userId: session.userId,
  };

  // Point the shared Xero client at the TARGET tenant (xeroFetch reads the
  // session's tenantId per call), resolve the userId there, and only then
  // consider the switch committed. Any throw rolls back.
  setSession({
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
    setSession({ ...getSession()!, userId: match.userId });
  } catch (err) {
    setSession({ ...getSession()!, ...prev }); // roll back — old org stays live
    throw err;
  }

  return NextResponse.json({
    tenantId: target.tenantId,
    org: target.tenantName,
  });
});

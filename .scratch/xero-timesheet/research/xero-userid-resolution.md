# Xero userId resolution — research findings

## BOTTOM LINE
Every Projects time-entry POST needs a `userId` that comes from **`GET /projectsusers`** (Projects API), NOT from the OAuth/OpenID identity. The `projectsusers` response returns `{ userId (uuid), name, email }` per user inside a paginated envelope, and **nothing in the response marks which entry is the authenticated caller**. To resolve THE current user you must: (1) obtain the caller's email from the **OpenID Connect `email` claim** in the `id_token` (request scopes `openid email profile`), then (2) call `GET /projectsusers` for the active tenant and **match on `email`** (case-insensitively) to find their `userId`. This `userId` is a stable per-tenant UUID and **can be resolved once and cached per (tenant, user)** — cache it keyed by `tenantId` + email. Do NOT reuse it across tenants, and re-resolve if a cached match fails (e.g. licence/assignment changes). Guard for the case where the authenticated person is not a project user in that tenant (no Projects licence / not set up), which yields no match and means time entries cannot be posted for them.

## 1. `GET /projectsusers` response shape and identifying the current user

Source: official XeroAPI OpenAPI spec (`xero-projects.yaml`) and Projects API Users doc.

Response is a **paginated envelope**:
```json
{
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "pageCount": 1,
    "itemCount": 2
  },
  "items": [
    {
      "userId": "00000000-0000-0000-0000-000000000000",
      "name": "Joe Bloggs",
      "email": "joe@example.com"
    }
  ]
}
```
Per-user fields (the ONLY fields on a `ProjectUser`):
- `userId` — string, format `uuid`. This is the value used as `userId` in time-entry POSTs.
- `name` — string (display name).
- `email` — string.

**There is NO field marking the caller / current authenticated user.** The endpoint returns "all project users" undifferentiated. Therefore the current user must be identified by **matching `email`**.

Where the caller's email comes from (primary options):
- **Preferred: OpenID Connect `id_token` `email` claim.** When you request scopes `openid email profile` in the OAuth2 auth-code flow, the returned `id_token` (a JWT) contains standard OIDC claims including `email`, plus `given_name`/`family_name` and Xero-specific `xero_userid`. Decode the `id_token` to get the signed-in user's email. (Xero also exposes an OIDC config at `https://identity.xero.com/.well-known/openid-configuration`.)
- **`GET https://api.xero.com/connections` does NOT return email.** It returns connection/tenant records only: `id`, `authEventId`, `tenantId`, `tenantType` (e.g. `ORGANISATION`), `tenantName`, `createdDateUtc`, `updatedDateUtc`. It is used to pick the `tenantId` (sent as the `Xero-tenant-id` header), not to identify the person. So email must come from the OpenID claim, not connections.

Important namespace caveat: the OIDC `xero_userid` claim is a **global Xero login identifier and is NOT the same value as the Projects `userId`** (which is a per-tenant Projects user id). You cannot join them directly — matching is by `email`.

## 2. Stability and caching of `userId`
- The Projects `userId` is a stable UUID for a given user **within a given tenant/organisation**. It is safe to resolve once and cache.
- It is **tenant-scoped**: the same human in two different Xero organisations will have different `projectsusers` `userId` values, so cache must be keyed by `tenantId` (plus the user's email/identity), never shared across tenants.
- Recommended cache key: `(tenantId, callerEmail)` → `userId`. Invalidate/re-resolve on a failed lookup or Projects-permission change.

## 3. Relationship: OAuth identity ↔ tenant/connection ↔ Projects userId
- The **OAuth-authenticated identity** (who logged in) is captured in the `id_token` OIDC claims (`email`, `xero_userid`, name claims).
- The **tenant/connection** is selected from `GET /connections` (`tenantId`), and every Projects API call is scoped to that tenant via the `Xero-tenant-id` header.
- The **Projects `userId`** is a separate per-tenant identity that only exists if the person is set up as a Projects user in that specific organisation.
- **The authenticated person is NOT guaranteed to appear in `GET /projectsusers`.** They appear only if they are a staff member of that organisation AND have been given Projects access/licence. A valid OAuth token for a tenant does not imply the signed-in user is a project user there. Your code must handle "email not found in projectsusers" (cannot post time entries for that user in that tenant).

## 4. Pagination and licensing caveats
- **Pagination:** query params `page` (default 1) and `pageSize` (default 50; documented max 500 per the OpenAPI spec — treat as the source of truth and iterate `pagination.pageCount`). For a single-user or small org this is typically one page, but implement pagination defensively rather than assuming all users on page 1.
- **Licensing / setup:** Only staff who have been set up to use Xero Projects (Projects checkbox + a projects user role, which consumes a Projects subscription seat) are project users. Someone who authenticates but has no Projects access will not be returned by `/projectsusers`, so there will be no `userId` to post time against. (Projects itself requires an eligible Xero plan/subscription.) — Xero Central: "Set up staff to use Xero Projects" / "Assign staff to a project" / "Manage your Projects subscription".

## Recommended implementation flow (single-user app)
1. Auth with scopes including `openid email profile projects` (+ offline_access).
2. Decode `id_token`; read the `email` claim → `callerEmail`.
3. `GET /connections` → choose `tenantId`.
4. Check cache for `(tenantId, callerEmail)`; if hit, use cached `userId`.
5. Else `GET /projectsusers` (paginate), find item where `email == callerEmail` (case-insensitive) → `userId`; cache it.
6. If no match, surface an error: the signed-in user is not a Projects user in this tenant (needs Projects licence/assignment).
7. Use cached `userId` for all time-entry POSTs; re-resolve on lookup failure.

## Sources
- Projects API — Projects Users endpoint: https://developer.xero.com/documentation/api/projects/users
- Projects API — Overview: https://developer.xero.com/documentation/api/projects/overview
- Official XeroAPI OpenAPI spec (ProjectUser / ProjectUsers / GET projectsusers schema): https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/master/xero-projects.yaml (repo: https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-projects.yaml)
- OAuth2 auth-code flow (id_token / claims): https://developer.xero.com/documentation/guides/oauth2/auth-flow/
- Token types (id_token contents, `xero_userid`, OIDC claims): https://developer.xero.com/documentation/guides/oauth2/token-types
- Scopes (openid, email, profile, projects): https://developer.xero.com/documentation/guides/oauth2/scopes/
- Xero Tenants / connections (`GET /connections` shape): https://developer.xero.com/documentation/guides/oauth2/tenants
- Accounting API requests/responses (pagination object semantics): https://developer.xero.com/documentation/api/accounting/requests-and-responses
- Xero Central — Set up staff to use Xero Projects: https://central.xero.com/s/article/Set-up-staff-to-use-Xero-Projects
- Xero Central — Assign staff to a project: https://central.xero.com/s/article/Assign-staff-to-a-project

**Non-primary fallback flagged:** The exact `projectsusers` field/schema details and pagination bounds were confirmed via the official **XeroAPI OpenAPI spec on GitHub** (authoritative, Xero-owned) because the `developer.xero.com` HTML pages repeatedly timed out during fetch. The licensing/setup points draw on **Xero Central** (official support docs). No third-party/community sources were relied upon for factual claims.

# Xero Projects — Fast Time-Entry App · Architecture & Build Plan

A single-user, local-only web app that logs, edits, and deletes time in **Xero Projects** through a
fast, keyboard-driven **weekly grid**. This document is the hand-off spec: it is complete enough to
implement from, and every decision here was settled and recorded on the wayfinder map under
`.scratch/xero-timesheet/`. Each section links back to the decision ticket that owns its detail.

> **Interactive UX prototype (signed off):**
> https://claude.ai/code/artifact/7ce3ffba-c9db-4709-8654-139979c8c5a8

---

## 1. Scope & fixed constraints

| Constraint | Decision |
|---|---|
| **Users** | Single user (just you). No multi-user, no team auth. |
| **Deployment** | Local-only, runs on `localhost` (`npm run dev`). No cloud, no shared DB. |
| **Grid capability** | Read + edit + delete existing Xero entries, plus create new. |
| **Stack** | Next.js (App Router). API routes proxy Xero so the client secret never reaches the browser. |
| **Token storage** | **In server-process memory only, never persisted.** ~one Xero login per week. |
| **Cadence** | Weekly use. |

**Out of scope:** multi-user/team auth, cloud hosting & shared DB, building anything beyond this plan,
and non-Projects Xero APIs (invoicing, expenses, payroll).

---

## 2. Domain model & ubiquitous language

The core model (ticket 0005). This vocabulary is used everywhere — grid, API, and code.

| Term | Meaning |
|---|---|
| **Entry** | A Xero time-entry record: `{ timeEntryId, projectId, taskId, userId, dateUtc, duration (minutes), description, status }`. |
| **Slot** | A grid cell's identity: `(projectId, taskId, localDate)`. **Invariant: a Slot maps to ≤ 1 Entry.** |
| **Row** | A `(projectId, taskId)` pairing across the week's 7 Slots. |
| **Cell** | The UI of a Slot: hours + optional note + a state (`empty / editing / saving / saved / error / locked / conflict`). |

**Rules:**
- **One Entry per Cell.** Empty Slot + hours → `POST`; saved Slot changed → `PUT` (full-replace);
  cleared → `DELETE`.
- **Canonical unit = integer minutes** (`1..59940`). UI shows decimal hours.
- **Pure calendar dates, never timezone-convert.** Write `dateUtc = <localDate>T00:00:00Z`; bucket a
  read Entry into the Slot whose date = the **date portion of `dateUtc`**, taken verbatim. Writes and
  reads both key off the UTC date substring → no drift.
- **Locked/invoiced** Entries (`status` not `ACTIVE`) render read-only.
- **Conflict:** if Xero already holds 2+ Entries in one Slot (logged elsewhere), the Cell shows the
  read-only **sum** with a `⋯` marker and refuses edits until you delete extras down to one. The grid
  never creates a second Entry in a Slot.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router)** | One codebase; API routes hold the client secret + tokens server-side. |
| Language | **TypeScript** | — |
| UI | **React + Tailwind CSS** | Fast to build; the grid is custom. |
| Server state / cache | **TanStack Query (React Query)** + `localStorage` persistence | Warm pickers on start; owns retry/backoff/de-dupe (§5). |
| HTTP | `fetch` (server-side wrapper) | Thin proxy; no SDK needed. |
| Runtime | Local `npm run dev` on `http://localhost:3000` | Single user. |

No database. The only persisted secret is the app's **Xero client secret** in `.env.local`
(git-ignored).

---

## 4. OAuth 2.0 & token strategy

Tickets 0002 (flow) + 0006 (storage). Xero facts verified against Xero's official docs/OpenAPI spec
(see `.scratch/xero-timesheet/research/`).

### Flow
- **Standard Authorization Code flow with a confidential client secret** (the Next.js server holds the
  secret). *Not* PKCE — PKCE is for native apps that can't hold a secret.
- **Scopes:** `openid profile email projects offline_access`.
  - `projects` = read **and** write (covers time-entry writes).
  - `offline_access` returns the refresh token.
  - `email` is **required** — used to resolve your Projects `userId` (below).
- **Redirect URI:** `http://localhost:3000/api/xero/callback` — Xero allows `http://localhost` for dev
  (but **not** `http://127.0.0.1`); must match exactly (scheme/host/port/path); no wildcards.
- **App registration:** register a *Web app* in the Xero developer portal with the redirect URI and
  scopes above; note the Client ID and generate the Client Secret (server-only).

### Tenant & user resolution (once, at callback)
1. Exchange the code for tokens.
2. `GET https://api.xero.com/connections` → pick `tenantId` (+ `tenantName`). **Every** Projects call
   needs both `Authorization: Bearer` and `Xero-tenant-id` headers.
3. Decode the `id_token` → `email` claim (the caller's email).
4. `GET /projectsusers` (paginate) → match the item whose `email` equals the caller's → **`userId`**.
   `GET /projectsusers` marks no one as "the caller", so email-matching is the only way. Guard the
   no-match case (you have no Projects licence in this tenant → can't post time).
5. Cache `tenantId` + `userId` in the in-memory session.

### Token lifecycle (memory-only)
- Access token ≈ **30 min**; refresh token ≈ **60-day** inactivity window and **rotates on every use**
  (each refresh returns a new refresh token; persist it, discard the old; 30-min grace to retry).
- **Storage:** an in-memory session object `{ accessToken, accessTokenExpiry, refreshToken, tenantId,
  userId, email, name, tenantName }`. **Never written to disk.**
- **Session lifecycle:** lives for the running server process; **stopping the app (Ctrl+C) discards
  it** → fresh login next start. (No idle timeout / logout button by choice.)
- **Refresh routine:** proactive (refresh ~90 s before expiry) + reactive (on a 401, refresh once and
  retry). **Single-flight** so concurrent requests trigger exactly one refresh. Refresh failure →
  clear session → re-auth. See the reference snippet in §8.
- **Browser ↔ server:** a signed **httpOnly** session cookie marks the authorized browser; tokens stay
  server-side and never reach the client.

---

## 5. Backend — API abstraction layer

Ticket 0009. **Posture: thin proxy.** Internal routes are ~1:1 with Xero through a single server-side
Xero client wrapper; the client (React Query) owns retry/backoff/de-dupe.

### Routes (`app/api/…`)

| Internal route | Xero call |
|---|---|
| `GET /auth/login` → 302 | build Xero authorize URL (scopes + `state`) |
| `GET /auth/callback` → 302 | exchange code → store tokens → resolve tenant + `userId` → set cookie |
| `GET /auth/status` | — (from session): `{ authenticated, user?, org? }` |
| `POST /auth/logout` *(optional, not UI-wired)* | clear session + cookie |
| `GET /projects` | paginate `GET /Projects?states=INPROGRESS` (active only) |
| `GET /projects/{id}/tasks` | paginate `GET /Projects/{id}/Tasks`, filter `status==='ACTIVE'` |
| `GET /me` | — (session `{ userId, name, email }`) |
| **`GET /week?from&to`** | **full scan**: fan out `GET /Projects/{id}/Time?userId&dateAfterUtc&dateBeforeUtc` across *all* active projects, merge |
| `POST /timeentries` (projectId in body) | `POST /Projects/{projectId}/Time` |
| `PUT /timeentries/{id}` (projectId in body, full-replace) | `PUT /Projects/{projectId}/Time/{id}` |
| `DELETE /timeentries/{id}?projectId=` | `DELETE /Projects/{projectId}/Time/{id}` |

Write routes are flat with `projectId` in the payload (a Cell always knows its projectId); task reads
stay nested. All routes except login/callback require the session cookie.

> **Why `/week` fans out:** Xero has **no global time-entry list** — the endpoint is per-project. You
> chose the **full-scan** load (query every active project) so a week is always complete, even for time
> logged directly in Xero to a project not yet in your grid. The fan-out is server-side and **capped at
> ≤ 5 concurrent** to respect Xero's concurrency limit.

### Error envelope (uniform, every route)

```json
{ "error": { "code": "...", "message": "...", "retryAfter": 3, "fields": { "duration": "..." } }, "status": 429 }
```

| `code` | HTTP | Client behavior |
|---|---|---|
| `reauth_required` | 401 | redirect to `/auth/login` |
| `rate_limited` | 429 | React Query backoff honoring `retryAfter` (Xero's `Retry-After`) |
| `validation` | 400 | show per-Cell error (`fields`) |
| `upstream` | 502 | toast + Cell error |

### Retry split
- **Server retries only** the auth 401 (refresh + retry once).
- **Client (React Query)** retries 429 (honoring `retryAfter`) and 5xx (bounded backoff); never retries
  validation or reauth.
- **Mutations are optimistic** (Cell shows `saving`→`saved`); on failure, roll the Cell back and show
  its error.
- **Coalescing:** React Query query-keys de-dupe concurrent identical GETs; the server holds no cache.

### Xero operational limits (ticket 0003)
60 calls/min + 5,000/day + **5 concurrent** per tenant (Projects shares the platform quota). 429s carry
`Retry-After`; responses carry `X-MinLimit-Remaining` / `X-DayLimit-Remaining` for proactive throttling.
Pagination: `page` + `pageSize` (≤ 500), loop to `pagination.pageCount`.

---

## 6. Frontend — architecture & grid UX spec

Tickets 0007 (caching/prefill) + 0008 (grid UX) + 0005 (model).

### Data & caching
- **React Query + `localStorage`** persistence. Cached: active projects, per-project active tasks
  (TTL ~10 min, stale-while-revalidate, + a manual "refresh lists" action). The week's entries are
  fetched per visited week via `GET /week` and **invalidated on every write**.
- `userId` / `tenantId` live in server session memory (not client-persisted).

### Prefill — "copy last week" (source A+B)
- **A (primary):** seed a new week's Rows from the distinct `(projectId, taskId)` pairs in the previous
  week's Xero entries (a natural by-product of the full `/week` scan).
- **B (augment):** a `localStorage` "recent rows" set carries rows added-but-not-yet-logged so an empty
  row you just added isn't forgotten.
- First week / no history → empty grid, add rows manually. **No usage ranking** — the add-row picker is
  a plain typeahead.

### Grid UX (locked from the prototype)

**Layout:** Rows = `Project · Task` (sticky left), columns = Mon–Sun (sticky header, today highlighted),
a per-Row **Total** column (sticky right) + a **Daily total** footer + grand total. Horizontal scroll
is contained to the grid.

**Keyboard model (the key map):**

| Key | Action |
|---|---|
| **Arrows** | move between Cells |
| **Tab / Shift+Tab** | commit + move right / left (wraps across rows) |
| **type digit / `.` / `:`** | start editing immediately (no enter-edit step) |
| **Enter** | commit + move **down** (fast vertical fill of one task across the week) |
| **Esc** | cancel edit (revert) |
| **Backspace / Delete** | clear a committed Cell (⇒ `DELETE` the Entry) |
| **⌘/Ctrl + K** | open the add-row typeahead (↑↓ pick · Enter add · Esc close) |
| **⌥Enter** *or* **double-click** | open the description editor for the focused Cell |

**Duration input formats accepted:** `1.5` (decimal h), `1:30` (h:mm), `:45` (mins), `90m`, `1h30`,
`1h` — all normalize to integer minutes; rendered back as decimal hours. Heuristic: a bare integer ≥ 16
(e.g. `90`) is read as **minutes**, `< 16` as hours.

**Description / note:** three routes, one path — (1) **inline** `2.5 // fixed the auth bug` (the `//`
splits hours from note; `2.5 //` clears it; editing re-opens as `hours // note`); (2) **double-click**
the Cell; (3) **⌥Enter**. A Cell with a note shows a dot indicator.

**Save model:** **live per-cell autosave** — each Cell POST/PUT/DELETEs on commit; a status bar shows
sync state. **No batch "submit the week" button.** Consequence: an unresolved `conflict` Cell is
**non-blocking** — it never holds up any other Cell.

---

## 7. Implementation roadmap

### Phase 1 — Setup & auth
1. `create-next-app` (TS, App Router, Tailwind). Add `.env.local` (`XERO_CLIENT_ID`,
   `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, a cookie-signing secret) — git-ignored.
2. Register the Web app in the Xero developer portal (redirect URI + scopes from §4). **Verify the
   exact Projects granular-scope token names on the live Scopes page** (post-2 Mar 2026 apps use
   granular scopes).
3. Build the in-memory session module + `/auth/login`, `/auth/callback`, `/auth/status`. Resolve
   `tenantId` (`/connections`) and `userId` (`/projectsusers` email-match) at callback.
4. Implement the shared Xero client wrapper (single-flight refresh, tenant header, 401→refresh+retry,
   `paginate()`) — §8 snippet A.

### Phase 2 — Core API layer & data fetching
5. Build the read routes (`/projects`, `/projects/{id}/tasks`, `/me`) and the composed `/week` full-scan
   (≤5-concurrent fan-out). Normalize the error envelope.
6. Build the write routes (`POST/PUT/DELETE /timeentries`) — §8 snippet B.
7. Wire React Query on the client (query keys, TTLs, `localStorage` persistence, invalidation on write).

### Phase 3 — Frontend grid & keyboard
8. Build the weekly grid (layout, sticky headers, totals), the Cell state machine
   (`empty…conflict`), and the duration parser (§6).
9. Implement the full keyboard model + `⌘K` add-row typeahead + the description flows (inline `//`,
   double-click, ⌥Enter).
10. Implement prefill (copy last week A+B) and week navigation.

### Phase 4 — Offline / drafts *(optional — see ticket 0011)*
11. If desired, resolve ticket 0011 (queue-and-replay vs fail-loud when Xero is unreachable) and add a
    durable mutation queue + `pending` Cell state. The core app (Phases 1–3) ships without this.

---

## 8. Reference code snippets

### A. OAuth token-refresh helper (memory-only, rotating, single-flight)

```ts
// lib/xero/session.ts — in-memory Xero token session (decision 0006: memory-only)
export class ReauthRequired extends Error {}

type XeroSession = {
  accessToken: string;
  accessTokenExpiry: number; // epoch ms
  refreshToken: string;
  tenantId: string;
  userId: string;
  email: string;
  name: string;
  tenantName: string;
};

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const EXPIRY_SKEW_MS = 90_000; // refresh 90s before expiry

let session: XeroSession | null = null;
let refreshInFlight: Promise<XeroSession> | null = null;

export const getSession = () => session;
export const setSession = (s: XeroSession) => { session = s; };
export const clearSession = () => { session = null; refreshInFlight = null; };

/** Returns a valid access token, refreshing proactively if near expiry. */
export async function getFreshAccessToken(): Promise<string> {
  if (!session) throw new ReauthRequired("no session");
  if (Date.now() < session.accessTokenExpiry - EXPIRY_SKEW_MS) return session.accessToken;
  return (await refreshTokens()).accessToken;
}

/** Single-flight refresh: concurrent callers share one round-trip. */
export function refreshTokens(): Promise<XeroSession> {
  if (!session) return Promise.reject(new ReauthRequired("no session"));
  if (refreshInFlight) return refreshInFlight;
  const current = session;
  refreshInFlight = doRefresh(current).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function doRefresh(current: XeroSession): Promise<XeroSession> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
    }),
  });

  if (!res.ok) {
    clearSession(); // expired / revoked → force re-auth
    throw new ReauthRequired(`refresh failed: ${res.status}`);
  }

  const tok = await res.json(); // { access_token, refresh_token, expires_in, ... }
  // Xero ROTATES the refresh token every use — persist the new one, discard the old.
  session = {
    ...current,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    accessTokenExpiry: Date.now() + tok.expires_in * 1000,
  };
  return session;
}
```

### B. Time-entry write wrapper (`POST /Projects/{projectId}/Time`)

```ts
// lib/xero/timeEntries.ts
import { getSession, getFreshAccessToken, refreshTokens, ReauthRequired } from "./session";

const PROJECTS_BASE = "https://api.xero.com/projects.xro/2.0";

export class RateLimited extends Error { constructor(public retryAfter: number) { super("rate_limited"); } }
export class XeroValidation extends Error { constructor(public body: unknown) { super("validation"); } }
export class UpstreamError extends Error {}

/** Every Xero Projects call goes through here: fresh token, tenant header, 401→refresh+retry-once. */
export async function xeroFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const s = getSession();
  if (!s) throw new ReauthRequired("no session");

  const call = async () => {
    const token = await getFreshAccessToken();
    return fetch(`${PROJECTS_BASE}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        "Xero-tenant-id": s.tenantId,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  };

  let res = await call();
  if (res.status === 401) { await refreshTokens(); res = await call(); } // reactive refresh, retry once
  return res;
}

export type NewTimeEntry = {
  projectId: string;
  taskId: string;
  dateUtc: string;    // "2026-07-20T00:00:00Z" — local calendar date at midnight UTC (decision 0005)
  duration: number;   // integer minutes, 1..59940
  description?: string;
};

export async function createTimeEntry(entry: NewTimeEntry) {
  const s = getSession();
  if (!s) throw new ReauthRequired("no session");

  const res = await xeroFetch(`/Projects/${entry.projectId}/Time`, {
    method: "POST",
    body: JSON.stringify({
      userId: s.userId, // resolved once at login via /projectsusers email-match (decision 0004)
      taskId: entry.taskId,
      dateUtc: entry.dateUtc,
      duration: entry.duration,
      ...(entry.description ? { description: entry.description } : {}),
    }),
  });

  if (res.status === 429) throw new RateLimited(Number(res.headers.get("Retry-After") ?? 1));
  if (res.status === 400) throw new XeroValidation(await res.json().catch(() => null));
  if (!res.ok) throw new UpstreamError(`Xero ${res.status}`);
  return res.json(); // created Entry incl. timeEntryId, status: "ACTIVE"
}

// PUT (edit) and DELETE follow the same shape:
//   PUT    /Projects/{projectId}/Time/{timeEntryId}   (full-replace body, → 204)
//   DELETE /Projects/{projectId}/Time/{timeEntryId}   (→ 204)   — only while status === "ACTIVE"
```

---

## 9. Open / deferred items

| Item | Status |
|---|---|
| **Offline / draft support** | Optional Phase 4 — ticket 0011 (queue-and-replay vs fail-loud). Not on the critical path. |
| **Granular-scope token names** | Verify exact Projects granular scope strings on Xero's live Scopes / Granular-Scopes FAQ at app-registration time (post-2 Mar 2026). |
| **Local app packaging / launch** | How you start a weekly session (`npm run dev` vs a launcher). No passphrase step (tokens memory-only). |

---

## 10. Appendix — decision trail

The full reasoning for each decision lives in its ticket under `.scratch/xero-timesheet/tickets/`, and
the Xero API facts in `.scratch/xero-timesheet/research/` (verified against Xero's official docs and
OpenAPI spec).

- **0001** time-entry CRUD · **0002** OAuth flow · **0003** limits/pagination · **0004** userId
- **0005** grid ↔ entry model · **0006** token storage · **0007** caching/prefill · **0008** grid UX ·
  **0009** API layer · **0010** this document · **0011** offline (optional)

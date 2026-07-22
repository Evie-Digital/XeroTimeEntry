// lib/xero/client.ts — the shared server-side Xero HTTP wrapper (ARCHITECTURE
// §5/§8.B). Every Xero call funnels through `xeroFetch`, which injects the
// bearer token + tenant header and does a reactive single-retry on 401.
//
// Reused by every later data slice, so the error taxonomy lives here.

import {
  getFreshAccessToken,
  getSession,
  refreshTokens,
  ReauthRequired,
} from "./session";

// Base URLs (ARCHITECTURE §4).
export const IDENTITY_BASE = "https://identity.xero.com";
export const XERO_API_BASE = "https://api.xero.com"; // /connections lives here
export const PROJECTS_BASE = "https://api.xero.com/projects.xro/2.0";

/** Xero 429 — carries the `Retry-After` seconds for client-side backoff. */
export class RateLimited extends Error {
  constructor(public retryAfter: number) {
    super("rate_limited");
    this.name = "RateLimited";
  }
}

/** Xero 400 — carries the validation body so callers can surface per-field errors. */
export class XeroValidation extends Error {
  constructor(public body: unknown) {
    super("validation");
    this.name = "XeroValidation";
  }
}

/** Any other non-ok upstream response (5xx / unexpected). */
export class UpstreamError extends Error {
  constructor(message = "upstream") {
    super(message);
    this.name = "UpstreamError";
  }
}

export type XeroFetchInit = RequestInit & {
  /** Override the base URL. Defaults to the Projects API base. */
  base?: string;
};

/**
 * Every Xero call goes through here: fresh token, tenant header,
 * 401 → refresh once → retry once.
 */
export async function xeroFetch(
  path: string,
  init: XeroFetchInit = {},
): Promise<Response> {
  if (!getSession()) throw new ReauthRequired("no session");
  const { base = PROJECTS_BASE, headers, ...rest } = init;

  const call = async (): Promise<Response> => {
    const token = await getFreshAccessToken();
    const h = new Headers(headers as HeadersInit | undefined);
    h.set("Authorization", `Bearer ${token}`);
    // /connections has no tenant yet — only send the header once resolved.
    const tenantId = getSession()?.tenantId;
    if (tenantId) h.set("Xero-tenant-id", tenantId);
    h.set("Accept", "application/json");
    if (rest.body != null && !h.has("Content-Type")) {
      h.set("Content-Type", "application/json");
    }
    return fetch(`${base}${path}`, { ...rest, headers: h });
  };

  let res = await call();
  if (res.status === 401) {
    await refreshTokens(); // reactive refresh…
    res = await call(); // …retry exactly once
  }
  return res;
}

type Paginated<T> = {
  pagination?: {
    page: number;
    pageCount: number;
    pageSize: number;
    itemCount: number;
  };
  items?: T[];
};

/**
 * Loops a paginated Xero Projects collection (`page` → `pageCount`) and returns
 * the flattened items. Throws `RateLimited`/`UpstreamError` on failure.
 */
export async function paginate<T>(
  path: string,
  query: Record<string, string | number> = {},
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  let pageCount = 1;

  do {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) qs.set(k, String(v));
    qs.set("page", String(page));
    const sep = path.includes("?") ? "&" : "?";

    const res = await xeroFetch(`${path}${sep}${qs.toString()}`);
    if (res.status === 429) {
      throw new RateLimited(Number(res.headers.get("Retry-After") ?? 1));
    }
    if (!res.ok) throw new UpstreamError(`Xero ${res.status}`);

    const data = (await res.json()) as Paginated<T>;
    if (data.items) items.push(...data.items);
    pageCount = data.pagination?.pageCount ?? 1;
    page += 1;
  } while (page <= pageCount);

  return items;
}

// lib/api/errors.ts — the uniform API error envelope (ARCHITECTURE §5).
//
// Maps the Xero error taxonomy (thrown by lib/xero/*) onto ONE JSON shape that
// every data/write route returns, so the client (React Query) has a single
// contract to branch on. Reused by ALL later data + write slices — keep it
// small and stable.
//
// Server-only (imports next/server + the Xero client). The client parses the
// envelope shape independently; do not import this from client components.

import { NextResponse, type NextRequest } from "next/server";
import { ReauthRequired } from "@/lib/xero/session";
import { RateLimited, XeroValidation } from "@/lib/xero/client";

export type ApiErrorCode =
  | "reauth_required"
  | "rate_limited"
  | "validation"
  | "upstream";

/** The uniform error body. `status` mirrors the HTTP status (ARCHITECTURE §5). */
export type ApiErrorEnvelope = {
  error: {
    code: ApiErrorCode;
    message: string;
    retryAfter?: number;
    fields?: Record<string, string>;
  };
  status: number;
};

const DEFAULT_MESSAGE: Record<ApiErrorCode, string> = {
  reauth_required: "Your Xero session has expired — please reconnect.",
  rate_limited: "Xero rate limit reached — retrying shortly.",
  validation: "Xero rejected the request (validation).",
  upstream: "The Xero request failed.",
};

/**
 * Pull per-field errors out of a Xero validation body into a flat
 * `{ field: message }` map. Handles Xero's common `ModelState` shape (and its
 * camelCase variant) plus a passthrough `fields`. Defensive — unknown shapes
 * yield `undefined` (the envelope simply omits `fields`).
 */
function extractFields(body: unknown): Record<string, string> | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;

  const modelState = (b.ModelState ?? b.modelState) as
    | Record<string, unknown>
    | undefined;
  const source =
    modelState && typeof modelState === "object"
      ? modelState
      : b.fields && typeof b.fields === "object"
        ? (b.fields as Record<string, unknown>)
        : undefined;
  if (!source) return undefined;

  const out: Record<string, string> = {};
  for (const [field, value] of Object.entries(source)) {
    out[field] = Array.isArray(value) ? String(value[0]) : String(value);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Map any thrown error to the uniform envelope + HTTP status. */
export function toErrorEnvelope(err: unknown): ApiErrorEnvelope {
  if (err instanceof ReauthRequired) {
    return {
      error: { code: "reauth_required", message: DEFAULT_MESSAGE.reauth_required },
      status: 401,
    };
  }
  if (err instanceof RateLimited) {
    return {
      error: {
        code: "rate_limited",
        message: DEFAULT_MESSAGE.rate_limited,
        retryAfter: err.retryAfter,
      },
      status: 429,
    };
  }
  if (err instanceof XeroValidation) {
    return {
      error: {
        code: "validation",
        message: DEFAULT_MESSAGE.validation,
        fields: extractFields(err.body),
      },
      status: 400,
    };
  }
  return {
    error: { code: "upstream", message: DEFAULT_MESSAGE.upstream },
    status: 502,
  };
}

/**
 * Wrap a route handler so any thrown Xero-taxonomy error becomes the uniform
 * envelope. Uses a rest-tuple for the trailing args so the wrapped handler
 * keeps the caller's exact arity — a static route stays `(req)` and a dynamic
 * route keeps its typed `{ params }` context, both of which satisfy Next's
 * generated route-type check.
 */
export function withErrorEnvelope<Args extends unknown[]>(
  handler: (
    req: NextRequest,
    ...args: Args
  ) => NextResponse | Promise<NextResponse>,
): (req: NextRequest, ...args: Args) => Promise<NextResponse> {
  return async (req, ...args) => {
    try {
      return await handler(req, ...args);
    } catch (err) {
      const envelope = toErrorEnvelope(err);
      return NextResponse.json(envelope, { status: envelope.status });
    }
  };
}

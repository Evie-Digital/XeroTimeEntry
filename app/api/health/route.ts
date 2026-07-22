import { NextResponse } from "next/server";

/**
 * Trivial health endpoint. Exists so the walking skeleton has a real
 * HTTP seam the example component can fetch from in the running app;
 * in tests the same request is intercepted by MSW (seam 2).
 */
export function GET() {
  return NextResponse.json({ status: "ok", service: "fast-time-entry" });
}

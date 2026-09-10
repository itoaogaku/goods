import { NextResponse } from "next/server";

/**
 * ALLOWED_ORIGIN accepts a single origin (e.g. "https://goods-dashboard.vercel.app")
 * or a comma-separated list. Falls back to "*" (useful in local/dev only).
 */
function resolveAllowedOrigin(requestOrigin: string | null): string {
  const configured = process.env.ALLOWED_ORIGIN;
  if (!configured) return "*";

  const allowList = configured.split(",").map((o) => o.trim());
  if (requestOrigin && allowList.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowList[0];
}

export function corsHeaders(requestOrigin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(requestOrigin),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export function jsonWithCors(
  requestOrigin: string | null,
  data: unknown,
  init?: ResponseInit
) {
  return NextResponse.json(data, {
    ...init,
    headers: { ...corsHeaders(requestOrigin), ...(init?.headers ?? {}) },
  });
}

export function preflightResponse(requestOrigin: string | null) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(requestOrigin) });
}

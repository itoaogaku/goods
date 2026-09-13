import type { NextRequest } from "next/server";
import { jsonWithCors, preflightResponse } from "@/lib/cors";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic endpoint: calls Wix's product catalog query once
 * and dumps the raw response, so we can see why syncWixProducts is
 * returning zero products instead of guessing. Safe to remove once the
 * real sync (lib/wix-products.ts) is confirmed working — this makes no
 * writes. Mirrors app/api/acc/wix-debug (already removed) which used the
 * same technique for the Orders API.
 */
export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const apiKey = process.env.WIX_API_KEY;
  const siteId = process.env.WIX_SITE_ID;

  if (!apiKey || !siteId) {
    return jsonWithCors(origin, { error: "WIX_API_KEY / WIX_SITE_ID が設定されていません" }, { status: 400 });
  }

  const body = { query: { paging: { limit: 5, offset: 0 } } };

  try {
    const res = await fetch("https://www.wixapis.com/stores-reader/v1/products/query-platformized", {
      method: "POST",
      headers: { Authorization: apiKey, "wix-site-id": siteId, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      // leave as null, raw text is returned below
    }

    const parsed = json as {
      products?: Array<{ _id?: string; name?: string; priceData?: { price?: unknown } }>;
      metadata?: unknown;
      message?: string;
      details?: unknown;
      [key: string]: unknown;
    } | null;

    return jsonWithCors(origin, {
      status: res.status,
      rawKeys: parsed ? Object.keys(parsed) : null,
      productCount: parsed?.products?.length ?? null,
      firstProduct: parsed?.products?.[0] ?? null,
      metadata: parsed?.metadata ?? null,
      errorMessage: parsed?.message ?? null,
      errorDetails: parsed?.details ?? null,
      requestBodySent: body,
      rawTextIfParseFailed: json ? null : text.slice(0, 2000),
    });
  } catch (error) {
    return jsonWithCors(
      origin,
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

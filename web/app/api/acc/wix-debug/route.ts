import type { NextRequest } from "next/server";
import { jsonWithCors, preflightResponse } from "@/lib/cors";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic endpoint: calls Wix's Orders Search once (page 1,
 * then page 2 using whatever cursor page 1 returns) and dumps the raw
 * response shape, so we can see the real pagination field names instead
 * of guessing against blocked docs. Safe to remove once the real sync
 * (lib/wix.ts) is confirmed working — this makes no writes.
 */
export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const apiKey = process.env.WIX_API_KEY;
  const siteId = process.env.WIX_SITE_ID;
  const since = process.env.WIX_SYNC_SINCE ?? process.env.SALES_DATA_SINCE ?? "2025-03-01";

  if (!apiKey || !siteId) {
    return jsonWithCors(origin, { error: "WIX_API_KEY / WIX_SITE_ID が設定されていません" }, { status: 400 });
  }

  try {
    const page1Body = {
      filter: { createdDate: { $gte: since } },
      sort: [{ fieldName: "createdDate", order: "ASC" }],
      cursorPaging: { limit: 5 },
    };

    const page1Res = await fetch("https://www.wixapis.com/ecom/v1/orders/search", {
      method: "POST",
      headers: { Authorization: apiKey, "wix-site-id": siteId, "Content-Type": "application/json" },
      body: JSON.stringify(page1Body),
    });
    const page1Text = await page1Res.text();
    let page1Json: unknown = null;
    try {
      page1Json = JSON.parse(page1Text);
    } catch {
      // leave as null, we'll return the raw text instead
    }

    const page1 = page1Json as {
      orders?: Array<{ number?: string; createdDate?: string }>;
      metadata?: unknown;
      pagingMetadata?: unknown;
      [key: string]: unknown;
    } | null;

    let page2Summary: unknown = null;
    const cursorCandidates = [
      (page1?.metadata as { cursors?: { next?: string } } | undefined)?.cursors?.next,
      (page1?.pagingMetadata as { cursors?: { next?: string } } | undefined)?.cursors?.next,
    ].filter(Boolean);
    const cursor = cursorCandidates[0] as string | undefined;

    if (cursor) {
      const page2Body = {
        filter: { createdDate: { $gte: since } },
        sort: [{ fieldName: "createdDate", order: "ASC" }],
        cursorPaging: { cursor, limit: 5 },
      };
      const page2Res = await fetch("https://www.wixapis.com/ecom/v1/orders/search", {
        method: "POST",
        headers: { Authorization: apiKey, "wix-site-id": siteId, "Content-Type": "application/json" },
        body: JSON.stringify(page2Body),
      });
      const page2Json = await page2Res.json().catch(() => null);
      page2Summary = {
        status: page2Res.status,
        firstOrderNumber: page2Json?.orders?.[0]?.number ?? null,
        orderCount: page2Json?.orders?.length ?? null,
        rawKeys: page2Json ? Object.keys(page2Json) : null,
        metadata: page2Json?.metadata ?? null,
        pagingMetadata: page2Json?.pagingMetadata ?? null,
      };
    }

    return jsonWithCors(origin, {
      page1Status: page1Res.status,
      page1RawKeys: page1 ? Object.keys(page1) : null,
      page1OrderCount: page1?.orders?.length ?? null,
      page1FirstOrderNumber: page1?.orders?.[0]?.number ?? null,
      page1LastOrderNumber: page1?.orders?.at(-1)?.number ?? null,
      page1Metadata: page1?.metadata ?? null,
      page1PagingMetadata: page1?.pagingMetadata ?? null,
      cursorFound: cursor ?? null,
      page2Summary,
      rawTextIfParseFailed: page1Json ? null : page1Text.slice(0, 2000),
    });
  } catch (error) {
    return jsonWithCors(
      origin,
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

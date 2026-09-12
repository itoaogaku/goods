import type { NextRequest } from "next/server";
import { queryAllEvents } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger, SALE_EVENT_TYPES } from "@/lib/ledger";

export const dynamic = "force-dynamic";
// A growing ledger can take a while to fully page through — give this
// route the same headroom as the Wix sync instead of the platform default.
export const maxDuration = 60;

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

// Full (unpaginated) worklist of orders still marked 未発送 — oldest first,
// since those are the most overdue. No date floor: an old unshipped order
// shouldn't silently fall out of view once it's older than SALES_DATA_SINCE.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ledger: string }> }
) {
  const origin = request.headers.get("origin");
  const { ledger } = await context.params;

  if (!isLedger(ledger)) {
    return jsonWithCors(origin, { error: "不明な台帳です" }, { status: 404 });
  }

  try {
    const records = await queryAllEvents(ledger, {
      status: "未発送",
      eventTypes: SALE_EVENT_TYPES,
    });
    return jsonWithCors(origin, { records });
  } catch (error) {
    console.error("Failed to fetch pending shipments", error);
    return jsonWithCors(origin, { error: "未発送一覧の取得に失敗しました" }, { status: 500 });
  }
}

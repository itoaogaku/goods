import type { NextRequest } from "next/server";
import { queryAllEvents } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

// Full (unpaginated) list of 発注 rows — used by the purchase-order panel,
// which needs to see every open PO at once, not a page at a time.
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
    const records = await queryAllEvents(ledger, { eventTypes: ["発注"] });
    return jsonWithCors(origin, { records: records.reverse() });
  } catch (error) {
    console.error("Failed to fetch purchase orders", error);
    return jsonWithCors(origin, { error: "発注一覧の取得に失敗しました" }, { status: 500 });
  }
}

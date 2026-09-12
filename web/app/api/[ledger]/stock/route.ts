import type { NextRequest } from "next/server";
import { computeStockBalances } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";
// A growing ledger can take a while to fully page through — give this
// route the same headroom as the Wix sync instead of the platform default.
export const maxDuration = 60;

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

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
    const balances = await computeStockBalances(ledger);
    return jsonWithCors(origin, { balances });
  } catch (error) {
    console.error("Failed to compute stock balances", error);
    return jsonWithCors(origin, { error: "在庫状況の取得に失敗しました" }, { status: 500 });
  }
}

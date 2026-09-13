import type { NextRequest } from "next/server";
import { queryAllEvents } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

// Every 種別=経費 row — both hand-entered (経費登録 tab) and the
// procurement cost attached to a 在庫登録 (see /api/[ledger]/stock-in).
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
    const records = await queryAllEvents(ledger, { eventTypes: ["経費"] });
    const total = records.reduce((sum, record) => sum + record.totalAmount, 0);

    return jsonWithCors(origin, {
      records: [...records].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      total,
    });
  } catch (error) {
    console.error("Failed to fetch expenses", error);
    return jsonWithCors(
      origin,
      {
        error: "経費一覧の取得に失敗しました",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

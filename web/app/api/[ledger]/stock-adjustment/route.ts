import type { NextRequest } from "next/server";
import { createEvent } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger, LEDGER_CONFIG } from "@/lib/ledger";
import { generateLineId, generateTransactionId } from "@/lib/ids";
import type { Location } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

interface StockAdjustmentBody {
  productName?: string;
  occurredAt?: string;
  location?: Location;
  quantity?: number;
  memo?: string;
}

// 在庫調整(このルート)は棚卸調整とは別物 — 実際の在庫数(現在庫の拠点別・
// 合計列)には一切反映されず、現在庫の「在庫調整」という専用の列に
// プラスマイナスとして積み上がるだけの、独立した記録。売上・経費にも
// 影響しない(単価は常に0)。
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ledger: string }> }
) {
  const origin = request.headers.get("origin");
  const { ledger } = await context.params;

  if (!isLedger(ledger)) {
    return jsonWithCors(origin, { error: "不明な台帳です" }, { status: 404 });
  }

  const config = LEDGER_CONFIG[ledger];
  const body = (await request.json().catch(() => null)) as StockAdjustmentBody | null;

  const productName = body?.productName?.trim();
  const occurredAt = body?.occurredAt?.trim();
  const location = body?.location ?? (config.locations.length === 1 ? config.locations[0] : undefined);
  const quantity = body?.quantity;

  if (!productName) return jsonWithCors(origin, { error: "商品名は必須です" }, { status: 400 });
  if (!occurredAt) return jsonWithCors(origin, { error: "日時は必須です" }, { status: 400 });
  if (!location || !config.locations.includes(location)) {
    return jsonWithCors(origin, { error: "拠点を指定してください" }, { status: 400 });
  }
  if (quantity === undefined || !Number.isFinite(quantity) || quantity === 0) {
    return jsonWithCors(origin, { error: "増減数を指定してください（0以外）" }, { status: 400 });
  }

  try {
    await createEvent(ledger, {
      transactionId: generateTransactionId("STOCKADJ", occurredAt),
      lineId: generateLineId("stockadj"),
      eventType: "在庫調整",
      occurredAt,
      location,
      productName,
      quantity,
      unitPrice: 0,
      memo: body?.memo ?? "",
      status: "発送済",
    });

    return jsonWithCors(origin, { ok: true });
  } catch (error) {
    console.error("Failed to register stock adjustment", error);
    return jsonWithCors(origin, { error: "在庫調整の登録に失敗しました" }, { status: 500 });
  }
}

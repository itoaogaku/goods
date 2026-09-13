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

interface StockInBody {
  productName?: string;
  occurredAt?: string;
  quantities?: Partial<Record<Location, number>>;
  /** Total amount paid for this stock-in — recorded as its own 経費 row, not split per unit/location. */
  purchaseAmount?: number;
  memo?: string;
}

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
  const body = (await request.json().catch(() => null)) as StockInBody | null;

  const productName = body?.productName?.trim();
  const occurredAt = body?.occurredAt?.trim();
  const quantities = body?.quantities;

  if (!productName) {
    return jsonWithCors(origin, { error: "商品名は必須です" }, { status: 400 });
  }
  if (!occurredAt) {
    return jsonWithCors(origin, { error: "日時は必須です" }, { status: 400 });
  }
  if (!quantities || typeof quantities !== "object") {
    return jsonWithCors(origin, { error: "拠点ごとの数量を指定してください" }, { status: 400 });
  }

  const entries = Object.entries(quantities).filter(
    (entry): entry is [Location, number] =>
      config.locations.includes(entry[0] as Location) &&
      typeof entry[1] === "number" &&
      Number.isFinite(entry[1]) &&
      entry[1] > 0
  );

  if (entries.length === 0) {
    return jsonWithCors(
      origin,
      { error: "1つ以上の拠点に、0より大きい数量を入力してください" },
      { status: 400 }
    );
  }

  const purchaseAmount = body?.purchaseAmount;
  if (purchaseAmount !== undefined && (!Number.isFinite(purchaseAmount) || purchaseAmount < 0)) {
    return jsonWithCors(origin, { error: "仕入れ金額は0以上を指定してください" }, { status: 400 });
  }

  const transactionId = generateTransactionId("STOCK", occurredAt);

  try {
    for (const [location, quantity] of entries) {
      await createEvent(ledger, {
        transactionId,
        lineId: generateLineId(`stockin_${location}`),
        eventType: "入庫",
        occurredAt,
        location,
        productName,
        quantity,
        unitPrice: 0,
        memo: body?.memo ?? "",
        status: "発送済",
      });
    }

    // Purchase cost is recorded as its own 経費 row (quantity 1, unitPrice =
    // the full amount) rather than split across the 入庫 rows above — the
    // amount paid for a batch doesn't divide evenly by unit in general, and
    // this avoids rounding it across possibly multiple locations.
    if (purchaseAmount && purchaseAmount > 0) {
      await createEvent(ledger, {
        transactionId,
        lineId: generateLineId("stockin_expense"),
        eventType: "経費",
        occurredAt,
        location: config.locations[0],
        productName,
        quantity: 1,
        unitPrice: purchaseAmount,
        memo: body?.memo ? `仕入れ: ${body.memo}` : "仕入れ",
        status: "発送済",
      });
    }

    return jsonWithCors(origin, { transactionId, created: entries.length });
  } catch (error) {
    console.error("Failed to register stock-in", error);
    return jsonWithCors(origin, { error: "在庫登録に失敗しました" }, { status: 500 });
  }
}

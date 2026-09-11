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

interface PurchaseOrderBody {
  productName?: string;
  occurredAt?: string;
  quantity?: number;
  unitPrice?: number;
  location?: Location;
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
  const body = (await request.json().catch(() => null)) as PurchaseOrderBody | null;

  const productName = body?.productName?.trim();
  const occurredAt = body?.occurredAt?.trim();
  const quantity = body?.quantity;
  const unitPrice = body?.unitPrice ?? 0;
  const location = body?.location ?? (config.locations.length === 1 ? config.locations[0] : undefined);

  if (!productName) return jsonWithCors(origin, { error: "商品名は必須です" }, { status: 400 });
  if (!occurredAt) return jsonWithCors(origin, { error: "発注日は必須です" }, { status: 400 });
  if (!quantity || !Number.isFinite(quantity) || quantity <= 0) {
    return jsonWithCors(origin, { error: "発注数量は1以上を指定してください" }, { status: 400 });
  }
  if (unitPrice < 0) {
    return jsonWithCors(origin, { error: "仕入単価は0以上を指定してください" }, { status: 400 });
  }
  if (!location || !config.locations.includes(location)) {
    return jsonWithCors(origin, { error: "納品予定拠点を指定してください" }, { status: 400 });
  }

  try {
    await createEvent(ledger, {
      transactionId: generateTransactionId("PO", occurredAt),
      lineId: generateLineId("po"),
      eventType: "発注",
      occurredAt,
      location,
      productName,
      quantity,
      unitPrice,
      poStatus: "発注済み",
      receivedQuantity: 0,
      memo: body?.memo ?? "",
      status: "発送済",
    });

    return jsonWithCors(origin, { ok: true });
  } catch (error) {
    console.error("Failed to register purchase order", error);
    return jsonWithCors(origin, { error: "発注の登録に失敗しました" }, { status: 500 });
  }
}

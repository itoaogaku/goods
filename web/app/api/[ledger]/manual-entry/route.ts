import type { NextRequest } from "next/server";
import { createEvent } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger, LEDGER_CONFIG, MANUAL_ENTRY_EVENT_TYPES } from "@/lib/ledger";
import { generateLineId, generateTransactionId } from "@/lib/ids";
import type { EventType, Location, OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_STATUSES: OrderStatus[] = ["未発送", "発送済", "キャンセル", "返金"];

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

interface ManualEntryBody {
  productName?: string;
  occurredAt?: string;
  location?: Location;
  eventType?: EventType;
  quantity?: number;
  unitPrice?: number;
  memo?: string;
  status?: OrderStatus;
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
  const body = (await request.json().catch(() => null)) as ManualEntryBody | null;

  const productName = body?.productName?.trim();
  const occurredAt = body?.occurredAt?.trim();
  const location = body?.location ?? (config.locations.length === 1 ? config.locations[0] : undefined);
  const eventType = body?.eventType;
  const quantity = body?.quantity;
  const unitPrice = body?.unitPrice ?? 0;
  const status = body?.status && VALID_STATUSES.includes(body.status) ? body.status : "発送済";

  if (!productName) return jsonWithCors(origin, { error: "商品名は必須です" }, { status: 400 });
  if (!occurredAt) return jsonWithCors(origin, { error: "日時は必須です" }, { status: 400 });
  if (!location || !config.locations.includes(location)) {
    return jsonWithCors(origin, { error: "拠点を指定してください" }, { status: 400 });
  }
  if (!eventType || !MANUAL_ENTRY_EVENT_TYPES.includes(eventType)) {
    return jsonWithCors(origin, { error: "種別が不正です" }, { status: 400 });
  }
  if (quantity === undefined || !Number.isFinite(quantity) || quantity === 0) {
    return jsonWithCors(origin, { error: "数量を指定してください" }, { status: 400 });
  }
  if (eventType !== "棚卸調整" && quantity < 0) {
    return jsonWithCors(origin, { error: "この種別では数量は正の数を指定してください" }, { status: 400 });
  }
  if (unitPrice < 0) {
    return jsonWithCors(origin, { error: "単価は0以上を指定してください" }, { status: 400 });
  }

  try {
    await createEvent(ledger, {
      transactionId: generateTransactionId("MANUAL", occurredAt),
      lineId: generateLineId("manual"),
      eventType,
      occurredAt,
      location,
      productName,
      quantity,
      unitPrice,
      memo: body?.memo ?? "",
      status,
    });

    return jsonWithCors(origin, { ok: true });
  } catch (error) {
    console.error("Failed to register manual entry", error);
    return jsonWithCors(origin, { error: "登録に失敗しました" }, { status: 500 });
  }
}

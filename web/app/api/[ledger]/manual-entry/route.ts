import type { NextRequest } from "next/server";
import { createEvent } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger, LEDGER_CONFIG, manualEntryEventTypes } from "@/lib/ledger";
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
  customerName?: string;
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
  if (!eventType || !manualEntryEventTypes(ledger).includes(eventType)) {
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

  const transactionId = generateTransactionId("MANUAL", occurredAt);

  try {
    await createEvent(ledger, {
      transactionId,
      lineId: generateLineId("manual"),
      eventType,
      occurredAt,
      location,
      productName,
      quantity,
      unitPrice,
      memo: body?.memo ?? "",
      status,
      customerName: body?.customerName?.trim() ?? "",
    });

    // ACCが陸上部卸しを記録したら、陸上部側の在庫・仕入れ費用にも自動で
    // 反映する — これまでは陸上部側の入庫を別途手入力してもらっていたが、
    // 同じ取引IDで両台帳に書き込むことで手入力を不要にする。単価は常に0の
    // 入庫として記録し、支払った金額(単価×数量)は在庫登録の仕入れ金額と
    // 同じ扱いで経費として別行に記録する(stock-inルートと同じパターン)。
    // 2つのNotionデータベースにまたがる書き込みなので、ACC側の記録が
    // 成功した後に陸上部側だけ失敗する可能性がある — その場合もACC側の
    // 記録自体は既に成功しているので処理は継続し、警告を返す。
    let trackTeamSyncWarning: string | undefined;
    if (ledger === "acc" && eventType === "陸上部卸し") {
      try {
        const trackTeamConfig = LEDGER_CONFIG.trackteam;
        await createEvent("trackteam", {
          transactionId,
          lineId: generateLineId("wholesale_stockin"),
          eventType: "入庫",
          occurredAt,
          location: trackTeamConfig.locations[0],
          productName,
          quantity,
          unitPrice: 0,
          memo: "ACCからの仕入れ",
          status: "発送済",
        });

        const purchaseAmount = unitPrice * quantity;
        if (purchaseAmount > 0) {
          await createEvent("trackteam", {
            transactionId,
            lineId: generateLineId("wholesale_expense"),
            eventType: "経費",
            occurredAt,
            location: trackTeamConfig.locations[0],
            productName,
            quantity: 1,
            unitPrice: purchaseAmount,
            memo: "ACCからの仕入れ",
            status: "発送済",
          });
        }
      } catch (syncError) {
        console.error("Failed to sync 陸上部卸し to trackteam ledger", syncError);
        trackTeamSyncWarning =
          "ACC側は登録できましたが、陸上部側への自動反映に失敗しました。陸上部の「在庫登録」から手動で入庫を記録してください。";
      }
    }

    return jsonWithCors(origin, { ok: true, warning: trackTeamSyncWarning });
  } catch (error) {
    console.error("Failed to register manual entry", error);
    return jsonWithCors(origin, { error: "登録に失敗しました" }, { status: 500 });
  }
}

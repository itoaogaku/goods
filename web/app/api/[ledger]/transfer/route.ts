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

interface TransferBody {
  productName?: string;
  occurredAt?: string;
  from?: Location;
  to?: Location;
  quantity?: number;
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
  if (!config.allowTransfer) {
    return jsonWithCors(
      origin,
      { error: `${config.shortLabel}は拠点間移動に対応していません` },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => null)) as TransferBody | null;
  const productName = body?.productName?.trim();
  const occurredAt = body?.occurredAt?.trim();
  const { from, to, quantity } = body ?? {};

  if (!productName) return jsonWithCors(origin, { error: "商品名は必須です" }, { status: 400 });
  if (!occurredAt) return jsonWithCors(origin, { error: "日時は必須です" }, { status: 400 });
  if (!from || !config.locations.includes(from)) {
    return jsonWithCors(origin, { error: "移動元の拠点が不正です" }, { status: 400 });
  }
  if (!to || !config.locations.includes(to)) {
    return jsonWithCors(origin, { error: "移動先の拠点が不正です" }, { status: 400 });
  }
  if (from === to) {
    return jsonWithCors(origin, { error: "移動元と移動先は異なる拠点を指定してください" }, { status: 400 });
  }
  if (!quantity || !Number.isFinite(quantity) || quantity <= 0) {
    return jsonWithCors(origin, { error: "数量は1以上を指定してください" }, { status: 400 });
  }

  try {
    await createEvent(ledger, {
      transactionId: generateTransactionId("TRANSFER", occurredAt),
      lineId: generateLineId("transfer"),
      eventType: "拠点間移動",
      occurredAt,
      location: from,
      destinationLocation: to,
      productName,
      quantity,
      unitPrice: 0,
      memo: body?.memo ?? "",
      status: "発送済",
    });

    return jsonWithCors(origin, { ok: true });
  } catch (error) {
    console.error("Failed to register transfer", error);
    return jsonWithCors(origin, { error: "拠点間移動の登録に失敗しました" }, { status: 500 });
  }
}

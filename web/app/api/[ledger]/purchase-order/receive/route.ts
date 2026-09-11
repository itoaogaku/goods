import type { NextRequest } from "next/server";
import { receivePurchaseOrder } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger, LEDGER_CONFIG } from "@/lib/ledger";
import type { Location } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

interface ReceiveBody {
  pageId?: string;
  receivedQuantity?: number;
  location?: Location;
  occurredAt?: string;
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
  const body = (await request.json().catch(() => null)) as ReceiveBody | null;

  const pageId = body?.pageId;
  const receivedQuantity = body?.receivedQuantity;
  const occurredAt = body?.occurredAt?.trim();
  const location = body?.location ?? (config.locations.length === 1 ? config.locations[0] : undefined);

  if (!pageId) return jsonWithCors(origin, { error: "対象の発注を指定してください" }, { status: 400 });
  if (!occurredAt) return jsonWithCors(origin, { error: "納品日は必須です" }, { status: 400 });
  if (!receivedQuantity || !Number.isFinite(receivedQuantity) || receivedQuantity <= 0) {
    return jsonWithCors(origin, { error: "納品数量は1以上を指定してください" }, { status: 400 });
  }
  if (!location || !config.locations.includes(location)) {
    return jsonWithCors(origin, { error: "納品先の拠点を指定してください" }, { status: 400 });
  }

  try {
    const updated = await receivePurchaseOrder(ledger, {
      pageId,
      receivedQuantity,
      location,
      occurredAt,
    });
    return jsonWithCors(origin, { ok: true, poStatus: updated.poStatus, receivedQuantity: updated.receivedQuantity });
  } catch (error) {
    console.error("Failed to receive purchase order", error);
    return jsonWithCors(
      origin,
      { error: error instanceof Error ? error.message : "納品登録に失敗しました" },
      { status: 500 }
    );
  }
}

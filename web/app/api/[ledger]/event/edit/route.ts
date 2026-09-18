import type { NextRequest } from "next/server";
import { editEventLine } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

interface EditBody {
  pageId?: string;
  productName?: string;
  quantity?: number;
  unitPrice?: number;
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

  const body = (await request.json().catch(() => null)) as EditBody | null;
  const pageId = body?.pageId;
  const productName = body?.productName?.trim();
  const quantity = body?.quantity;
  const unitPrice = body?.unitPrice;
  const memo = body?.memo ?? "";

  if (!pageId) return jsonWithCors(origin, { error: "対象の取引を指定してください" }, { status: 400 });
  if (!productName) return jsonWithCors(origin, { error: "商品名を入力してください" }, { status: 400 });
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0) {
    return jsonWithCors(origin, { error: "数量が不正です" }, { status: 400 });
  }
  if (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return jsonWithCors(origin, { error: "単価が不正です" }, { status: 400 });
  }

  try {
    await editEventLine(ledger, pageId, { productName, quantity, unitPrice, memo });
    return jsonWithCors(origin, { ok: true });
  } catch (error) {
    console.error("Failed to edit event", error);
    return jsonWithCors(
      origin,
      { error: error instanceof Error ? error.message : "取引の編集に失敗しました" },
      { status: 500 }
    );
  }
}

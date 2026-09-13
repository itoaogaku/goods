import type { NextRequest } from "next/server";
import { createEvent } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger, LEDGER_CONFIG } from "@/lib/ledger";
import { generateLineId, generateTransactionId } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

interface ExpenseBody {
  category?: string;
  occurredAt?: string;
  amount?: number;
  memo?: string;
}

// General business expenses (rent, supplies, ...) — not tied to a product
// or stock movement. See lib/wix.ts and stock-in for the other expense
// path, 仕入れ費用 attached directly to a 入庫 (stock-in) event.
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
  const body = (await request.json().catch(() => null)) as ExpenseBody | null;

  const category = body?.category?.trim();
  const occurredAt = body?.occurredAt?.trim();
  const amount = body?.amount;

  if (!category) return jsonWithCors(origin, { error: "経費の内容を入力してください" }, { status: 400 });
  if (!occurredAt) return jsonWithCors(origin, { error: "日時は必須です" }, { status: 400 });
  if (amount === undefined || !Number.isFinite(amount) || amount <= 0) {
    return jsonWithCors(origin, { error: "金額を指定してください" }, { status: 400 });
  }

  try {
    await createEvent(ledger, {
      transactionId: generateTransactionId("EXPENSE", occurredAt),
      lineId: generateLineId("expense"),
      eventType: "経費",
      occurredAt,
      location: config.locations[0],
      productName: category,
      quantity: 1,
      unitPrice: amount,
      memo: body?.memo ?? "",
      status: "発送済",
    });

    return jsonWithCors(origin, { ok: true });
  } catch (error) {
    console.error("Failed to register expense", error);
    return jsonWithCors(origin, { error: "経費の登録に失敗しました" }, { status: 500 });
  }
}

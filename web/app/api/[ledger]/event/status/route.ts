import type { NextRequest } from "next/server";
import { updateEventStatus } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger } from "@/lib/ledger";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_STATUSES: OrderStatus[] = ["未発送", "発送済", "キャンセル", "返金"];

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

interface StatusBody {
  pageId?: string;
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

  const body = (await request.json().catch(() => null)) as StatusBody | null;
  const pageId = body?.pageId;
  const status = body?.status;

  if (!pageId) return jsonWithCors(origin, { error: "対象の取引を指定してください" }, { status: 400 });
  if (!status || !VALID_STATUSES.includes(status)) {
    return jsonWithCors(origin, { error: "ステータスが不正です" }, { status: 400 });
  }

  try {
    await updateEventStatus(ledger, pageId, status);
    return jsonWithCors(origin, { ok: true });
  } catch (error) {
    console.error("Failed to update status", error);
    return jsonWithCors(origin, { error: "ステータスの更新に失敗しました" }, { status: 500 });
  }
}

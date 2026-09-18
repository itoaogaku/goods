import type { NextRequest } from "next/server";
import { revertEventLine } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

interface RevertBody {
  pageId?: string;
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

  const body = (await request.json().catch(() => null)) as RevertBody | null;
  const pageId = body?.pageId;
  if (!pageId) return jsonWithCors(origin, { error: "対象の取引を指定してください" }, { status: 400 });

  try {
    await revertEventLine(ledger, pageId);
    return jsonWithCors(origin, { ok: true });
  } catch (error) {
    console.error("Failed to revert event", error);
    return jsonWithCors(
      origin,
      { error: error instanceof Error ? error.message : "元に戻す処理に失敗しました" },
      { status: 500 }
    );
  }
}

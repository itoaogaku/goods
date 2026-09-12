import type { NextRequest } from "next/server";
import { archiveDuplicates, previewDuplicates } from "@/lib/dedupe";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

// GET: read-only preview — how many duplicate 明細ID groups exist.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ledger: string }> }
) {
  const origin = request.headers.get("origin");
  const { ledger } = await context.params;

  if (!isLedger(ledger)) {
    return jsonWithCors(origin, { error: "不明な台帳です" }, { status: 404 });
  }

  try {
    const preview = await previewDuplicates(ledger);
    return jsonWithCors(origin, preview);
  } catch (error) {
    console.error("Failed to preview duplicates", error);
    return jsonWithCors(origin, { error: "重複データの確認に失敗しました" }, { status: 500 });
  }
}

// POST: actually archives duplicates (keeping the oldest page per 明細ID).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ledger: string }> }
) {
  const origin = request.headers.get("origin");
  const { ledger } = await context.params;

  if (!isLedger(ledger)) {
    return jsonWithCors(origin, { error: "不明な台帳です" }, { status: 404 });
  }

  try {
    const result = await archiveDuplicates(ledger);
    return jsonWithCors(origin, result);
  } catch (error) {
    console.error("Failed to archive duplicates", error);
    return jsonWithCors(origin, { error: "重複データの削除に失敗しました" }, { status: 500 });
  }
}

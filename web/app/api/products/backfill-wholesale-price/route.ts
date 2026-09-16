import type { NextRequest } from "next/server";
import { backfillWholesalePrices } from "@/lib/notion-products";
import { jsonWithCors, preflightResponse } from "@/lib/cors";

export const dynamic = "force-dynamic";
// A large price list can take a while to page through and write back one
// row at a time (paced to stay under Notion's rate limit) — give this the
// same headroom as the other bulk-write routes.
export const maxDuration = 60;

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

// 陸上部卸値が空欄の行だけを対象に定価の13%オフで一括入力する。既に値が
// 入っている行(手入力済み・過去の実行分含む)には触れないので、時間切れ
// で途中で終わっても再度押せば続きから埋まる。
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const filled = await backfillWholesalePrices();
    return jsonWithCors(origin, { filled });
  } catch (error) {
    console.error("Failed to backfill wholesale prices", error);
    return jsonWithCors(
      origin,
      {
        error: "陸上部卸値の一括入力に失敗しました",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

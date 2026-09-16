import type { NextRequest } from "next/server";
import { updateProductPrices } from "@/lib/notion-products";
import { jsonWithCors, preflightResponse } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

interface UpdateBody {
  pageId?: string;
  costPrice?: number | null;
  insiderPrice?: number | null;
  wholesalePrice?: number | null;
  coopWholesalePrice?: number | null;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  const pageId = body?.pageId;

  if (!pageId) return jsonWithCors(origin, { error: "対象の商品を指定してください" }, { status: 400 });

  try {
    await updateProductPrices(pageId, {
      costPrice: body?.costPrice,
      insiderPrice: body?.insiderPrice,
      wholesalePrice: body?.wholesalePrice,
      coopWholesalePrice: body?.coopWholesalePrice,
    });
    return jsonWithCors(origin, { ok: true });
  } catch (error) {
    console.error("Failed to update product prices", error);
    return jsonWithCors(
      origin,
      {
        error: "価格の更新に失敗しました",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

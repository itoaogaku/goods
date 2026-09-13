import type { NextRequest } from "next/server";
import { listProducts } from "@/lib/notion-products";
import { jsonWithCors, preflightResponse } from "@/lib/cors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const products = await listProducts();
    return jsonWithCors(origin, { products });
  } catch (error) {
    console.error("Failed to list products", error);
    return jsonWithCors(
      origin,
      {
        error: "料金表の取得に失敗しました",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

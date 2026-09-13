import type { NextRequest } from "next/server";
import { syncWixProducts } from "@/lib/product-sync";
import { jsonWithCors, preflightResponse } from "@/lib/cors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

async function handle(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const result = await syncWixProducts();
    return jsonWithCors(origin, result);
  } catch (error) {
    console.error("Wix product sync failed", error);
    return jsonWithCors(
      origin,
      {
        error: "Wix商品との同期に失敗しました",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET is available for a future Vercel Cron entry; POST is what the
// dashboard's "Wixと同期" button calls. Both run the exact same sync.
export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

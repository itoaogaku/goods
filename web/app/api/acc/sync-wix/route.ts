import type { NextRequest } from "next/server";
import { syncWixOrders } from "@/lib/wix-sync";
import { jsonWithCors, preflightResponse } from "@/lib/cors";

export const dynamic = "force-dynamic";
// Wix order sync can touch many rows on a cold run; give it more headroom
// than the platform default before the function is killed.
export const maxDuration = 60;

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

async function handle(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const result = await syncWixOrders();
    return jsonWithCors(origin, result);
  } catch (error) {
    console.error("Wix sync failed", error);
    return jsonWithCors(
      origin,
      { error: error instanceof Error ? error.message : "Wixとの同期に失敗しました" },
      { status: 500 }
    );
  }
}

// GET is what Vercel Cron invokes on schedule; POST is what the dashboard's
// "Wixと同期" button calls. Both run the exact same sync.
export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

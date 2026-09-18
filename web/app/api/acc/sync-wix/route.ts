import { NextResponse, type NextRequest } from "next/server";
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
//
// GET is excluded from proxy.ts's app-wide Basic Auth (Cron requests
// don't carry those credentials), so it verifies CRON_SECRET here instead —
// Vercel automatically sends "Authorization: Bearer <CRON_SECRET>" on cron
// requests once that env var is set. Skipped (as before) if CRON_SECRET
// isn't configured, so this keeps working without extra setup.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

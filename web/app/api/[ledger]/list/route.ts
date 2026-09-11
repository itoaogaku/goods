import type { NextRequest } from "next/server";
import { queryEventsPage } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { EVENT_TYPES, isLedger, LEDGER_CONFIG } from "@/lib/ledger";
import type { EventType, Location, OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_STATUSES: OrderStatus[] = ["未発送", "発送済", "キャンセル", "返金"];

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ledger: string }> }
) {
  const origin = request.headers.get("origin");
  const { ledger } = await context.params;

  if (!isLedger(ledger)) {
    return jsonWithCors(origin, { error: "不明な台帳です" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;

  const cursor = searchParams.get("cursor") ?? undefined;
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;
  const search = searchParams.get("search") ?? undefined;

  const statusParam = searchParams.get("status");
  const status =
    statusParam && VALID_STATUSES.includes(statusParam as OrderStatus)
      ? (statusParam as OrderStatus)
      : undefined;

  const eventTypeParam = searchParams.get("eventType");
  const eventTypes =
    eventTypeParam && EVENT_TYPES.includes(eventTypeParam as EventType)
      ? [eventTypeParam as EventType]
      : undefined;

  const locationParam = searchParams.get("location");
  const location =
    locationParam && LEDGER_CONFIG[ledger].locations.includes(locationParam as Location)
      ? (locationParam as Location)
      : undefined;

  const pageSizeParam = Number(searchParams.get("pageSize"));
  const pageSize =
    Number.isFinite(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= 100
      ? pageSizeParam
      : 25;

  try {
    const result = await queryEventsPage(ledger, {
      cursor,
      dateFrom,
      dateTo,
      status,
      search,
      eventTypes,
      location,
      pageSize,
    });
    return jsonWithCors(origin, result);
  } catch (error) {
    console.error("Failed to fetch event list", error);
    return jsonWithCors(origin, { error: "データ一覧の取得に失敗しました" }, { status: 500 });
  }
}

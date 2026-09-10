import type { NextRequest } from "next/server";
import { querySalesPage } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_STATUSES: OrderStatus[] = ["未発送", "発送済", "キャンセル", "返金"];

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
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

  const pageSizeParam = Number(searchParams.get("pageSize"));
  const pageSize =
    Number.isFinite(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= 100
      ? pageSizeParam
      : 25;

  try {
    const result = await querySalesPage({
      cursor,
      dateFrom,
      dateTo,
      status,
      search,
      pageSize,
    });
    return jsonWithCors(origin, result);
  } catch (error) {
    console.error("Failed to fetch sales list", error);
    return jsonWithCors(
      origin,
      { error: "販売データ一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}

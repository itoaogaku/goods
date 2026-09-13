import type { NextRequest } from "next/server";
import { queryAllEvents, SALES_DATA_SINCE } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger, SALE_EVENT_TYPES } from "@/lib/ledger";
import type { MonthlyStat, ProductRankingEntry, SalesSummary } from "@/lib/types";

export const dynamic = "force-dynamic";
// A growing ledger can take a while to fully page through — give this
// route the same headroom as the Wix sync instead of the platform default.
export const maxDuration = 60;

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

  try {
    // 送料・経費・入庫 rows are fetched in the same query as the sale types
    // so this doesn't cost a second full scan, but are tracked as their own
    // KPIs instead of folding into product revenue/ranking/quantity — see
    // the branches below. 入庫's own 単価 (cost per unit, entered on the
    // 在庫登録 form) counts toward expenseTotal alongside dedicated 経費 rows.
    const records = await queryAllEvents(ledger, {
      dateFrom: SALES_DATA_SINCE,
      eventTypes: [...SALE_EVENT_TYPES, "送料", "経費", "入庫"],
    });

    const monthlyMap = new Map<string, MonthlyStat>();
    const productMap = new Map<string, ProductRankingEntry>();
    let cumulativeRevenue = 0;
    let totalQuantity = 0;
    let pendingCount = 0;
    let shippingRevenue = 0;
    let expenseTotal = 0;

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let currentMonthRevenue = 0;

    for (const record of records) {
      if (record.eventType === "送料") {
        shippingRevenue += record.totalAmount;
        continue;
      }
      if (record.eventType === "経費" || record.eventType === "入庫") {
        expenseTotal += record.totalAmount;
        continue;
      }

      const month = record.occurredAt.slice(0, 7); // "YYYY-MM"

      const monthEntry = monthlyMap.get(month) ?? { month, revenue: 0, quantity: 0 };
      monthEntry.revenue += record.totalAmount;
      monthEntry.quantity += record.quantity;
      monthlyMap.set(month, monthEntry);

      const productEntry = productMap.get(record.productName) ?? {
        productName: record.productName,
        quantity: 0,
        revenue: 0,
      };
      productEntry.quantity += record.quantity;
      productEntry.revenue += record.totalAmount;
      productMap.set(record.productName, productEntry);

      cumulativeRevenue += record.totalAmount;
      totalQuantity += record.quantity;
      if (record.status === "未発送") pendingCount += 1;
      if (month === currentMonthKey) currentMonthRevenue += record.totalAmount;
    }

    const summary: SalesSummary = {
      rangeStart: SALES_DATA_SINCE,
      generatedAt: new Date().toISOString(),
      kpi: {
        currentMonthRevenue,
        cumulativeRevenue,
        totalQuantity,
        pendingCount,
        shippingRevenue,
        expenseTotal,
        netProfit: cumulativeRevenue + shippingRevenue - expenseTotal,
      },
      monthlyStats: [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
      productRanking: [...productMap.values()].sort((a, b) => b.quantity - a.quantity),
    };

    return jsonWithCors(origin, summary);
  } catch (error) {
    console.error("Failed to build sales summary", error);
    return jsonWithCors(
      origin,
      {
        error: "売上サマリーの取得に失敗しました",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

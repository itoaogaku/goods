import type { NextRequest } from "next/server";
import { queryAllSales, SALES_DATA_SINCE } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import type { MonthlyStat, ProductRankingEntry, SalesSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    const records = await queryAllSales();

    const monthlyMap = new Map<string, MonthlyStat>();
    const productMap = new Map<string, ProductRankingEntry>();
    let cumulativeRevenue = 0;
    let totalQuantity = 0;
    let pendingCount = 0;

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let currentMonthRevenue = 0;

    for (const record of records) {
      const month = record.soldAt.slice(0, 7); // "YYYY-MM"

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
      },
      monthlyStats: [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
      productRanking: [...productMap.values()].sort((a, b) => b.quantity - a.quantity),
    };

    return jsonWithCors(origin, summary);
  } catch (error) {
    console.error("Failed to build sales summary", error);
    return jsonWithCors(
      origin,
      { error: "売上サマリーの取得に失敗しました" },
      { status: 500 }
    );
  }
}

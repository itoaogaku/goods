import type { NextRequest } from "next/server";
import { computeStockBalances, queryAllEvents, SALES_DATA_SINCE } from "@/lib/notion";
import { listProducts } from "@/lib/notion-products";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger, scopeEventTypes, SALE_EVENT_TYPES } from "@/lib/ledger";
import { compareProductNames, isTestProduct } from "@/lib/utils";
import type {
  AnalyticsResponse,
  ProductProfitability,
  RevenueBreakdownEntry,
  StockTurnoverEntry,
} from "@/lib/types";

export const dynamic = "force-dynamic";
// A growing ledger can take a while to fully page through — give this
// route the same headroom as the Wix sync instead of the platform default.
export const maxDuration = 60;

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

// 在庫回転率（あと何日で売り切れそうか）の目安は、選んだ期間に関わらず
// 直近のペースで見るのが実用的なので、常に直近90日固定で計算する。
const TURNOVER_WINDOW_DAYS = 90;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ledger: string }> }
) {
  const origin = request.headers.get("origin");
  const { ledger } = await context.params;

  if (!isLedger(ledger)) {
    return jsonWithCors(origin, { error: "不明な台帳です" }, { status: 404 });
  }

  const from = request.nextUrl.searchParams.get("from") || undefined;
  const to = request.nextUrl.searchParams.get("to") || undefined;
  const rangeStart = from ?? SALES_DATA_SINCE;

  try {
    const turnoverSince = new Date();
    turnoverSince.setDate(turnoverSince.getDate() - TURNOVER_WINDOW_DAYS);
    const turnoverSinceStr = turnoverSince.toISOString().slice(0, 10);

    const saleEventTypes = scopeEventTypes(ledger, SALE_EVENT_TYPES);
    const [rangeEvents, recentEvents, balances, products] = await Promise.all([
      queryAllEvents(ledger, { dateFrom: rangeStart, dateTo: to, eventTypes: saleEventTypes }),
      queryAllEvents(ledger, { dateFrom: turnoverSinceStr, eventTypes: saleEventTypes }),
      computeStockBalances(ledger),
      listProducts(),
    ]);

    const isUsable = (e: { status: string; productName: string }) =>
      e.status !== "キャンセル" && !isTestProduct(e.productName);

    // 商品別の利益率分析
    const costByProduct = new Map(products.map((p) => [p.productName, p.costPrice]));
    const profitAgg = new Map<string, { quantitySold: number; revenue: number }>();
    for (const e of rangeEvents) {
      if (!isUsable(e)) continue;
      const agg = profitAgg.get(e.productName) ?? { quantitySold: 0, revenue: 0 };
      agg.quantitySold += e.quantity;
      agg.revenue += e.totalAmount;
      profitAgg.set(e.productName, agg);
    }
    const productProfitability: ProductProfitability[] = [...profitAgg.entries()]
      .map(([productName, { quantitySold, revenue }]) => {
        const unitCost = costByProduct.get(productName) ?? null;
        const totalCost = unitCost !== null ? unitCost * quantitySold : null;
        const profit = totalCost !== null ? revenue - totalCost : null;
        const marginPercent = profit !== null && revenue > 0 ? (profit / revenue) * 100 : null;
        return { productName, quantitySold, revenue, unitCost, totalCost, profit, marginPercent };
      })
      .sort((a, b) => b.revenue - a.revenue);

    // 拠点別・種別ごとの売上構成
    function aggregateBy(keyOf: (e: (typeof rangeEvents)[number]) => string): RevenueBreakdownEntry[] {
      const agg = new Map<string, { revenue: number; quantity: number }>();
      for (const e of rangeEvents) {
        if (!isUsable(e)) continue;
        const key = keyOf(e);
        const entry = agg.get(key) ?? { revenue: 0, quantity: 0 };
        entry.revenue += e.totalAmount;
        entry.quantity += e.quantity;
        agg.set(key, entry);
      }
      return [...agg.entries()]
        .map(([label, v]) => ({ label, ...v }))
        .sort((a, b) => b.revenue - a.revenue);
    }
    const revenueByLocation = aggregateBy((e) => e.location);
    const revenueByEventType = aggregateBy((e) => e.eventType);

    // 在庫の推移・回転率分析（常に直近90日のペースで算出）
    const soldRecentByProduct = new Map<string, number>();
    for (const e of recentEvents) {
      if (!isUsable(e)) continue;
      soldRecentByProduct.set(e.productName, (soldRecentByProduct.get(e.productName) ?? 0) + e.quantity);
    }
    const stockByProduct = new Map<string, number>();
    for (const b of balances) {
      if (isTestProduct(b.productName)) continue;
      stockByProduct.set(b.productName, (stockByProduct.get(b.productName) ?? 0) + b.quantity);
    }
    const allProductNames = new Set([...stockByProduct.keys(), ...soldRecentByProduct.keys()]);
    const stockTurnover: StockTurnoverEntry[] = [...allProductNames]
      .map((productName) => {
        const currentStock = stockByProduct.get(productName) ?? 0;
        const soldInWindow = soldRecentByProduct.get(productName) ?? 0;
        const dailyRate = soldInWindow / TURNOVER_WINDOW_DAYS;
        const avgMonthlySold = Math.round(dailyRate * 30 * 10) / 10;
        const estimatedDaysRemaining =
          dailyRate > 0 && currentStock > 0 ? Math.round(currentStock / dailyRate) : null;
        return { productName, currentStock, avgMonthlySold, estimatedDaysRemaining };
      })
      .sort((a, b) => {
        // 売り切れが近い（残り日数が少ない）商品を上に。直近販売なし・在庫
        // なしの商品（null）は下にまとめ、その中は商品名順にする。
        if (a.estimatedDaysRemaining === null && b.estimatedDaysRemaining === null) {
          return compareProductNames(a.productName, b.productName);
        }
        if (a.estimatedDaysRemaining === null) return 1;
        if (b.estimatedDaysRemaining === null) return -1;
        return a.estimatedDaysRemaining - b.estimatedDaysRemaining;
      });

    const response: AnalyticsResponse = {
      rangeStart,
      rangeEnd: to ?? null,
      productProfitability,
      revenueByLocation,
      revenueByEventType,
      stockTurnover,
    };

    return jsonWithCors(origin, response);
  } catch (error) {
    console.error("Failed to build analytics", error);
    return jsonWithCors(
      origin,
      {
        error: "分析データの取得に失敗しました",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

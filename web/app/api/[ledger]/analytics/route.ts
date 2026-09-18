import type { NextRequest } from "next/server";
import { computeStockBalances, queryAllEvents, SALES_DATA_SINCE } from "@/lib/notion";
import { listProducts } from "@/lib/notion-products";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger, LEDGER_CONFIG, scopeEventTypes, SALE_EVENT_TYPES } from "@/lib/ledger";
import { compareProductNames, isTestProduct } from "@/lib/utils";
import type {
  AnalyticsResponse,
  EventType,
  Location,
  LocationSalesBreakdown,
  ProductProfitability,
  RevenueBreakdownEntry,
  StockReconciliationEntry,
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
    const [rangeEvents, recentEvents, allSaleEvents, balances, products] = await Promise.all([
      queryAllEvents(ledger, { dateFrom: rangeStart, dateTo: to, eventTypes: saleEventTypes }),
      queryAllEvents(ledger, { dateFrom: turnoverSinceStr, eventTypes: saleEventTypes }),
      // 在庫・売上確認表は期間絞り込みに関わらず常に全期間の累計で確認する。
      queryAllEvents(ledger, { eventTypes: saleEventTypes }),
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
      // 利益率が高い順（ランキング）。原価未入力で利益率が出せない商品は
      // 末尾にまとめ、その中は売上順にする。
      .sort((a, b) => {
        if (a.marginPercent === null && b.marginPercent === null) return b.revenue - a.revenue;
        if (a.marginPercent === null) return 1;
        if (b.marginPercent === null) return -1;
        return b.marginPercent - a.marginPercent;
      });

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

    // 在庫・売上確認表（仕入れ数＋棚卸調整－全拠点の販売数－全拠点の在庫数が
    // 0になっているかの確認）。拠点が1つしかない台帳では意味を持たないので
    // 空配列のままにする。
    const config = LEDGER_CONFIG[ledger];
    let stockReconciliation: StockReconciliationEntry[] = [];
    if (config.locations.length > 1) {
      const balancesByProduct = new Map<string, Map<Location, (typeof balances)[number]>>();
      for (const b of balances) {
        if (isTestProduct(b.productName)) continue;
        const byLocation = balancesByProduct.get(b.productName) ?? new Map();
        byLocation.set(b.location, b);
        balancesByProduct.set(b.productName, byLocation);
      }

      const salesByProduct = new Map<string, Map<Location, Map<EventType, { quantity: number; amount: number }>>>();
      for (const e of allSaleEvents) {
        if (!isUsable(e)) continue;
        const byLocation = salesByProduct.get(e.productName) ?? new Map();
        const byType = byLocation.get(e.location) ?? new Map();
        const agg = byType.get(e.eventType) ?? { quantity: 0, amount: 0 };
        agg.quantity += e.quantity;
        agg.amount += e.totalAmount;
        byType.set(e.eventType, agg);
        byLocation.set(e.location, byType);
        salesByProduct.set(e.productName, byLocation);
      }

      const productNames = new Set([...balancesByProduct.keys(), ...salesByProduct.keys()]);

      stockReconciliation = [...productNames]
        .map((productName) => {
          const balByLocation = balancesByProduct.get(productName);
          const salesByLocation = salesByProduct.get(productName);

          let purchasedQuantity = 0;
          let adjustmentQuantity = 0;
          let totalStock = 0;
          let totalSalesQuantity = 0;

          const locations: LocationSalesBreakdown[] = config.locations.map((location) => {
            const bal = balByLocation?.get(location);
            purchasedQuantity += bal?.purchasedQuantity ?? 0;
            adjustmentQuantity += bal?.adjustmentQuantity ?? 0;
            const stock = bal?.quantity ?? 0;
            totalStock += stock;

            const typeAgg = salesByLocation?.get(location);
            const breakdown = saleEventTypes.map((eventType) => {
              const agg = typeAgg?.get(eventType) ?? { quantity: 0, amount: 0 };
              return { eventType, quantity: agg.quantity, amount: agg.amount };
            });
            const totalQuantity = breakdown.reduce((sum, b) => sum + b.quantity, 0);
            const totalAmount = breakdown.reduce((sum, b) => sum + b.amount, 0);
            totalSalesQuantity += totalQuantity;

            return { location, breakdown, totalQuantity, totalAmount, stock };
          });

          const discrepancy = purchasedQuantity + adjustmentQuantity - totalSalesQuantity - totalStock;

          return { productName, purchasedQuantity, adjustmentQuantity, locations, discrepancy };
        })
        // ズレがある商品を先頭にまとめ、その中・ズレが無いものはそれぞれ商品名順。
        .sort((a, b) => {
          const aBad = a.discrepancy !== 0;
          const bBad = b.discrepancy !== 0;
          if (aBad !== bBad) return aBad ? -1 : 1;
          return compareProductNames(a.productName, b.productName);
        });
    }

    const response: AnalyticsResponse = {
      rangeStart,
      rangeEnd: to ?? null,
      productProfitability,
      revenueByLocation,
      revenueByEventType,
      stockTurnover,
      stockReconciliation,
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

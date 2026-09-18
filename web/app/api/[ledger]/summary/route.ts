import type { NextRequest } from "next/server";
import { queryAllEvents, SALES_DATA_SINCE } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger, scopeEventTypes, SALE_EVENT_TYPES } from "@/lib/ledger";
import { isTestProduct } from "@/lib/utils";
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

  // Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD to scope every figure below
  // (KPIs, monthly chart, product ranking) to a chosen period instead of
  // the full history since SALES_DATA_SINCE — see DateRangeFilter.
  const from = request.nextUrl.searchParams.get("from") || undefined;
  const to = request.nextUrl.searchParams.get("to") || undefined;
  const rangeStart = from ?? SALES_DATA_SINCE;

  try {
    // 送料・経費 rows are fetched in the same query as the sale types so
    // this doesn't cost a second full scan, but are tracked as their own
    // KPIs instead of folding into product revenue/ranking/quantity — see
    // the branches below. A stock-in's purchase cost is recorded as its own
    // 経費 row (see /api/[ledger]/stock-in), so this single event type
    // covers both hand-entered expenses and procurement cost.
    // 未対応注文数（pendingCount）は発送管理パネル（/api/[ledger]/pending-shipments）
    // と同じ「日付の絞り込み無し・取引ID単位」で数える別クエリにし、
    // 選んだ表示期間に関わらず常にそのパネルの件数と一致するようにする。
    const [records, pendingRecords] = await Promise.all([
      queryAllEvents(ledger, {
        dateFrom: rangeStart,
        dateTo: to,
        eventTypes: scopeEventTypes(ledger, [...SALE_EVENT_TYPES, "送料", "経費"]),
      }),
      queryAllEvents(ledger, {
        status: "未発送",
        eventTypes: scopeEventTypes(ledger, SALE_EVENT_TYPES),
      }),
    ]);
    const pendingCount = new Set(
      pendingRecords.filter((r) => !isTestProduct(r.productName)).map((r) => r.transactionId)
    ).size;

    const monthlyMap = new Map<string, MonthlyStat>();
    const productMap = new Map<string, ProductRankingEntry>();
    let cumulativeRevenue = 0;
    let totalQuantity = 0;
    let shippingRevenue = 0;
    let expenseTotal = 0;

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let currentMonthRevenue = 0;

    for (const record of records) {
      // キャンセルされた取引は実際には成立していないので売上・経費に含めない。
      if (record.status === "キャンセル") continue;
      // Wixの決済動作確認用の「〜テスト」商品は実売上ではないので除外する。
      if (isTestProduct(record.productName)) continue;

      if (record.eventType === "送料") {
        shippingRevenue += record.totalAmount;
        continue;
      }
      if (record.eventType === "経費") {
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
      if (month === currentMonthKey) currentMonthRevenue += record.totalAmount;
    }

    const summary: SalesSummary = {
      rangeStart,
      rangeEnd: to ?? null,
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

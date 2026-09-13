import type { NextRequest } from "next/server";
import { queryAllEvents } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger, SALE_EVENT_TYPES } from "@/lib/ledger";
import type { CustomerMatrixResponse, CustomerMatrixRow } from "@/lib/types";

export const dynamic = "force-dynamic";
// A growing ledger can take a while to fully page through — give this
// route the same headroom as the Wix sync instead of the platform default.
export const maxDuration = 60;

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

// One row per order (取引ID) or per 入庫 (stock-in) event, one column per
// distinct product. 送料 rows fold into shippingRevenue instead of becoming
// a "product" column. Each product cell also carries a running stock
// balance, so no separate date window: the whole ledger history is read
// (like /api/[ledger]/stock does) so that balance starts from a true zero
// rather than from an arbitrary cutoff. Balances are summed across all
// locations — see the per-location breakdown on the 現在庫 table for that.
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
    // queryAllEvents sorts ascending by occurredAt — required here so the
    // running balance below accumulates in the order things actually happened.
    const records = await queryAllEvents(ledger, {
      eventTypes: [...SALE_EVENT_TYPES, "送料", "入庫"],
    });

    const rowsByTransaction = new Map<string, CustomerMatrixRow>();
    const columnSet = new Set<string>();
    const runningBalance = new Map<string, number>();

    for (const record of records) {
      let row = rowsByTransaction.get(record.transactionId);
      if (!row) {
        row = {
          transactionId: record.transactionId,
          customerName: record.customerName,
          orderDate: record.occurredAt,
          isStockIn: record.eventType === "入庫",
          products: {},
          productRevenue: 0,
          shippingRevenue: 0,
          total: 0,
          memo: record.memo,
        };
        rowsByTransaction.set(record.transactionId, row);
      }
      if (!row.customerName && record.customerName) row.customerName = record.customerName;
      if (record.occurredAt < row.orderDate) row.orderDate = record.occurredAt;

      if (record.eventType === "送料") {
        row.shippingRevenue += record.totalAmount;
      } else if (record.eventType === "入庫") {
        const delta = record.quantity;
        const balance = (runningBalance.get(record.productName) ?? 0) + delta;
        runningBalance.set(record.productName, balance);
        const cell = row.products[record.productName];
        row.products[record.productName] = { delta: (cell?.delta ?? 0) + delta, balance };
        columnSet.add(record.productName);
      } else {
        const delta = -record.quantity;
        const balance = (runningBalance.get(record.productName) ?? 0) + delta;
        runningBalance.set(record.productName, balance);
        const cell = row.products[record.productName];
        row.products[record.productName] = { delta: (cell?.delta ?? 0) + delta, balance };
        row.productRevenue += record.totalAmount;
        columnSet.add(record.productName);
      }
      row.total = row.productRevenue + row.shippingRevenue;
    }

    const response: CustomerMatrixResponse = {
      columns: [...columnSet].sort((a, b) => a.localeCompare(b, "ja")),
      // Newest first for display; the running balance above was already
      // computed in chronological order before this reverses it.
      rows: [...rowsByTransaction.values()].sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    };

    return jsonWithCors(origin, response);
  } catch (error) {
    console.error("Failed to build customer matrix", error);
    return jsonWithCors(
      origin,
      {
        error: "顧客別集計の取得に失敗しました",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

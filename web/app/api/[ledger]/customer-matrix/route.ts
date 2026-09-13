import type { NextRequest } from "next/server";
import { queryAllEvents, SALES_DATA_SINCE } from "@/lib/notion";
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

// One row per order (取引ID), one column per distinct product — the same
// event stream the transaction table and summary already use, just pivoted.
// 送料 rows fold into shippingRevenue instead of becoming a "product" column.
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
    const records = await queryAllEvents(ledger, {
      dateFrom: SALES_DATA_SINCE,
      eventTypes: [...SALE_EVENT_TYPES, "送料"],
    });

    const rowsByTransaction = new Map<string, CustomerMatrixRow>();
    const columnSet = new Set<string>();

    for (const record of records) {
      let row = rowsByTransaction.get(record.transactionId);
      if (!row) {
        row = {
          transactionId: record.transactionId,
          customerName: record.customerName,
          orderDate: record.occurredAt,
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
      } else {
        row.products[record.productName] = (row.products[record.productName] ?? 0) + record.quantity;
        row.productRevenue += record.totalAmount;
        columnSet.add(record.productName);
      }
      row.total = row.productRevenue + row.shippingRevenue;
    }

    const response: CustomerMatrixResponse = {
      columns: [...columnSet].sort((a, b) => a.localeCompare(b, "ja")),
      rows: [...rowsByTransaction.values()].sort((a, b) => a.orderDate.localeCompare(b.orderDate)),
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

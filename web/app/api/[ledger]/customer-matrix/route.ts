import type { NextRequest } from "next/server";
import { queryAllEvents } from "@/lib/notion";
import { jsonWithCors, preflightResponse } from "@/lib/cors";
import { isLedger, LEDGER_CONFIG, SALE_EVENT_TYPES } from "@/lib/ledger";
import { compareProductNames } from "@/lib/utils";
import type { CustomerMatrixResponse, CustomerMatrixRow, Location } from "@/lib/types";

export const dynamic = "force-dynamic";
// A growing ledger can take a while to fully page through — give this
// route the same headroom as the Wix sync instead of the platform default.
export const maxDuration = 60;

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request.headers.get("origin"));
}

// One row per order (取引ID), per 入庫 (stock-in), or per 拠点間移動 event
// that touches the requested location, one column per distinct product.
// 送料 rows fold into shippingRevenue instead of becoming a "product"
// column. Balances are scoped to a single location (?location=町田, say)
// — 水上村 and 町田 are tracked completely separately since almost every
// Wix order/stock-in happens at 水上村, and a combined total reads
// misleadingly like "all 町田 stock" when it's really almost all 水上村.
// No date window: the whole ledger history is read (like
// /api/[ledger]/stock does) so balance starts from a true zero.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ledger: string }> }
) {
  const origin = request.headers.get("origin");
  const { ledger } = await context.params;

  if (!isLedger(ledger)) {
    return jsonWithCors(origin, { error: "不明な台帳です" }, { status: 404 });
  }

  const config = LEDGER_CONFIG[ledger];
  const requestedLocation = request.nextUrl.searchParams.get("location");
  const location: Location = config.locations.includes(requestedLocation as Location)
    ? (requestedLocation as Location)
    : config.locations[0];

  try {
    // queryAllEvents sorts ascending by occurredAt — required here so the
    // running balance below accumulates in the order things actually
    // happened. 拠点間移動 has to be fetched too (not just filtered out by
    // Notion's own `location` query, which only matches the source side) so
    // both legs — losing stock at the source, gaining it at the destination
    // — can be evaluated against the requested location below.
    const records = await queryAllEvents(ledger, {
      eventTypes: [...SALE_EVENT_TYPES, "送料", "入庫", "拠点間移動"],
    });

    const rowsByTransaction = new Map<string, CustomerMatrixRow>();
    const columnSet = new Set<string>();
    const runningBalance = new Map<string, number>();
    // Latest 入庫(在庫追加) date per product, so columns can be ordered by
    // "most recently restocked first" instead of alphabetically.
    const lastStockInDate = new Map<string, string>();

    function touchRow(record: (typeof records)[number]) {
      let row = rowsByTransaction.get(record.transactionId);
      if (!row) {
        row = {
          transactionId: record.transactionId,
          customerName: record.customerName,
          orderDate: record.occurredAt,
          rowKind: record.eventType === "入庫" ? "stock-in" : record.eventType === "拠点間移動" ? "transfer" : "order",
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
      return row;
    }

    function applyDelta(row: CustomerMatrixRow, productName: string, delta: number) {
      const balance = (runningBalance.get(productName) ?? 0) + delta;
      runningBalance.set(productName, balance);
      const cell = row.products[productName];
      row.products[productName] = { delta: (cell?.delta ?? 0) + delta, balance };
      columnSet.add(productName);
    }

    for (const record of records) {
      if (record.eventType === "拠点間移動") {
        if (record.location === location) {
          applyDelta(touchRow(record), record.productName, -record.quantity);
        } else if (record.destinationLocation === location) {
          applyDelta(touchRow(record), record.productName, record.quantity);
        }
        continue;
      }

      if (record.location !== location) continue;

      if (record.eventType === "送料") {
        touchRow(record).shippingRevenue += record.totalAmount;
      } else if (record.eventType === "入庫") {
        applyDelta(touchRow(record), record.productName, record.quantity);
        const prevStockIn = lastStockInDate.get(record.productName);
        if (!prevStockIn || record.occurredAt > prevStockIn) {
          lastStockInDate.set(record.productName, record.occurredAt);
        }
      } else {
        const row = touchRow(record);
        applyDelta(row, record.productName, -record.quantity);
        row.productRevenue += record.totalAmount;
      }
    }

    for (const row of rowsByTransaction.values()) {
      row.total = row.productRevenue + row.shippingRevenue;
    }

    // Products restocked at least once come first, most-recently-restocked
    // first (same-date ties, e.g. every size of one color stocked in
    // together, fall back to compareProductNames so they stay grouped in
    // XL/L/M/S/XS order); products never stocked in through this system
    // fall to the end, sorted the same way among themselves.
    const columns = [...columnSet].sort((a, b) => {
      const dateA = lastStockInDate.get(a);
      const dateB = lastStockInDate.get(b);
      if (dateA && dateB) return dateB.localeCompare(dateA) || compareProductNames(a, b);
      if (dateA) return -1;
      if (dateB) return 1;
      return compareProductNames(a, b);
    });

    // Backfill every row's untouched columns with a 0-delta cell carrying
    // that product's balance as of this row — otherwise a "0" cell would
    // have no 残 to show, since only columns a row's own records touched
    // got an entry in the loop above. Requires walking rows chronologically
    // (oldest first) same as the balance calc itself, then the final
    // response reverses to newest-first for display.
    const chronologicalRows = [...rowsByTransaction.values()].sort((a, b) =>
      a.orderDate.localeCompare(b.orderDate)
    );
    const snapshotBalance = new Map<string, number>();
    for (const row of chronologicalRows) {
      for (const col of columns) {
        const existing = row.products[col];
        if (existing) {
          snapshotBalance.set(col, existing.balance);
        } else {
          row.products[col] = { delta: 0, balance: snapshotBalance.get(col) ?? 0 };
        }
      }
    }

    const response: CustomerMatrixResponse = {
      columns,
      rows: chronologicalRows.reverse(),
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

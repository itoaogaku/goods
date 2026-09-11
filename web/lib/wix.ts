import type { CreateEventInput } from "./notion";
import type { Location, OrderStatus } from "./types";

/**
 * Wix Velo backend code only runs inside the Wix site itself, so this app
 * can't "call into Velo". Instead it polls Wix's public eCommerce REST API
 * (Orders Search) on a schedule (see app/api/acc/sync-wix and vercel.json),
 * which is the closest thing to automatic sync available from outside Wix.
 * https://dev.wix.com/docs/rest/business-solutions/e-commerce/orders/orders/search-orders
 */

const WIX_ORDERS_SEARCH_URL = "https://www.wixapis.com/ecom/v1/orders/search";

// Fulfillment (発送/未発送) isn't tracked in Wix at all — it's managed
// entirely in this app instead (see the 発送管理 panel), so every synced
// order always starts as 未発送 regardless of what Wix's fulfillmentStatus
// says. paymentStatus is still a real Wix-side fact worth carrying over,
// since a canceled/refunded order shouldn't sit in the "to ship" queue.
const PAYMENT_STATUS_MAP: Record<string, OrderStatus> = {
  CANCELED: "キャンセル",
  CANCELLED: "キャンセル",
  REFUNDED: "返金",
  PARTIALLY_REFUNDED: "返金",
};

function normalizeStatus(paymentStatus: string | undefined | null): OrderStatus {
  if (!paymentStatus) return "未発送";
  return PAYMENT_STATUS_MAP[paymentStatus.trim().toUpperCase()] ?? "未発送";
}

interface WixOrderLineItem {
  productName?: { original?: string };
  quantity?: number;
  price?: { amount?: string };
}

interface WixOrder {
  number: string;
  createdDate: string;
  paymentStatus?: string;
  lineItems?: WixOrderLineItem[];
}

interface WixOrdersSearchResponse {
  orders: WixOrder[];
  metadata?: { cursors?: { next?: string } };
}

export interface WixSyncOptions {
  apiKey: string;
  siteId: string;
  since: string; // ISO date, inclusive
  location: Location;
}

async function fetchOrdersPage(
  options: WixSyncOptions,
  cursor?: string
): Promise<WixOrdersSearchResponse> {
  const body = cursor
    ? { cursorPaging: { cursor } }
    : {
        filter: { createdDate: { $gte: options.since } },
        sort: [{ fieldName: "createdDate", order: "ASC" }],
        cursorPaging: { limit: 100 },
      };

  const response = await fetch(WIX_ORDERS_SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: options.apiKey,
      "wix-site-id": options.siteId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Wix Orders API returned ${response.status}: ${text}`);
  }

  return (await response.json()) as WixOrdersSearchResponse;
}

/** Fetches every order line since options.since, shaped ready to hand to lib/notion's createEvent. */
export async function fetchWixOrderLines(options: WixSyncOptions): Promise<CreateEventInput[]> {
  const lines: CreateEventInput[] = [];
  let cursor: string | undefined;

  do {
    const page = await fetchOrdersPage(options, cursor);

    for (const order of page.orders) {
      const status = normalizeStatus(order.paymentStatus);
      (order.lineItems ?? []).forEach((item, index) => {
        const quantity = item.quantity ?? 0;
        const unitPrice = Number(item.price?.amount ?? 0);
        if (quantity <= 0) return;

        lines.push({
          transactionId: order.number,
          // Must match the {orderId}_{lineIndex} format the migration CLI
          // (migration/src/source-wix-api.ts, source-csv.ts) uses, so a
          // historically-migrated order line and this sync's view of the
          // same line dedup against each other instead of double-counting.
          lineId: `${order.number}_${index + 1}`,
          eventType: "通常販売",
          occurredAt: order.createdDate,
          location: options.location,
          productName: item.productName?.original ?? "(商品名不明)",
          quantity,
          unitPrice,
          status,
        });
      });
    }

    cursor = page.metadata?.cursors?.next;
  } while (cursor);

  return lines;
}

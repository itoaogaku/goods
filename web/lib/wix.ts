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

// 発送済み/未発送 is read straight from Wix's own fulfillmentStatus, so
// marking an order fulfilled in Wix is reflected here on the next sync
// (this module's fetchWixOrderLines is re-fetched and diffed against
// Notion on every run — see lib/wix-sync.ts). paymentStatus is checked
// too, since cancellation/refund is a fact fulfillmentStatus alone won't
// carry, and should take priority over a raw fulfillment claim.
const FULFILLMENT_STATUS_MAP: Record<string, OrderStatus> = {
  FULFILLED: "発送済",
  "FULLY FULFILLED": "発送済",
  NOT_FULFILLED: "未発送",
  UNFULFILLED: "未発送",
  PARTIALLY_FULFILLED: "未発送",
};

const PAYMENT_STATUS_MAP: Record<string, OrderStatus> = {
  CANCELED: "キャンセル",
  CANCELLED: "キャンセル",
  REFUNDED: "返金",
  PARTIALLY_REFUNDED: "返金",
};

function normalizeStatus(
  fulfillmentStatus: string | undefined | null,
  paymentStatus: string | undefined | null
): OrderStatus {
  const fromPayment = paymentStatus ? PAYMENT_STATUS_MAP[paymentStatus.trim().toUpperCase()] : undefined;
  if (fromPayment) return fromPayment;

  const fromFulfillment = fulfillmentStatus
    ? FULFILLMENT_STATUS_MAP[fulfillmentStatus.trim().toUpperCase()]
    : undefined;
  return fromFulfillment ?? "未発送";
}

interface WixOrderLineItem {
  productName?: { original?: string };
  quantity?: number;
  price?: { amount?: string };
}

interface WixOrder {
  number: string;
  createdDate: string;
  fulfillmentStatus?: string;
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
  // Per @wix/auto_sdk_ecom_orders's SearchOrdersRequest type, the whole
  // query must be nested under a top-level "search" object — filter/sort/
  // cursorPaging at the request's top level (what this used to send) are
  // silently ignored by Wix, which just falls back to its own default
  // paging (a fixed page of ~25, always starting over), regardless of any
  // cursor passed. That's what made every "next page" request quietly
  // re-run page 1 and produced the massive duplicate counts seen in
  // production — nothing to do with the pagination loop logic itself.
  const body = {
    search: {
      filter: { createdDate: { $gte: options.since } },
      sort: [{ fieldName: "createdDate", order: "ASC" }],
      cursorPaging: cursor ? { cursor, limit: 100 } : { limit: 100 },
    },
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

function toCreateEventInputs(page: WixOrdersSearchResponse, options: WixSyncOptions): CreateEventInput[] {
  const lines: CreateEventInput[] = [];

  for (const order of page.orders) {
    const status = normalizeStatus(order.fulfillmentStatus, order.paymentStatus);
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

  return lines;
}

/**
 * Yields order lines one Wix API page at a time (up to 100 orders' worth
 * per page), instead of fetching every page since `since` up front. A
 * years-long order history can be thousands of orders — fetching it all
 * before doing anything else risks the whole sync running past the
 * serverless function's time limit before a single Notion write happens.
 * The caller (lib/wix-sync.ts) can act on and time-box each page as it
 * arrives, and stop asking for more once its own deadline is close.
 */
// Hard circuit breaker against a pagination bug (ours or Wix's) looping
// forever: at 100 orders/page this is 100,000 orders, far beyond any
// plausible order history, so hitting it always means something's wrong
// rather than "there's just a lot of real data".
const MAX_PAGES = 1000;

export async function* iterateWixOrderLines(
  options: WixSyncOptions
): AsyncGenerator<CreateEventInput[]> {
  let cursor: string | undefined;
  let previousFirstOrderNumber: string | undefined;
  let pageCount = 0;

  do {
    pageCount += 1;
    if (pageCount > MAX_PAGES) {
      throw new Error(
        `Wix注文の取得が${MAX_PAGES}ページを超えたため中断しました（ページネーションが正しく進んでいない可能性があります）`
      );
    }

    const page = await fetchOrdersPage(options, cursor);

    // Defensive check: if this page's content is identical to the last
    // one's (same first order), pagination isn't actually advancing —
    // stop here instead of reprocessing (and re-creating) the same
    // orders indefinitely.
    const firstOrderNumber = page.orders[0]?.number;
    if (firstOrderNumber && firstOrderNumber === previousFirstOrderNumber) {
      break;
    }
    previousFirstOrderNumber = firstOrderNumber;

    yield toCreateEventInputs(page, options);
    cursor = page.metadata?.cursors?.next;
  } while (cursor);
}

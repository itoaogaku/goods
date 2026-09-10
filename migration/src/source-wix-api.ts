import { normalizeStatus } from "./status.js";
import type { OrderLine } from "./types.js";

/**
 * Wix Velo backend code only runs inside the Wix site itself, so an external
 * Node.js script can't "call into Velo" directly. The closest external
 * equivalent is Wix's public eCommerce REST API (Orders Search), which is
 * what this module uses. Requires an API key with Orders read access and
 * the site ID, both from the Wix developer/business dashboard.
 * https://dev.wix.com/docs/rest/business-solutions/e-commerce/orders/orders/search-orders
 */

const WIX_ORDERS_SEARCH_URL = "https://www.wixapis.com/ecom/v1/orders/search";

interface WixOrderLineItem {
  productName?: { original?: string };
  quantity?: number;
  price?: { amount?: string };
}

interface WixOrder {
  id: string;
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

export interface WixApiOptions {
  apiKey: string;
  siteId: string;
  since: string; // ISO date, inclusive
}

async function fetchOrdersPage(
  options: WixApiOptions,
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

export async function fetchWixOrders(options: WixApiOptions): Promise<OrderLine[]> {
  const lines: OrderLine[] = [];
  let cursor: string | undefined;

  do {
    const page = await fetchOrdersPage(options, cursor);

    for (const order of page.orders) {
      const status = normalizeStatus(order.fulfillmentStatus ?? order.paymentStatus);
      (order.lineItems ?? []).forEach((item, index) => {
        const quantity = item.quantity ?? 0;
        const unitPrice = Number(item.price?.amount ?? 0);
        if (quantity <= 0) return;

        lines.push({
          orderId: order.number,
          lineId: `${order.number}_${index + 1}`,
          soldAt: order.createdDate,
          productName: item.productName?.original ?? "(商品名不明)",
          quantity,
          unitPrice,
          totalAmount: quantity * unitPrice,
          status,
        });
      });
    }

    cursor = page.metadata?.cursors?.next;
  } while (cursor);

  return lines;
}

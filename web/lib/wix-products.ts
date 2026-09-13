/**
 * Wix's Stores Catalog product-query endpoint. Confirmed via the
 * @wix/auto_sdk_stores_products type definitions (dev.wix.com was blocked
 * from this sandbox, same as for the Orders API — see lib/wix.ts): the
 * "query-platformized" REST path backs the SDK's queryProducts() builder.
 * The SDK's own TypeScript types rename the wire field to `_id`, but the
 * raw REST response (confirmed via a temporary debug endpoint) actually
 * sends it as plain `id` — using `_id` here silently matched nothing and
 * made every sync report zero products. priceData.price comes back as a
 * plain JSON number (not a string like Orders' price.amount), but Number()
 * on it is a harmless no-op either way.
 */
const WIX_PRODUCTS_QUERY_URL = "https://www.wixapis.com/stores-reader/v1/products/query-platformized";

const PAGE_LIMIT = 100; // PlatformPaging.limit's documented max.

interface WixProduct {
  id?: string;
  name?: string | null;
  priceData?: { price?: number | string | null };
}

interface WixProductsQueryResponse {
  products?: WixProduct[];
  metadata?: { total?: number | null };
}

export interface WixProductSyncOptions {
  apiKey: string;
  siteId: string;
}

export interface WixProductItem {
  wixProductId: string;
  name: string;
  listPrice: number;
}

async function fetchProductsPage(
  options: WixProductSyncOptions,
  offset: number
): Promise<WixProductsQueryResponse> {
  const body = { query: { paging: { limit: PAGE_LIMIT, offset } } };

  const response = await fetch(WIX_PRODUCTS_QUERY_URL, {
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
    throw new Error(`Wix Products API returned ${response.status}: ${text}`);
  }

  return (await response.json()) as WixProductsQueryResponse;
}

// A catalog with thousands of products is implausible for this shop; this
// guards against a pagination bug looping forever, same reasoning as
// lib/wix.ts's MAX_PAGES for orders.
const MAX_PAGES = 200;

export async function* iterateWixProducts(
  options: WixProductSyncOptions
): AsyncGenerator<WixProductItem[]> {
  let offset = 0;
  let pageCount = 0;

  while (true) {
    pageCount += 1;
    if (pageCount > MAX_PAGES) {
      throw new Error(`Wix商品の取得が${MAX_PAGES}ページを超えたため中断しました`);
    }

    const page = await fetchProductsPage(options, offset);
    const products = page.products ?? [];

    yield products
      .filter((p): p is WixProduct & { id: string } => !!p.id)
      .map((p) => ({
        wixProductId: p.id,
        name: p.name ?? "(商品名不明)",
        listPrice: Number(p.priceData?.price ?? 0),
      }));

    offset += products.length;
    const total = page.metadata?.total ?? undefined;
    if (products.length < PAGE_LIMIT || (total !== undefined && offset >= total)) break;
  }
}

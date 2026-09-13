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

interface WixVariant {
  // Same "id" (not "_id") pitfall as the product itself — this is the raw
  // wire field name, confirmed via the same debug endpoint.
  id?: string;
  /** Selected option/choice pairs, e.g. {"Color": "グリーン", "Size": "L"}. */
  choices?: Record<string, string>;
  variant?: { priceData?: { price?: number | string | null } };
}

interface WixProduct {
  id?: string;
  name?: string | null;
  priceData?: { price?: number | string | null };
  /** Present (non-empty) only when the product has manageVariants enabled. */
  variants?: WixVariant[];
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

/**
 * One product with manageVariants enabled (e.g. size/color chosen from a
 * dropdown on the product page, rather than separate product listings)
 * expands into one WixProductItem per variant — same 商品名 convention as
 * lib/wix.ts uses for order lines, so a sale and its matching price-list
 * row/stock-in entry read as the same product string. wixProductId for a
 * variant is `{productId}.{variantId}`, matching Wix's own "store variant
 * ID" format, so it stays stable even if the product is renamed.
 */
function toProductItems(product: WixProduct): WixProductItem[] {
  if (!product.id) return [];
  const variants = product.variants ?? [];

  if (variants.length === 0) {
    return [
      {
        wixProductId: product.id,
        name: product.name ?? "(商品名不明)",
        listPrice: Number(product.priceData?.price ?? 0),
      },
    ];
  }

  return variants
    .filter((v): v is WixVariant & { id: string } => !!v.id)
    .map((v) => {
      const suffix = Object.values(v.choices ?? {}).join(" / ");
      return {
        wixProductId: `${product.id}.${v.id}`,
        name: suffix ? `${product.name ?? "(商品名不明)"} / ${suffix}` : product.name ?? "(商品名不明)",
        listPrice: Number(v.variant?.priceData?.price ?? product.priceData?.price ?? 0),
      };
    });
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

    yield products.flatMap(toProductItems);

    offset += products.length;
    const total = page.metadata?.total ?? undefined;
    if (products.length < PAGE_LIMIT || (total !== undefined && offset >= total)) break;
  }
}

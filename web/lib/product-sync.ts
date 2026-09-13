import { createProduct, fetchExistingProducts, updateProductFromWix } from "./notion-products";
import { iterateWixProducts } from "./wix-products";

// Notion's documented rate limit is an average of ~3 requests/second (see
// lib/notion.ts's withNotionRetry) — pace writes the same way the Wix order
// sync does. A shop's product catalog is small (dozens, not thousands), so
// unlike order sync this isn't expected to need time-boxing across runs.
const WRITE_INTERVAL_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ProductSyncResult {
  checked: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Pulls the full Wix product catalog and mirrors 商品名/定価 into the
 * 料金表一覧 Notion database, keyed by Wix's product ID (stable even if the
 * product is renamed). Never touches 関係者価格/陸上部卸値 — those are
 * hand-entered in this app and have no Wix equivalent.
 */
export async function syncWixProducts(): Promise<ProductSyncResult> {
  const apiKey = process.env.WIX_API_KEY;
  const siteId = process.env.WIX_SITE_ID;
  if (!apiKey || !siteId) {
    throw new Error("WIX_API_KEY / WIX_SITE_ID が設定されていません");
  }

  const existing = await fetchExistingProducts();

  let checked = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for await (const page of iterateWixProducts({ apiKey, siteId })) {
    for (const item of page) {
      checked += 1;
      const found = existing.get(item.wixProductId);

      if (!found) {
        try {
          const pageId = await createProduct({
            wixProductId: item.wixProductId,
            productName: item.name,
            listPrice: item.listPrice,
          });
          created += 1;
          existing.set(item.wixProductId, {
            pageId,
            wixProductId: item.wixProductId,
            productName: item.name,
            listPrice: item.listPrice,
            costPrice: null,
            insiderPrice: null,
            wholesalePrice: null,
          });
        } catch (error) {
          errors.push(`${item.wixProductId}: ${error instanceof Error ? error.message : String(error)}`);
        }
        await sleep(WRITE_INTERVAL_MS);
        continue;
      }

      if (found.productName === item.name && found.listPrice === item.listPrice) {
        skipped += 1;
        continue;
      }
      try {
        await updateProductFromWix(found.pageId, { productName: item.name, listPrice: item.listPrice });
        updated += 1;
      } catch (error) {
        errors.push(`${item.wixProductId}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await sleep(WRITE_INTERVAL_MS);
    }
  }

  return { checked, created, updated, skipped, errors };
}

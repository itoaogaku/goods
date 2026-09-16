import {
  Client,
  collectAllDataSourceRows,
  isFullDatabase,
  isFullPage,
} from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { computeStockBalances, getNotionClient, withNotionRetry } from "./notion";
import { compareProductNames } from "./utils";
import type { ProductPriceEntry } from "./types";

/**
 * A single, shared "商品マスタ" (price list) database — not per-ledger like
 * the sales/inventory databases, since there's one Wix product catalog and
 * both ACC and 陸上部 care about the same list prices.
 */
let dataSourceIdCache: string | null = null;

async function getProductsDataSourceId(): Promise<string> {
  if (dataSourceIdCache) return dataSourceIdCache;

  const explicit = process.env.NOTION_PRODUCTS_DATA_SOURCE_ID;
  if (explicit) {
    dataSourceIdCache = explicit;
    return explicit;
  }

  const databaseId = process.env.NOTION_PRODUCTS_DATABASE_ID;
  if (!databaseId) {
    throw new Error("NOTION_PRODUCTS_DATABASE_ID (or NOTION_PRODUCTS_DATA_SOURCE_ID) is not set");
  }

  const notion = getNotionClient();
  const database = await withNotionRetry(() => notion.databases.retrieve({ database_id: databaseId }));
  if (!isFullDatabase(database)) {
    throw new Error(`Database ${databaseId} could not be fully retrieved`);
  }
  const dataSource = database.data_sources[0];
  if (!dataSource) {
    throw new Error(`Database ${databaseId} has no data sources`);
  }
  dataSourceIdCache = dataSource.id;
  return dataSourceIdCache;
}

type NotionProperty = PageObjectResponse["properties"][string];

function getPlainText(prop: NotionProperty | undefined): string {
  if (!prop) return "";
  if (prop.type === "title") return prop.title.map((t) => t.plain_text).join("");
  if (prop.type === "rich_text") return prop.rich_text.map((t) => t.plain_text).join("");
  return "";
}

function getNumber(prop: NotionProperty | undefined): number {
  if (!prop || prop.type !== "number" || prop.number === null) return 0;
  return prop.number;
}

function getNullableNumber(prop: NotionProperty | undefined): number | null {
  if (!prop || prop.type !== "number") return null;
  return prop.number;
}

function pageToProductPriceEntry(page: PageObjectResponse): ProductPriceEntry {
  const p = page.properties;
  return {
    pageId: page.id,
    wixProductId: getPlainText(p["WixプロダクトID"]),
    productName: getPlainText(p["商品名"]),
    listPrice: getNumber(p["定価"]),
    costPrice: getNullableNumber(p["原価"]),
    insiderPrice: getNullableNumber(p["関係者価格"]),
    wholesalePrice: getNullableNumber(p["陸上部卸値"]),
    coopWholesalePrice: getNullableNumber(p["購買会卸値"]),
  };
}

async function queryAllProducts(notion: Client): Promise<ProductPriceEntry[]> {
  const dataSourceId = await getProductsDataSourceId();
  const rows = await withNotionRetry(() => collectAllDataSourceRows(notion, { data_source_id: dataSourceId }));
  return rows.filter(isFullPage).map(pageToProductPriceEntry);
}

/**
 * All rows in the price list, for display in the 料金表一覧 tab (and the
 * 商品名 autocomplete used across both ledgers' forms) — ordered the same
 * way as 現在庫/顧客別集計: by each product's first-ever 在庫追加(入庫)
 * date (oldest left/top, a later repeat stock-in doesn't move it), products
 * never stocked in pushed to the end, ties broken by compareProductNames
 * (keeps XL/L/M/S/XS size variants grouped). The price list is shared across
 * both ledgers, but every product ultimately enters inventory via ACC (陸上部
 * only ever receives stock that already passed through ACC), so ACC's stock-in
 * history is used as the single source of truth for this ordering.
 */
export async function listProducts(): Promise<ProductPriceEntry[]> {
  const notion = getNotionClient();
  const [entries, balances] = await Promise.all([queryAllProducts(notion), computeStockBalances("acc")]);

  const firstStockInByProduct = new Map<string, string | null>();
  for (const b of balances) {
    if (!firstStockInByProduct.has(b.productName)) firstStockInByProduct.set(b.productName, b.firstStockInDate);
  }

  return entries.sort((a, b) => {
    const dateA = firstStockInByProduct.get(a.productName);
    const dateB = firstStockInByProduct.get(b.productName);
    if (dateA && dateB) return dateA.localeCompare(dateB) || compareProductNames(a.productName, b.productName);
    if (dateA) return -1;
    if (dateB) return 1;
    return compareProductNames(a.productName, b.productName);
  });
}

/** Every existing row indexed by Wix product ID, for the sync's create-vs-update decision. */
export async function fetchExistingProducts(): Promise<Map<string, ProductPriceEntry>> {
  const notion = getNotionClient();
  const entries = await queryAllProducts(notion);
  return new Map(entries.filter((e) => e.wixProductId).map((e) => [e.wixProductId, e]));
}

export interface CreateProductInput {
  wixProductId: string;
  productName: string;
  listPrice: number;
}

/** 陸上部卸値 defaults to 13% off 定価 unless hand-edited afterward — see WHOLESALE_DISCOUNT below. */
const WHOLESALE_DISCOUNT = 0.87;

/** 購買会卸値 defaults to 定価の90%（購買会が10%マージンを引いた額）unless hand-edited afterward. */
const COOP_WHOLESALE_DISCOUNT = 0.9;

/** Registers a Wix product not yet in the price list. 関係者価格 is left blank for manual entry; 陸上部卸値/購買会卸値 default to 定価からの割引. */
export async function createProduct(input: CreateProductInput): Promise<string> {
  const notion = getNotionClient();
  const dataSourceId = await getProductsDataSourceId();
  const page = await withNotionRetry(() =>
    notion.pages.create({
      parent: { data_source_id: dataSourceId },
      properties: {
        商品名: { title: [{ text: { content: input.productName } }] },
        定価: { number: input.listPrice },
        WixプロダクトID: { rich_text: [{ text: { content: input.wixProductId } }] },
        陸上部卸値: { number: Math.round(input.listPrice * WHOLESALE_DISCOUNT) },
        購買会卸値: { number: Math.round(input.listPrice * COOP_WHOLESALE_DISCOUNT) },
      },
    })
  );
  return page.id;
}

/** Keeps 商品名/定価 current when they change in Wix — does not touch 関係者価格/陸上部卸値. */
export async function updateProductFromWix(
  pageId: string,
  fields: { productName: string; listPrice: number }
): Promise<void> {
  const notion = getNotionClient();
  await withNotionRetry(() =>
    notion.pages.update({
      page_id: pageId,
      properties: {
        商品名: { title: [{ text: { content: fields.productName } }] },
        定価: { number: fields.listPrice },
      },
    })
  );
}

/** Manual edit from the 料金表一覧 UI — 原価・関係者価格・陸上部卸値・購買会卸値 only, whichever are provided. */
export async function updateProductPrices(
  pageId: string,
  fields: {
    costPrice?: number | null;
    insiderPrice?: number | null;
    wholesalePrice?: number | null;
    coopWholesalePrice?: number | null;
  }
): Promise<void> {
  const notion = getNotionClient();
  await withNotionRetry(() =>
    notion.pages.update({
      page_id: pageId,
      properties: {
        ...(fields.costPrice !== undefined ? { 原価: { number: fields.costPrice } } : {}),
        ...(fields.insiderPrice !== undefined ? { 関係者価格: { number: fields.insiderPrice } } : {}),
        ...(fields.wholesalePrice !== undefined ? { 陸上部卸値: { number: fields.wholesalePrice } } : {}),
        ...(fields.coopWholesalePrice !== undefined
          ? { 購買会卸値: { number: fields.coopWholesalePrice } }
          : {}),
      },
    })
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Notion's documented rate limit is an average of ~3 requests/second —
// paced the same as lib/wix-sync.ts's own bulk writes.
const BACKFILL_WRITE_INTERVAL_MS = 350;

/**
 * One-time catch-up for rows registered before 陸上部卸値/購買会卸値 had a
 * default — fills only whichever of the two is still blank on a given row,
 * to 定価からの割引. Never touches a value that's already set (hand-entered
 * or previously backfilled).
 */
export async function backfillWholesalePrices(): Promise<number> {
  const notion = getNotionClient();
  const entries = await queryAllProducts(notion);
  const targets = entries.filter((e) => e.wholesalePrice === null || e.coopWholesalePrice === null);

  for (const entry of targets) {
    await withNotionRetry(() =>
      notion.pages.update({
        page_id: entry.pageId,
        properties: {
          ...(entry.wholesalePrice === null
            ? { 陸上部卸値: { number: Math.round(entry.listPrice * WHOLESALE_DISCOUNT) } }
            : {}),
          ...(entry.coopWholesalePrice === null
            ? { 購買会卸値: { number: Math.round(entry.listPrice * COOP_WHOLESALE_DISCOUNT) } }
            : {}),
        },
      })
    );
    await sleep(BACKFILL_WRITE_INTERVAL_MS);
  }

  return targets.length;
}

import {
  Client,
  collectAllDataSourceRows,
  isFullDatabase,
  isFullPage,
} from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { getNotionClient, withNotionRetry } from "./notion";
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
  };
}

async function queryAllProducts(notion: Client): Promise<ProductPriceEntry[]> {
  const dataSourceId = await getProductsDataSourceId();
  const rows = await withNotionRetry(() => collectAllDataSourceRows(notion, { data_source_id: dataSourceId }));
  return rows.filter(isFullPage).map(pageToProductPriceEntry);
}

/** All rows in the price list, for display in the 料金表一覧 tab. */
export async function listProducts(): Promise<ProductPriceEntry[]> {
  const notion = getNotionClient();
  const entries = await queryAllProducts(notion);
  return entries.sort((a, b) => a.productName.localeCompare(b.productName, "ja"));
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

/** Registers a Wix product not yet in the price list. 関係者価格/陸上部卸値 are left blank for manual entry. */
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

/** Manual edit from the 料金表一覧 UI — 原価・関係者価格・陸上部卸値 only, whichever are provided. */
export async function updateProductPrices(
  pageId: string,
  fields: { costPrice?: number | null; insiderPrice?: number | null; wholesalePrice?: number | null }
): Promise<void> {
  const notion = getNotionClient();
  await withNotionRetry(() =>
    notion.pages.update({
      page_id: pageId,
      properties: {
        ...(fields.costPrice !== undefined ? { 原価: { number: fields.costPrice } } : {}),
        ...(fields.insiderPrice !== undefined ? { 関係者価格: { number: fields.insiderPrice } } : {}),
        ...(fields.wholesalePrice !== undefined ? { 陸上部卸値: { number: fields.wholesalePrice } } : {}),
      },
    })
  );
}

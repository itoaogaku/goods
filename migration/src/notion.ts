import { Client, collectAllDataSourceRows, isFullDatabase, isFullPage } from "@notionhq/client";
import type { OrderLine } from "./types.js";

let client: Client | null = null;
let dataSourceIdCache: string | null = null;

export function getNotionClient(): Client {
  if (client) return client;
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) throw new Error("環境変数 NOTION_API_KEY が設定されていません");
  client = new Client({ auth: apiKey });
  return client;
}

/** Notion databases are queried/written through one of their "data sources" (API 2025-09+). */
export async function getDataSourceId(): Promise<string> {
  if (dataSourceIdCache) return dataSourceIdCache;

  const explicit = process.env.NOTION_DATA_SOURCE_ID;
  if (explicit) {
    dataSourceIdCache = explicit;
    return explicit;
  }

  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) {
    throw new Error("環境変数 NOTION_DATABASE_ID (または NOTION_DATA_SOURCE_ID) が設定されていません");
  }

  const notion = getNotionClient();
  const database = await notion.databases.retrieve({ database_id: databaseId });
  if (!isFullDatabase(database)) {
    throw new Error(`データベース ${databaseId} を取得できませんでした`);
  }
  const dataSource = database.data_sources[0];
  if (!dataSource) {
    throw new Error(`データベース ${databaseId} にデータソースが存在しません`);
  }
  const id = dataSource.id;
  dataSourceIdCache = id;
  return id;
}

/**
 * Fetches every 明細ID already present in the database, used to skip rows
 * that were already migrated on a previous (possibly interrupted) run.
 */
export async function fetchExistingLineIds(dataSourceId: string): Promise<Set<string>> {
  const notion = getNotionClient();
  const rows = await collectAllDataSourceRows(notion, { data_source_id: dataSourceId });

  const ids = new Set<string>();
  for (const row of rows) {
    if (!isFullPage(row)) continue;
    const prop = row.properties["明細ID"];
    if (prop?.type === "rich_text") {
      ids.add(prop.rich_text.map((t) => t.plain_text).join(""));
    }
  }
  return ids;
}

export async function createOrderLinePage(dataSourceId: string, line: OrderLine): Promise<void> {
  const notion = getNotionClient();
  await notion.pages.create({
    parent: { data_source_id: dataSourceId },
    properties: {
      取引ID: { title: [{ text: { content: line.orderId } }] },
      明細ID: { rich_text: [{ text: { content: line.lineId } }] },
      種別: { select: { name: "通常販売" } },
      日時: { date: { start: line.soldAt } },
      拠点: { select: { name: line.location } },
      商品名: { rich_text: [{ text: { content: line.productName } }] },
      数量: { number: line.quantity },
      単価: { number: line.unitPrice },
      合計金額: { number: line.totalAmount },
      ステータス: { select: { name: line.status } },
    },
  });
}

/**
 * Sets 種別=通常販売 / 拠点=水上村 on any page that predates the
 * 種別・拠点 properties (rows created by an older version of this script,
 * before ACC's inventory model was introduced). Safe to re-run — pages
 * that already have both set are left untouched.
 */
export async function backfillAccDefaults(dataSourceId: string): Promise<number> {
  const notion = getNotionClient();
  const rows = await collectAllDataSourceRows(notion, { data_source_id: dataSourceId });

  let updated = 0;
  for (const row of rows) {
    if (!isFullPage(row)) continue;
    const hasEventType = row.properties["種別"]?.type === "select" && row.properties["種別"].select;
    const hasLocation = row.properties["拠点"]?.type === "select" && row.properties["拠点"].select;
    if (hasEventType && hasLocation) continue;

    await notion.pages.update({
      page_id: row.id,
      properties: {
        ...(hasEventType ? {} : { 種別: { select: { name: "通常販売" } } }),
        ...(hasLocation ? {} : { 拠点: { select: { name: "水上村" } } }),
      },
    });
    updated += 1;
  }
  return updated;
}

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
      注文ID: { title: [{ text: { content: line.orderId } }] },
      明細ID: { rich_text: [{ text: { content: line.lineId } }] },
      販売日時: { date: { start: line.soldAt } },
      商品名: { rich_text: [{ text: { content: line.productName } }] },
      数量: { number: line.quantity },
      単価: { number: line.unitPrice },
      合計金額: { number: line.totalAmount },
      ステータス: { select: { name: line.status } },
    },
  });
}

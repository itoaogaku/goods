import {
  Client,
  collectAllDataSourceRows,
  isFullDatabase,
  isFullPage,
} from "@notionhq/client";
import type {
  GroupFilterOperatorArray,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import type { OrderStatus, SaleRecord } from "./types";

export const SALES_DATA_SINCE = process.env.SALES_DATA_SINCE ?? "2025-03-01";

let client: Client | null = null;
let dataSourceIdCache: string | null = null;

export function getNotionClient(): Client {
  if (client) return client;
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new Error("NOTION_API_KEY is not set");
  }
  client = new Client({ auth: apiKey });
  return client;
}

/**
 * Notion databases are queried through one of their "data sources" (API
 * 2025-09+). NOTION_DATA_SOURCE_ID can be set directly to skip the lookup;
 * otherwise it's resolved once from NOTION_DATABASE_ID and cached.
 */
export async function getDataSourceId(): Promise<string> {
  if (dataSourceIdCache) return dataSourceIdCache;

  const explicit = process.env.NOTION_DATA_SOURCE_ID;
  if (explicit) {
    dataSourceIdCache = explicit;
    return explicit;
  }

  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) {
    throw new Error("NOTION_DATABASE_ID (or NOTION_DATA_SOURCE_ID) is not set");
  }

  const notion = getNotionClient();
  const database = await notion.databases.retrieve({ database_id: databaseId });
  if (!isFullDatabase(database)) {
    throw new Error(`Database ${databaseId} could not be fully retrieved`);
  }
  const dataSource = database.data_sources[0];
  if (!dataSource) {
    throw new Error(`Database ${databaseId} has no data sources`);
  }
  const id = dataSource.id;
  dataSourceIdCache = id;
  return id;
}

function getPlainText(
  prop: PageObjectResponse["properties"][string] | undefined
): string {
  if (!prop) return "";
  if (prop.type === "title") {
    return prop.title.map((t) => t.plain_text).join("");
  }
  if (prop.type === "rich_text") {
    return prop.rich_text.map((t) => t.plain_text).join("");
  }
  return "";
}

function getNumber(
  prop: PageObjectResponse["properties"][string] | undefined
): number {
  if (!prop || prop.type !== "number" || prop.number === null) return 0;
  return prop.number;
}

function getDate(
  prop: PageObjectResponse["properties"][string] | undefined
): string {
  if (!prop || prop.type !== "date" || !prop.date) return "";
  return prop.date.start;
}

function getSelect(
  prop: PageObjectResponse["properties"][string] | undefined
): OrderStatus {
  if (!prop || prop.type !== "select" || !prop.select) return "未発送";
  return prop.select.name as OrderStatus;
}

export function pageToSaleRecord(page: PageObjectResponse): SaleRecord {
  const p = page.properties;
  return {
    pageId: page.id,
    orderId: getPlainText(p["注文ID"]),
    lineId: getPlainText(p["明細ID"]),
    soldAt: getDate(p["販売日時"]),
    productName: getPlainText(p["商品名"]),
    quantity: getNumber(p["数量"]),
    unitPrice: getNumber(p["単価"]),
    totalAmount: getNumber(p["合計金額"]),
    status: getSelect(p["ステータス"]),
  };
}

interface SalesFilterOptions {
  dateFrom?: string;
  dateTo?: string;
  status?: OrderStatus;
  search?: string;
}

function buildFilter(options: SalesFilterOptions): { and: GroupFilterOperatorArray } {
  const and: GroupFilterOperatorArray = [
    {
      property: "販売日時",
      date: { on_or_after: options.dateFrom ?? SALES_DATA_SINCE },
    },
  ];

  if (options.dateTo) {
    and.push({ property: "販売日時", date: { on_or_before: options.dateTo } });
  }
  if (options.status) {
    and.push({ property: "ステータス", select: { equals: options.status } });
  }
  if (options.search) {
    and.push({
      or: [
        { property: "商品名", rich_text: { contains: options.search } },
        { property: "注文ID", title: { contains: options.search } },
      ],
    });
  }

  return { and };
}

/**
 * Fetches every sale record matching the filter, using the SDK's built-in
 * data-source pagination helper (loops past Notion's 100-row page limit).
 */
export async function queryAllSales(
  options: SalesFilterOptions = {}
): Promise<SaleRecord[]> {
  const notion = getNotionClient();
  const dataSourceId = await getDataSourceId();
  const filter = buildFilter(options);

  const rows = await collectAllDataSourceRows(notion, {
    data_source_id: dataSourceId,
    filter,
  });

  return rows
    .filter(isFullPage)
    .map(pageToSaleRecord)
    .sort((a, b) => a.soldAt.localeCompare(b.soldAt));
}

/**
 * Fetches a single page of sale records for the table view, passing
 * Notion's own start_cursor straight through to the client.
 */
export async function querySalesPage(
  options: SalesFilterOptions & { cursor?: string; pageSize?: number }
) {
  const notion = getNotionClient();
  const dataSourceId = await getDataSourceId();
  const filter = buildFilter(options);

  const response = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter,
    sorts: [{ property: "販売日時", direction: "descending" }],
    page_size: options.pageSize ?? 25,
    start_cursor: options.cursor,
  });

  const records = response.results.filter(isFullPage).map(pageToSaleRecord);

  return {
    records,
    nextCursor: response.next_cursor,
    hasMore: response.has_more,
  };
}

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
import type { EventType, InventoryEvent, Ledger, Location, OrderStatus, StockBalanceEntry } from "./types";

export const SALES_DATA_SINCE = process.env.SALES_DATA_SINCE ?? "2025-03-01";

const DATABASE_ID_ENV_VAR: Record<Ledger, string> = {
  acc: "NOTION_DATABASE_ID",
  trackteam: "TRACK_TEAM_NOTION_DATABASE_ID",
};

const DATA_SOURCE_ID_ENV_VAR: Record<Ledger, string> = {
  acc: "NOTION_DATA_SOURCE_ID",
  trackteam: "TRACK_TEAM_NOTION_DATA_SOURCE_ID",
};

let client: Client | null = null;
const dataSourceIdCache = new Map<Ledger, string>();

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
 * Notion databases are queried/written through one of their "data sources"
 * (API 2025-09+). Each ledger (acc / trackteam) is its own Notion database;
 * both use the same integration/API key, just different database IDs.
 */
export async function getDataSourceId(ledger: Ledger): Promise<string> {
  const cached = dataSourceIdCache.get(ledger);
  if (cached) return cached;

  const explicit = process.env[DATA_SOURCE_ID_ENV_VAR[ledger]];
  if (explicit) {
    dataSourceIdCache.set(ledger, explicit);
    return explicit;
  }

  const databaseIdEnvVar = DATABASE_ID_ENV_VAR[ledger];
  const databaseId = process.env[databaseIdEnvVar];
  if (!databaseId) {
    throw new Error(
      `${databaseIdEnvVar} (or ${DATA_SOURCE_ID_ENV_VAR[ledger]}) is not set`
    );
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
  dataSourceIdCache.set(ledger, id);
  return id;
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

function getDate(prop: NotionProperty | undefined): string {
  if (!prop || prop.type !== "date" || !prop.date) return "";
  return prop.date.start;
}

function getSelectName(prop: NotionProperty | undefined): string | null {
  if (!prop || prop.type !== "select" || !prop.select) return null;
  return prop.select.name;
}

export function pageToInventoryEvent(page: PageObjectResponse): InventoryEvent {
  const p = page.properties;
  return {
    pageId: page.id,
    transactionId: getPlainText(p["取引ID"]),
    lineId: getPlainText(p["明細ID"]),
    eventType: (getSelectName(p["種別"]) as EventType | null) ?? "通常販売",
    occurredAt: getDate(p["日時"]),
    location: (getSelectName(p["拠点"]) as Location | null) ?? "水上村",
    destinationLocation: getSelectName(p["移動先拠点"]) as Location | null,
    productName: getPlainText(p["商品名"]),
    quantity: getNumber(p["数量"]),
    unitPrice: getNumber(p["単価"]),
    totalAmount: getNumber(p["合計金額"]),
    memo: getPlainText(p["備考"]),
    status: (getSelectName(p["ステータス"]) as OrderStatus | null) ?? "発送済",
  };
}

export interface EventFilterOptions {
  dateFrom?: string;
  dateTo?: string;
  status?: OrderStatus;
  search?: string;
  eventTypes?: EventType[];
  location?: Location;
}

function buildFilter(
  options: EventFilterOptions
): { and: GroupFilterOperatorArray } | undefined {
  const and: GroupFilterOperatorArray = [];

  if (options.dateFrom) {
    and.push({ property: "日時", date: { on_or_after: options.dateFrom } });
  }
  if (options.dateTo) {
    and.push({ property: "日時", date: { on_or_before: options.dateTo } });
  }
  if (options.status) {
    and.push({ property: "ステータス", select: { equals: options.status } });
  }
  if (options.location) {
    and.push({ property: "拠点", select: { equals: options.location } });
  }
  if (options.eventTypes && options.eventTypes.length > 0) {
    and.push({
      or: options.eventTypes.map((eventType) => ({
        property: "種別",
        select: { equals: eventType },
      })),
    });
  }
  if (options.search) {
    and.push({
      or: [
        { property: "商品名", rich_text: { contains: options.search } },
        { property: "取引ID", title: { contains: options.search } },
      ],
    });
  }

  return and.length > 0 ? { and } : undefined;
}

/**
 * Fetches every event matching the filter, using the SDK's built-in
 * data-source pagination helper (loops past Notion's 100-row page limit).
 * Pass no date bound to read the ledger's full history (needed for stock
 * balances); pass dateFrom for windowed sales reporting.
 */
export async function queryAllEvents(
  ledger: Ledger,
  options: EventFilterOptions = {}
): Promise<InventoryEvent[]> {
  const notion = getNotionClient();
  const dataSourceId = await getDataSourceId(ledger);
  const filter = buildFilter(options);

  const rows = await collectAllDataSourceRows(notion, {
    data_source_id: dataSourceId,
    filter,
  });

  return rows
    .filter(isFullPage)
    .map(pageToInventoryEvent)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

/**
 * Fetches a single page of events for the table view, passing Notion's own
 * start_cursor straight through to the client.
 */
export async function queryEventsPage(
  ledger: Ledger,
  options: EventFilterOptions & { cursor?: string; pageSize?: number }
) {
  const notion = getNotionClient();
  const dataSourceId = await getDataSourceId(ledger);
  const filter = buildFilter(options);

  const response = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter,
    sorts: [{ property: "日時", direction: "descending" }],
    page_size: options.pageSize ?? 25,
    start_cursor: options.cursor,
  });

  const records = response.results.filter(isFullPage).map(pageToInventoryEvent);

  return {
    records,
    nextCursor: response.next_cursor,
    hasMore: response.has_more,
  };
}

const STOCK_IN_TYPES: EventType[] = ["入庫"];
const OUTBOUND_TYPES: EventType[] = ["通常販売", "関係者価格販売", "プレゼント", "卸し"];

/**
 * Computes current stock balance per product x location, from the ledger's
 * complete event history (no date window — a stock-in from a year ago still
 * counts toward today's balance).
 */
export async function computeStockBalances(ledger: Ledger): Promise<StockBalanceEntry[]> {
  const events = await queryAllEvents(ledger);
  const balances = new Map<string, StockBalanceEntry>();

  function add(productName: string, location: Location, delta: number) {
    const key = `${productName}__${location}`;
    const existing = balances.get(key);
    if (existing) {
      existing.quantity += delta;
    } else {
      balances.set(key, { productName, location, quantity: delta });
    }
  }

  for (const event of events) {
    if (STOCK_IN_TYPES.includes(event.eventType)) {
      add(event.productName, event.location, event.quantity);
    } else if (OUTBOUND_TYPES.includes(event.eventType)) {
      add(event.productName, event.location, -event.quantity);
    } else if (event.eventType === "拠点間移動" && event.destinationLocation) {
      add(event.productName, event.location, -event.quantity);
      add(event.productName, event.destinationLocation, event.quantity);
    } else if (event.eventType === "棚卸調整") {
      add(event.productName, event.location, event.quantity);
    }
  }

  return [...balances.values()].sort(
    (a, b) => a.productName.localeCompare(b.productName) || a.location.localeCompare(b.location)
  );
}

export interface CreateEventInput {
  transactionId: string;
  lineId: string;
  eventType: EventType;
  occurredAt: string;
  location: Location;
  destinationLocation?: Location | null;
  productName: string;
  quantity: number;
  unitPrice?: number;
  memo?: string;
  status?: OrderStatus;
}

export async function createEvent(ledger: Ledger, event: CreateEventInput): Promise<void> {
  const notion = getNotionClient();
  const dataSourceId = await getDataSourceId(ledger);
  const unitPrice = event.unitPrice ?? 0;

  await notion.pages.create({
    parent: { data_source_id: dataSourceId },
    properties: {
      取引ID: { title: [{ text: { content: event.transactionId } }] },
      明細ID: { rich_text: [{ text: { content: event.lineId } }] },
      種別: { select: { name: event.eventType } },
      日時: { date: { start: event.occurredAt } },
      拠点: { select: { name: event.location } },
      ...(event.destinationLocation
        ? { 移動先拠点: { select: { name: event.destinationLocation } } }
        : {}),
      商品名: { rich_text: [{ text: { content: event.productName } }] },
      数量: { number: event.quantity },
      単価: { number: unitPrice },
      合計金額: { number: unitPrice * event.quantity },
      備考: { rich_text: [{ text: { content: event.memo ?? "" } }] },
      ステータス: { select: { name: event.status ?? "発送済" } },
    },
  });
}

/** Fetches every 明細ID already present in a ledger, for client-side idempotency checks. */
export async function fetchExistingLineIds(ledger: Ledger): Promise<Set<string>> {
  const events = await queryAllEvents(ledger);
  return new Set(events.map((e) => e.lineId));
}

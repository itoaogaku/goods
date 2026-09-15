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
import { generateLineId, generateTransactionId } from "./ids";
import type {
  EventType,
  InventoryEvent,
  Ledger,
  Location,
  OrderStatus,
  PurchaseOrderStatus,
  StockBalanceEntry,
} from "./types";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Notion's documented rate limit is an average of ~3 requests/second;
 * bursts (like the Wix sync writing dozens of rows back to back) can get
 * 429'd, and a 429 hitting one call tends to mean unrelated calls right
 * after it are at risk too. Retries with backoff on 429/5xx, matching
 * migration/src/migrate.ts's approach for the same underlying API.
 */
export async function withNotionRetry<T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      const status = (error as { status?: number }).status;
      const retryable = status === 429 || (typeof status === "number" && status >= 500);
      if (!retryable || attempt > maxRetries) throw error;
      await sleep(2 ** attempt * 400);
    }
  }
}

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
  const database = await withNotionRetry(() => notion.databases.retrieve({ database_id: databaseId }));
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
    customerName: getPlainText(p["顧客名"]),
    status: (getSelectName(p["ステータス"]) as OrderStatus | null) ?? "発送済",
    poStatus: getSelectName(p["発注ステータス"]) as PurchaseOrderStatus | null,
    receivedQuantity: getNumber(p["受領済み数量"]),
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

  const rows = await withNotionRetry(() =>
    collectAllDataSourceRows(notion, {
      data_source_id: dataSourceId,
      filter,
    })
  );

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

  const response = await withNotionRetry(() =>
    notion.dataSources.query({
      data_source_id: dataSourceId,
      filter,
      sorts: [{ property: "日時", direction: "descending" }],
      page_size: options.pageSize ?? 25,
      start_cursor: options.cursor,
    })
  );

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
  // Earliest 入庫(在庫追加) date per product (regardless of location) — a
  // later repeat stock-in doesn't move it, only the very first one counts.
  const firstStockInByProduct = new Map<string, string>();

  function add(productName: string, location: Location, delta: number, purchasedDelta = 0) {
    const key = `${productName}__${location}`;
    const existing = balances.get(key);
    if (existing) {
      existing.quantity += delta;
      existing.purchasedQuantity += purchasedDelta;
    } else {
      balances.set(key, { productName, location, quantity: delta, purchasedQuantity: purchasedDelta, firstStockInDate: null });
    }
  }

  for (const event of events) {
    // キャンセルされた取引は実際には成立していないので在庫を動かさない。
    if (event.status === "キャンセル") continue;

    if (STOCK_IN_TYPES.includes(event.eventType)) {
      add(event.productName, event.location, event.quantity, event.quantity);
      const prevFirst = firstStockInByProduct.get(event.productName);
      if (!prevFirst || event.occurredAt < prevFirst) {
        firstStockInByProduct.set(event.productName, event.occurredAt);
      }
    } else if (OUTBOUND_TYPES.includes(event.eventType)) {
      add(event.productName, event.location, -event.quantity);
    } else if (event.eventType === "拠点間移動" && event.destinationLocation) {
      add(event.productName, event.location, -event.quantity);
      add(event.productName, event.destinationLocation, event.quantity);
    } else if (event.eventType === "棚卸調整") {
      add(event.productName, event.location, event.quantity);
    }
  }

  for (const entry of balances.values()) {
    entry.firstStockInDate = firstStockInByProduct.get(entry.productName) ?? null;
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
  /** Wix sync only — omitted (and left blank) for manual entries. */
  customerName?: string;
  /** 発注 only, below. */
  poStatus?: PurchaseOrderStatus;
  receivedQuantity?: number;
}

export async function createEvent(ledger: Ledger, event: CreateEventInput): Promise<string> {
  const notion = getNotionClient();
  const dataSourceId = await getDataSourceId(ledger);
  const unitPrice = event.unitPrice ?? 0;

  const page = await withNotionRetry(() =>
    notion.pages.create({
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
      顧客名: { rich_text: [{ text: { content: event.customerName ?? "" } }] },
      ステータス: { select: { name: event.status ?? "発送済" } },
      ...(event.poStatus ? { 発注ステータス: { select: { name: event.poStatus } } } : {}),
      ...(event.receivedQuantity !== undefined
        ? { 受領済み数量: { number: event.receivedQuantity } }
        : {}),
    },
    })
  );
  return page.id;
}

/** Fetches every event already present in a ledger, indexed by 明細ID (for idempotency checks and diffing). */
export async function fetchExistingLineEvents(ledger: Ledger): Promise<Map<string, InventoryEvent>> {
  const events = await queryAllEvents(ledger);
  return new Map(events.map((e) => [e.lineId, e]));
}

/**
 * Updates a single event's ステータス (未発送/発送済/キャンセル/返金). This
 * is how shipping is tracked and confirmed — entirely inside this app, not
 * derived from Wix, which doesn't track fulfillment.
 */
export async function updateEventStatus(
  ledger: Ledger,
  pageId: string,
  status: OrderStatus
): Promise<void> {
  const notion = getNotionClient();
  await getDataSourceId(ledger); // validates the ledger's env vars before writing
  await withNotionRetry(() =>
    notion.pages.update({
      page_id: pageId,
      properties: {
        ステータス: { select: { name: status } },
      },
    })
  );
}

/**
 * Updates ステータス and/or 顧客名 on an already-synced line in one write.
 * Used by the Wix sync to both (a) keep status current as Wix's own
 * fulfillment/payment status changes, and (b) backfill 顧客名 on lines that
 * were created before customer-name tracking existed (fields left
 * undefined here are simply not touched).
 */
export async function updateSyncedEvent(
  ledger: Ledger,
  pageId: string,
  fields: { status?: OrderStatus; customerName?: string }
): Promise<void> {
  const notion = getNotionClient();
  await getDataSourceId(ledger); // validates the ledger's env vars before writing
  await withNotionRetry(() =>
    notion.pages.update({
      page_id: pageId,
      properties: {
        ...(fields.status ? { ステータス: { select: { name: fields.status } } } : {}),
        ...(fields.customerName !== undefined
          ? { 顧客名: { rich_text: [{ text: { content: fields.customerName } }] } }
          : {}),
      },
    })
  );
}

export async function getEvent(ledger: Ledger, pageId: string): Promise<InventoryEvent | null> {
  const notion = getNotionClient();
  await getDataSourceId(ledger); // ensures NOTION_API_KEY / ledger env vars are validated first
  const page = await withNotionRetry(() => notion.pages.retrieve({ page_id: pageId }));
  if (!isFullPage(page)) return null;
  return pageToInventoryEvent(page);
}

export interface ReceivePurchaseOrderInput {
  pageId: string;
  receivedQuantity: number;
  location: Location;
  occurredAt: string;
}

/**
 * Records a (possibly partial) delivery against an open 発注: bumps its
 * 受領済み数量 / 発注ステータス, and creates the matching 入庫 event that
 * actually adds the received quantity to stock at the given location.
 */
export async function receivePurchaseOrder(
  ledger: Ledger,
  input: ReceivePurchaseOrderInput
): Promise<InventoryEvent> {
  const notion = getNotionClient();
  const po = await getEvent(ledger, input.pageId);
  if (!po || po.eventType !== "発注") {
    throw new Error("指定された発注が見つかりません");
  }

  const newReceived = po.receivedQuantity + input.receivedQuantity;
  const newStatus: PurchaseOrderStatus = newReceived >= po.quantity ? "納品完了" : "一部納品";

  await withNotionRetry(() =>
    notion.pages.update({
      page_id: po.pageId,
      properties: {
        受領済み数量: { number: newReceived },
        発注ステータス: { select: { name: newStatus } },
      },
    })
  );

  await createEvent(ledger, {
    transactionId: generateTransactionId("RECEIVE", input.occurredAt),
    lineId: generateLineId("receive"),
    eventType: "入庫",
    occurredAt: input.occurredAt,
    location: input.location,
    productName: po.productName,
    quantity: input.receivedQuantity,
    unitPrice: po.unitPrice,
    memo: `発注 ${po.transactionId} の納品`,
    status: "発送済",
  });

  return { ...po, receivedQuantity: newReceived, poStatus: newStatus };
}

export interface DuplicateLineGroup {
  lineId: string;
  /** Page IDs sharing this 明細ID, oldest first. */
  pageIds: string[];
  productName: string;
}

/**
 * Finds every 明細ID that has more than one page in the ledger (each such
 * group should have exactly one page — 明細ID exists specifically to make
 * sync idempotent). Doesn't change anything; pair with archiveDuplicateLines
 * to actually clean them up.
 */
export async function findDuplicateLineGroups(ledger: Ledger): Promise<DuplicateLineGroup[]> {
  const notion = getNotionClient();
  const dataSourceId = await getDataSourceId(ledger);

  const rows = await withNotionRetry(() =>
    collectAllDataSourceRows(notion, { data_source_id: dataSourceId })
  );

  const byLineId = new Map<string, PageObjectResponse[]>();
  for (const row of rows) {
    if (!isFullPage(row)) continue;
    const lineId = getPlainText(row.properties["明細ID"]);
    if (!lineId) continue; // nothing to dedupe against without a key
    const group = byLineId.get(lineId) ?? [];
    group.push(row);
    byLineId.set(lineId, group);
  }

  const duplicates: DuplicateLineGroup[] = [];
  for (const [lineId, pages] of byLineId) {
    if (pages.length <= 1) continue;
    const sorted = [...pages].sort((a, b) => a.created_time.localeCompare(b.created_time));
    duplicates.push({
      lineId,
      pageIds: sorted.map((p) => p.id),
      productName: getPlainText(sorted[0].properties["商品名"]),
    });
  }

  return duplicates.sort((a, b) => a.lineId.localeCompare(b.lineId));
}

/** Archives (moves to Notion's trash — recoverable, not a permanent delete) a single page. */
export async function archivePage(pageId: string): Promise<void> {
  const notion = getNotionClient();
  await withNotionRetry(() => notion.pages.update({ page_id: pageId, archived: true }));
}

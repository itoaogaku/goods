export type OrderStatus = "未発送" | "発送済" | "キャンセル" | "返金";

/** Matches the Notion database's 拠点 select. Wix orders always ship from 水上村. */
export type Location = "水上村" | "町田" | "陸上部";

/**
 * Matches the Notion database's 種別 select. This CLI only ever imports
 * Wix order lines, so every row it creates is a 通常販売 — the other event
 * types (入庫 / 関係者価格販売 / プレゼント / 拠点間移動 / 卸し / 棚卸調整)
 * are recorded directly in the web dashboard.
 */
export type EventType =
  | "入庫"
  | "通常販売"
  | "関係者価格販売"
  | "プレゼント"
  | "拠点間移動"
  | "卸し"
  | "棚卸調整";

/**
 * One normalized order line item, independent of the source format.
 * A single Wix order with N items produces N of these, sharing orderId
 * but each with a unique lineId (used as the Notion dedup key).
 */
export interface OrderLine {
  orderId: string;
  lineId: string;
  soldAt: string; // ISO 8601 date (YYYY-MM-DD or full timestamp)
  location: Location;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: OrderStatus;
}

export interface MigrationResult {
  totalRead: number;
  created: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  failed: number;
  errors: Array<{ lineId: string; message: string }>;
}

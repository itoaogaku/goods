import type { EventType, Ledger, Location, PurchaseOrderStatus } from "./types";

/**
 * Static, client-safe configuration for each ledger (Notion database).
 * Actual database IDs live in env vars and are resolved server-side only
 * (see lib/notion.ts) — this file just describes what each ledger's UI
 * should offer.
 */
export interface LedgerConfig {
  label: string;
  shortLabel: string;
  /** Stock locations that belong to this ledger. */
  locations: Location[];
  /** Whether inter-location transfers make sense for this ledger. */
  allowTransfer: boolean;
  /** This ledger's own "卸し" 種別 — ACC wholesales to 陸上部, 陸上部 wholesales to 購買会. Each ledger's data only ever uses its own value. */
  wholesaleEventType: EventType;
}

export const LEDGERS: Ledger[] = ["acc", "trackteam"];

export const LEDGER_CONFIG: Record<Ledger, LedgerConfig> = {
  acc: {
    label: "アスリートキャリアセンター 在庫・販売管理",
    shortLabel: "ACC",
    locations: ["水上村", "町田"],
    allowTransfer: true,
    wholesaleEventType: "陸上部卸し",
  },
  trackteam: {
    label: "陸上部 在庫・販売管理",
    shortLabel: "陸上部",
    locations: ["陸上部"],
    allowTransfer: false,
    wholesaleEventType: "購買会卸し",
  },
};

export function isLedger(value: string): value is Ledger {
  return value === "acc" || value === "trackteam";
}

export const EVENT_TYPES: EventType[] = [
  "発注",
  "入庫",
  "通常販売",
  "関係者価格販売",
  "プレゼント",
  "拠点間移動",
  "陸上部卸し",
  "購買会卸し",
  "棚卸調整",
  "送料",
  "経費",
];

/** Event types that represent goods leaving inventory via a sale-like transaction. */
export const SALE_EVENT_TYPES: EventType[] = [
  "通常販売",
  "関係者価格販売",
  "プレゼント",
  "陸上部卸し",
  "購買会卸し",
];

/**
 * Event types selectable from the general "手入力記録" form, scoped to this
 * ledger's own "卸し" type (see LedgerConfig.wholesaleEventType) so ACC never
 * offers 購買会卸し and vice versa. 入庫・拠点間移動・発注 have their own
 * dedicated forms with different fields.
 */
export function manualEntryEventTypes(ledger: Ledger): EventType[] {
  return ["通常販売", "関係者価格販売", "プレゼント", LEDGER_CONFIG[ledger].wholesaleEventType, "棚卸調整"];
}

/**
 * Full EVENT_TYPES list scoped to a single ledger, for UI filter dropdowns
 * (取引・在庫履歴's 種別 filter) — excludes the OTHER ledger's own "卸し"
 * type, for the same reason as saleEventTypesFor below: it's not normally a
 * valid 種別 select option on this ledger's database, and picking it would
 * make the underlying Notion query fail.
 */
export function eventTypesFor(ledger: Ledger): EventType[] {
  const own = LEDGER_CONFIG[ledger].wholesaleEventType;
  return EVENT_TYPES.filter((t) => (t === "陸上部卸し" || t === "購買会卸し" ? t === own : true));
}

/**
 * SALE_EVENT_TYPES scoped to a single ledger's own "卸し" type, for building
 * a Notion select filter (queryAllEvents' `eventTypes` option). A ledger's
 * 種別 select property only ever gets the OTHER ledger's 卸し type added as
 * an option if someone does so by hand — normally it doesn't exist there,
 * and Notion's API rejects a select filter that names a nonexistent option
 * with a validation_error, breaking the whole query. Filtering it out here
 * keeps summary/customer-matrix queries working regardless.
 */
export function saleEventTypesFor(ledger: Ledger): EventType[] {
  const own = LEDGER_CONFIG[ledger].wholesaleEventType;
  return SALE_EVENT_TYPES.filter((t) => (t === "陸上部卸し" || t === "購買会卸し" ? t === own : true));
}

export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  "発注済み",
  "一部納品",
  "納品完了",
  "キャンセル",
];

/** 発注 rows still awaiting (full) delivery. */
export const OPEN_PO_STATUSES: PurchaseOrderStatus[] = ["発注済み", "一部納品"];

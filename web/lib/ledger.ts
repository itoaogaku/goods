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
 * Every 種別 value this ledger's own flows (manual forms, Wix sync,
 * ACC→陸上部自動連携) can actually write — 陸上部には送料(Wix限定)も
 * 拠点間移動(allowTransfer=false)も無い、ACCには相手側の卸しの種別
 * (購買会卸し)が無い、といった台帳固有の欠けが前提。scopeEventTypes
 * はこれを使って、Notionの種別select filterに相手側だけの値を絶対に
 * 含めないようにする。
 */
function ledgerEventTypes(ledger: Ledger): EventType[] {
  const config = LEDGER_CONFIG[ledger];
  return [
    "入庫",
    "通常販売",
    "関係者価格販売",
    "プレゼント",
    config.wholesaleEventType,
    "棚卸調整",
    "経費",
    ...(config.allowTransfer ? (["拠点間移動"] as const) : []),
    ...(ledger === "acc" ? (["送料"] as const) : []),
  ];
}

/**
 * Narrows a candidate 種別 list to values this ledger's database actually
 * has as select options (see ledgerEventTypes) — for building a Notion
 * select filter (queryAllEvents' `eventTypes` option) or a UI filter
 * dropdown. A select filter naming a value that isn't a real option on the
 * target database makes Notion reject the WHOLE query with a
 * validation_error, so any list mixing both ledgers' event types (like
 * SALE_EVENT_TYPES or EVENT_TYPES) must be passed through this first.
 */
export function scopeEventTypes(ledger: Ledger, types: EventType[]): EventType[] {
  const allowed = new Set(ledgerEventTypes(ledger));
  return types.filter((t) => allowed.has(t));
}

export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  "発注済み",
  "一部納品",
  "納品完了",
  "キャンセル",
];

/** 発注 rows still awaiting (full) delivery. */
export const OPEN_PO_STATUSES: PurchaseOrderStatus[] = ["発注済み", "一部納品"];

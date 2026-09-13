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
}

export const LEDGERS: Ledger[] = ["acc", "trackteam"];

export const LEDGER_CONFIG: Record<Ledger, LedgerConfig> = {
  acc: {
    label: "アスリートキャリアセンター 在庫・販売管理",
    shortLabel: "アスリートキャリアセンター",
    locations: ["水上村", "町田"],
    allowTransfer: true,
  },
  trackteam: {
    label: "陸上部 在庫・販売管理",
    shortLabel: "陸上部",
    locations: ["陸上部"],
    allowTransfer: false,
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
  "卸し",
  "棚卸調整",
  "送料",
  "経費",
];

/** Event types that represent goods leaving inventory via a sale-like transaction. */
export const SALE_EVENT_TYPES: EventType[] = ["通常販売", "関係者価格販売", "プレゼント", "卸し"];

/**
 * Event types selectable from the general "手入力記録" form — every sale-like
 * type plus 棚卸調整 (stock count correction). 入庫・拠点間移動・発注 have
 * their own dedicated forms with different fields.
 */
export const MANUAL_ENTRY_EVENT_TYPES: EventType[] = [...SALE_EVENT_TYPES, "棚卸調整"];

export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  "発注済み",
  "一部納品",
  "納品完了",
  "キャンセル",
];

/** 発注 rows still awaiting (full) delivery. */
export const OPEN_PO_STATUSES: PurchaseOrderStatus[] = ["発注済み", "一部納品"];

import type { OrderStatus } from "./types.js";

/**
 * Maps the various status strings Wix uses across CSV exports and the
 * eCommerce REST API (fulfillment status, and a few payment statuses that
 * imply the order shouldn't be treated as a normal shipped/unfulfilled sale)
 * onto the four statuses tracked in Notion.
 */
const STATUS_MAP: Record<string, OrderStatus> = {
  FULFILLED: "発送済",
  "FULLY FULFILLED": "発送済",
  発送済: "発送済",
  発送済み: "発送済",

  NOT_FULFILLED: "未発送",
  UNFULFILLED: "未発送",
  PARTIALLY_FULFILLED: "未発送",
  未発送: "未発送",

  CANCELED: "キャンセル",
  CANCELLED: "キャンセル",
  キャンセル: "キャンセル",

  REFUNDED: "返金",
  PARTIALLY_REFUNDED: "返金",
  返金: "返金",
  返金済み: "返金",
};

export function normalizeStatus(raw: string | undefined | null): OrderStatus {
  if (!raw) return "未発送";
  const key = raw.trim().toUpperCase();
  const match = STATUS_MAP[raw.trim()] ?? STATUS_MAP[key];
  return match ?? "未発送";
}

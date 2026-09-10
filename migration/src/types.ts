export type OrderStatus = "未発送" | "発送済" | "キャンセル" | "返金";

/**
 * One normalized order line item, independent of the source format.
 * A single Wix order with N items produces N of these, sharing orderId
 * but each with a unique lineId (used as the Notion dedup key).
 */
export interface OrderLine {
  orderId: string;
  lineId: string;
  soldAt: string; // ISO 8601 date (YYYY-MM-DD or full timestamp)
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

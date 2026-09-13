export type OrderStatus = "未発送" | "発送済" | "キャンセル" | "返金";

export type Ledger = "acc" | "trackteam";

/** Physical/organizational stock location. ACC owns 水上村 and 町田寮; 陸上部 is its own ledger's single location. */
export type Location = "水上村" | "町田寮" | "陸上部";

export type EventType =
  | "発注" // purchase order placed — does NOT affect stock until received
  | "入庫" // new stock registered (finished goods received)
  | "通常販売" // normal-price sale (Wix or manual)
  | "関係者価格販売" // insider/staff discounted sale
  | "プレゼント" // gift, no revenue
  | "拠点間移動" // transfer between locations within the same ledger
  | "卸し" // wholesale to another party (ACC→陸上部, 陸上部→購買会, etc.)
  | "棚卸調整" // stock count correction, signed quantity
  | "送料"; // shipping fee collected on an order (Wix sync only) — no stock impact

export type PurchaseOrderStatus = "発注済み" | "一部納品" | "納品完了" | "キャンセル";

/**
 * One row in a ledger's Notion database. Every inventory or sales change —
 * a Wix order line, a manual sale, a stock-in, a transfer, an adjustment,
 * a purchase order — is one InventoryEvent, distinguished by eventType.
 */
export interface InventoryEvent {
  pageId: string;
  transactionId: string;
  lineId: string;
  eventType: EventType;
  occurredAt: string; // ISO date string
  location: Location;
  /** Only set for 拠点間移動: the location stock moved into. */
  destinationLocation: Location | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  memo: string;
  status: OrderStatus;
  /** Wix sync only (billingInfo's name) — empty for manual entries. */
  customerName: string;
  /** 発注 only, below. */
  poStatus: PurchaseOrderStatus | null;
  receivedQuantity: number;
}

export interface MonthlyStat {
  month: string; // "2025-03"
  revenue: number;
  quantity: number;
}

export interface ProductRankingEntry {
  productName: string;
  quantity: number;
  revenue: number;
}

export interface SalesSummary {
  rangeStart: string;
  generatedAt: string;
  kpi: {
    currentMonthRevenue: number;
    cumulativeRevenue: number;
    totalQuantity: number;
    pendingCount: number;
    /** Cumulative 送料 (shipping fee) collected since rangeStart, tracked separately from product revenue. */
    shippingRevenue: number;
  };
  monthlyStats: MonthlyStat[];
  productRanking: ProductRankingEntry[];
}

export interface EventListResponse {
  records: InventoryEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface StockBalanceEntry {
  productName: string;
  location: Location;
  quantity: number;
}

/** One order's row in the customer×商品 pivot table (see /api/[ledger]/customer-matrix). */
export interface CustomerMatrixRow {
  transactionId: string;
  customerName: string;
  orderDate: string;
  /** Quantity purchased, keyed by productName — only products actually in this order are present. */
  products: Record<string, number>;
  productRevenue: number;
  shippingRevenue: number;
  total: number;
  memo: string;
}

export interface CustomerMatrixResponse {
  /** Every distinct productName across all rows, in display column order. */
  columns: string[];
  rows: CustomerMatrixRow[];
}

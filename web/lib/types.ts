export type OrderStatus = "未発送" | "発送済" | "キャンセル" | "返金";

export type Ledger = "acc" | "trackteam";

/** Physical/organizational stock location. ACC owns 水上村 and 町田; 陸上部 is its own ledger's single location. */
export type Location = "水上村" | "町田" | "陸上部";

export type EventType =
  | "発注" // purchase order placed — does NOT affect stock until received
  | "入庫" // new stock registered (finished goods received)
  | "通常販売" // normal-price sale (Wix or manual)
  | "関係者価格販売" // insider/staff discounted sale
  | "プレゼント" // gift, no revenue
  | "拠点間移動" // transfer between locations within the same ledger
  | "卸し" // wholesale to another party (ACC→陸上部, 陸上部→購買会, etc.)
  | "棚卸調整" // stock count correction, signed quantity — its own column in 現在庫, NOT folded into the real 在庫 balance
  | "送料" // shipping fee collected on an order (Wix sync only) — no stock impact
  | "経費"; // a business expense (rent, supplies, ...) — no stock impact

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
  /** Inclusive end date (YYYY-MM-DD) of the requested period, or null when unbounded (up to now). */
  rangeEnd: string | null;
  generatedAt: string;
  kpi: {
    currentMonthRevenue: number;
    cumulativeRevenue: number;
    totalQuantity: number;
    pendingCount: number;
    /** Cumulative 送料 (shipping fee) collected since rangeStart, tracked separately from product revenue. */
    shippingRevenue: number;
    /** Cumulative 経費 rows plus 入庫's own cost (単価) since rangeStart. */
    expenseTotal: number;
    /** cumulativeRevenue + shippingRevenue - expenseTotal. */
    netProfit: number;
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
  /** Cumulative 入庫 quantity only (not netted against sales/adjustments), for reference alongside the net `quantity`. */
  purchasedQuantity: number;
  /** This product's earliest 入庫 date across all locations, or null if it has never been stocked in. */
  firstStockInDate: string | null;
}

/** This row's effect on one product's stock, and the running balance right after it. */
export interface CustomerMatrixCell {
  /** Signed change from this row: negative for a sale, positive for a 入庫 stock-in. */
  delta: number;
  /** Running stock balance for this product immediately after this row, scoped to the requested location. */
  balance: number;
}

/** One order's, 入庫's, or 拠点間移動's row in the customer×商品 pivot table (see /api/[ledger]/customer-matrix). */
export interface CustomerMatrixRow {
  transactionId: string;
  customerName: string;
  orderDate: string;
  /** "order" rows have a customerName; stock-in/transfer rows generally don't. */
  rowKind: "order" | "stock-in" | "transfer";
  /** Keyed by productName — only products actually touched by this row are present. */
  products: Record<string, CustomerMatrixCell>;
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

/**
 * One product's row in the 料金表一覧 (price list). 商品名/定価 are kept in
 * sync automatically from Wix's product catalog; 原価/関係者価格/陸上部卸値
 * have no Wix equivalent and are entered by hand in this app.
 */
export interface ProductPriceEntry {
  pageId: string;
  wixProductId: string;
  productName: string;
  listPrice: number;
  costPrice: number | null;
  insiderPrice: number | null;
  wholesalePrice: number | null;
}
